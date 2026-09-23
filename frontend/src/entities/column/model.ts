import { currentBoardId } from '@entities/board/model'
import { useTaskStore } from '@entities/task/model'
import { api } from '@shared/api'
import { track } from '@shared/api/sync'
import { CARD_HEIGHT, CARD_WIDTH } from '@shared/config/board'
import { create } from 'zustand'

export interface Column {
  id: string
  name: string
  color: string
  position: { x: number; y: number }
  /** Set by dragging the column's bottom edge; undefined = standard height. */
  height?: number
  /** Set by dragging a side edge; undefined = standard width. */
  width?: number
}

export const COLUMN_WIDTH = 300
export const COLUMN_HEIGHT = 470
/** Smallest a column can be made by hand. */
export const MIN_COLUMN_HEIGHT = 240
/** Narrowest a column can be made: a card (250) plus its margins. */
export const MIN_COLUMN_WIDTH = 290

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The column's rectangle after dragging one of its edges/corners by (dx, dy)
 * canvas units. Dragging the left or top edge moves the column's origin so the
 * opposite edge stays put; nothing goes below the minimum size.
 */
export function resizeRect(dir: ResizeDir, start: Rect, dx: number, dy: number): Rect {
  let { x, y, width, height } = start
  if (dir.includes('e')) width = Math.max(MIN_COLUMN_WIDTH, start.width + dx)
  if (dir.includes('w')) {
    width = Math.max(MIN_COLUMN_WIDTH, start.width - dx)
    x = start.x + (start.width - width)
  }
  if (dir.includes('s')) height = Math.max(MIN_COLUMN_HEIGHT, start.height + dy)
  if (dir.includes('n')) {
    height = Math.max(MIN_COLUMN_HEIGHT, start.height - dy)
    y = start.y + (start.height - height)
  }
  return { x, y, width, height }
}

/** Empty space kept between two columns so they never touch. */
export const COLUMN_GAP = 8

export interface PlacedColumn extends Rect {
  id: string
}

/** Do two columns overlap, or come closer than the gap? */
export function columnsOverlap(a: Rect, b: Rect, gap = COLUMN_GAP): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  )
}

/** Where every column is and how big it is drawn (including growth from its cards). */
export function columnRects(
  columns: { id: string; position: { x: number; y: number }; width?: number; height?: number }[],
  tasks: { columnId: string | null; position: { x: number; y: number } }[],
): PlacedColumn[] {
  return columns.map((c) => ({
    id: c.id,
    x: c.position.x,
    y: c.position.y,
    width: columnWidth(c),
    height: columnHeight(c, tasks),
  }))
}

/**
 * Stop a column at its neighbours. Given where the column is (`current`) and
 * where the pointer wants it (`proposed`), returns the furthest point along
 * that path that does not run into another column. A column that already
 * overlaps something (older data) is left unconstrained rather than frozen.
 */
export function limitToFreeSpace(current: Rect, proposed: Rect, others: Rect[]): Rect {
  const blocked = (r: Rect) => others.some((o) => columnsOverlap(r, o))
  if (blocked(current) || !blocked(proposed)) return proposed
  const at = (t: number): Rect => ({
    x: current.x + (proposed.x - current.x) * t,
    y: current.y + (proposed.y - current.y) * t,
    width: current.width + (proposed.width - current.width) * t,
    height: current.height + (proposed.height - current.height) * t,
  })
  let free = 0
  let hit = 1
  for (let i = 0; i < 24; i++) {
    const mid = (free + hit) / 2
    if (blocked(at(mid))) hit = mid
    else free = mid
  }
  return at(free)
}

/** A spot for a new column: to the right of the rightmost one, on the top row. */
export function nextColumnPosition(
  columns: { position: { x: number; y: number }; width?: number }[],
): { x: number; y: number } {
  if (columns.length === 0) return { x: 20, y: 0 }
  return {
    x: Math.max(...columns.map((c) => c.position.x + columnWidth(c))) + 20,
    y: Math.min(...columns.map((c) => c.position.y)),
  }
}

export const columnWidth = (column: { width?: number }): number => column.width ?? COLUMN_WIDTH
/**
 * How far below a column's bottom edge a dropped card still counts as being in
 * it. This is what lets a card be dragged down to make its column grow: the
 * card joins, and the column then stretches to hold it.
 */
const DROP_ALLOWANCE = 90

/** Empty room kept under the lowest card of a column. */
const COLUMN_BOTTOM_PADDING = 36

/**
 * How tall a column is drawn: at least the standard height, and taller when
 * its cards would not fit. Derived from the cards, never stored — the column
 * shrinks back when they leave.
 */
export function columnHeight(
  column: { id: string; position: { x: number; y: number }; height?: number },
  tasks: { columnId: string | null; position: { x: number; y: number } }[],
): number {
  let bottom = 0
  for (const t of tasks) {
    if (t.columnId === column.id) bottom = Math.max(bottom, t.position.y + CARD_HEIGHT)
  }
  return Math.max(
    column.height ?? COLUMN_HEIGHT,
    bottom - column.position.y + COLUMN_BOTTOM_PADDING,
  )
}

export function columnHeights(
  columns: { id: string; position: { x: number; y: number }; height?: number }[],
  tasks: { columnId: string | null; position: { x: number; y: number } }[],
): Record<string, number> {
  return Object.fromEntries(columns.map((c) => [c.id, columnHeight(c, tasks)]))
}

/**
 * The column a dropped card belongs to: the one its CENTRE is inside, or
 * undefined when it was dropped in the gap between columns. Using the centre
 * (not a corner) means a card hanging half out of a column does not count as
 * still being in it. `heights` carries grown columns; without it the standard
 * height is used.
 */
