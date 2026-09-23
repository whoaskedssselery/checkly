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
}

export const COLUMN_WIDTH = 300
export const COLUMN_HEIGHT = 470

/** Empty room kept under the lowest card of a column. */
const COLUMN_BOTTOM_PADDING = 36

/**
 * How tall a column is drawn: at least the standard height, and taller when
 * its cards would not fit. Derived from the cards, never stored — the column
 * shrinks back when they leave.
 */
export function columnHeight(
  column: { id: string; position: { x: number; y: number } },
  tasks: { columnId: string | null; position: { x: number; y: number } }[],
): number {
  let bottom = 0
  for (const t of tasks) {
    if (t.columnId === column.id) bottom = Math.max(bottom, t.position.y + CARD_HEIGHT)
  }
  return Math.max(COLUMN_HEIGHT, bottom - column.position.y + COLUMN_BOTTOM_PADDING)
}

export function columnHeights(
  columns: { id: string; position: { x: number; y: number } }[],
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
  columns: { id: string; position: { x: number; y: number } }[],
  heights: Record<string, number> = {},
): string | undefined {
  const cx = cardPosition.x + CARD_WIDTH / 2
  const cy = cardPosition.y + CARD_HEIGHT / 2
  return columns.find(
    (c) =>
      cx >= c.position.x &&
      cx <= c.position.x + COLUMN_WIDTH &&
      cy >= c.position.y &&
      cy <= c.position.y + (heights[c.id] ?? COLUMN_HEIGHT),
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
}

export const useColumnStore = create<ColumnState>((set, get) => ({
  columns: [],

  hydrate: (columns) => set({ columns }),

  addColumn: (name) => {
    const columns = get().columns
    // Cascade new columns so they don't all land in the exact same spot.
    const offset = columns.length * 36
    const column: Column = {
      id: `tmp-${crypto.randomUUID()}`,
      name: name?.trim() || `Колонка ${columns.length + 1}`,
      color: palette[columns.length % palette.length],
      position: { x: 60 + offset, y: 480 + offset },
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

  commitColumn: async (id) => {
    const column = get().columns.find((c) => c.id === id)
    if (!column) return
    const serverId = await realId(id)
    if (!serverId) return
    await track(api.columns.update(serverId, { position: column.position }))
  },
}))