export function columnAtCard(
  cardPosition: { x: number; y: number },
  columns: { id: string; position: { x: number; y: number }; height?: number; width?: number }[],
  heights: Record<string, number> = {},
): string | undefined {
  const cx = cardPosition.x + CARD_WIDTH / 2
  const cy = cardPosition.y + CARD_HEIGHT / 2
  return columns.find(
    (c) =>
      cx >= c.position.x &&
      cx <= c.position.x + columnWidth(c) &&
      cy >= c.position.y &&
      cy <= c.position.y + (heights[c.id] ?? c.height ?? COLUMN_HEIGHT) + DROP_ALLOWANCE,
  )?.id
}

// A dedicated waxy "chinagraph" family — never shared with presence or
// priority colors, so a new column can't accidentally collide with a
// teammate's cursor color or a priority signal.
// Hex, not CSS variables: board_columns.color is VARCHAR(7) in the database.
// Values mirror --reel-1..4 in app/styles/_tokens.scss.
const palette = ['#d9a441', '#cfc6b2', '#9aa35e', '#8d97a3']

const pendingCreates = new Map<string, Promise<string | undefined>>()

async function realId(id: string): Promise<string | undefined> {
  return pendingCreates.has(id) ? pendingCreates.get(id) : id
}

/**
 * Free-floating cards (no column) that a column now covers: when a column is
 * moved over them they become part of it. Cards that already belong to
 * another column are left alone — they travel with that one.
 */
export function freeCardsInside<
  T extends { id: string; columnId: string | null; position: { x: number; y: number } },
>(column: { id: string; position: { x: number; y: number } }, tasks: T[], height?: number): T[] {
  const heights = height === undefined ? {} : { [column.id]: height }
  return tasks.filter(
    (t) => t.columnId === null && columnAtCard(t.position, [column], heights) === column.id,
  )
}

interface ColumnState {
  columns: Column[]
  /** Replace the whole list with what the server returned. */
  hydrate: (columns: Column[]) => void
  addColumn: (name?: string) => void
  removeColumn: (id: string) => void
  /** Local-only, called on every drag tick. Persist with `commitColumn`. */
  moveColumnPosition: (id: string, position: { x: number; y: number }) => void
  /** Write a column's current position to the server (drag end). */
  commitColumn: (id: string) => Promise<void>
  /** Local-only, called while an edge is being dragged. Persist with `commitColumnSize`. */
  resizeColumn: (id: string, rect: Rect) => void
  /** Save the column's position and size (resize end). */
  commitColumnSize: (id: string) => Promise<void>
}

export const useColumnStore = create<ColumnState>((set, get) => ({
  columns: [],

  hydrate: (columns) => set({ columns }),

  addColumn: (name) => {
    const columns = get().columns
    const column: Column = {
      id: `tmp-${crypto.randomUUID()}`,
      name: name?.trim() || `Колонка ${columns.length + 1}`,
      color: palette[columns.length % palette.length],
      position: nextColumnPosition(columns),
    }
    set({ columns: [...columns, column] })

    const { name: colName, color, position } = column
    const request = track(
      api.columns.create(currentBoardId(), { name: colName, color, position }),
      () => set((state) => ({ columns: state.columns.filter((c) => c.id !== column.id) })),
    ).then((created) => {
      pendingCreates.delete(column.id)
      if (!created) return undefined
      set((state) => ({
        columns: state.columns.map((c) => (c.id === column.id ? { ...c, id: created.id } : c)),
      }))
      return created.id
    })
    pendingCreates.set(column.id, request)
  },

  removeColumn: (id) => {
    const columns = get().columns
    if (columns.length <= 1) return
    const removed = columns.find((c) => c.id === id)
    if (!removed) return
    const remaining = columns.filter((c) => c.id !== id)
    const fallback = remaining[0]
    // Tasks in the deleted column move to the first remaining one instead of
    // vanishing — the server refuses to delete a non-empty column (409), so
    // they are re-homed first and the delete follows.
    const moved = useTaskStore.getState().tasks.filter((t) => t.columnId === id)
    for (const task of moved) {
      useTaskStore.getState().setColumn(task.id, fallback.id)
    }
    set({ columns: remaining })

    void (async () => {
      const serverId = await realId(id)
      if (!serverId) return
      const rollback = () => {
        set((state) => ({ columns: [...state.columns, removed] }))
        for (const task of moved) useTaskStore.getState().setColumn(task.id, id)
      }
      await Promise.all(moved.map((t) => useTaskStore.getState().commitTask(t.id)))
      await track(api.columns.remove(serverId), rollback)
    })()
  },

  moveColumnPosition: (id, position) =>
    set((state) => ({
      columns: state.columns.map((c) => (c.id === id ? { ...c, position } : c)),
    })),

  resizeColumn: (id, rect) =>
    set((state) => ({
      columns: state.columns.map((c) =>
        c.id === id
          ? {
              ...c,
              position: { x: rect.x, y: rect.y },
              width: Math.max(MIN_COLUMN_WIDTH, Math.round(rect.width)),
              height: Math.max(MIN_COLUMN_HEIGHT, Math.round(rect.height)),
            }
          : c,
      ),
    })),

  commitColumnSize: async (id) => {
    const column = get().columns.find((c) => c.id === id)
    if (!column) return
    const serverId = await realId(id)
    if (!serverId) return
    await track(
      api.columns.update(serverId, {
        position: column.position,
        ...(column.width !== undefined && { width: column.width }),
        ...(column.height !== undefined && { height: column.height }),
      }),
    )
  },

  commitColumn: async (id) => {
    const column = get().columns.find((c) => c.id === id)
    if (!column) return
    const serverId = await realId(id)
    if (!serverId) return
    await track(api.columns.update(serverId, { position: column.position }))
  },
}))
