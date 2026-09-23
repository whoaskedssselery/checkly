import { currentBoardId } from '@entities/board/model'
import { api } from '@shared/api'
import { track } from '@shared/api/sync'
import { CARD_HEIGHT, CARD_WIDTH } from '@shared/config/board'
import { create } from 'zustand'

export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  [key: string]: unknown
  id: string
  boardId: string
  /** null = a free-floating card: it belongs to no column and never moves with one. */
  columnId: string | null
  title: string
  description?: string
  priority: TaskPriority
  tags: string[]
  position: { x: number; y: number }
  dueDate?: string
  createdAt: string
  updatedAt: string
}

export type TaskInput = Pick<
  Task,
  'title' | 'description' | 'columnId' | 'priority' | 'tags' | 'dueDate'
>

const CARD_GAP = 34

/**
 * Where a new card lands in a column: directly under the lowest card already
 * there, or at the column's first slot when it is empty. Counting cards
 * instead would stack a new one on top of a card that was dragged elsewhere.
 */
export function nextTaskPosition(
  column: { id: string; position: { x: number; y: number } },
  tasks: Pick<Task, 'columnId' | 'position'>[],
): { x: number; y: number } {
  const x = column.position.x + 26
  const inColumn = tasks.filter((t) => t.columnId === column.id)
  if (inColumn.length === 0) return { x, y: column.position.y + 86 }
  return { x, y: Math.max(...inColumn.map((t) => t.position.y)) + CARD_HEIGHT + CARD_GAP }
}

/**
 * Where a card that belongs to no column is put: in a row just above the
 * columns, at the first spot not already taken by another free card. Used when
 * a card is taken out of its column from the form, so it really leaves the
 * column instead of staying visually inside it.
 */
export function freeSpotPosition(
  columns: { position: { x: number; y: number } }[],
  tasks: Pick<Task, 'columnId' | 'position'>[],
): { x: number; y: number } {
  const top = columns.length ? Math.min(...columns.map((c) => c.position.y)) : 0
  const left = columns.length ? Math.min(...columns.map((c) => c.position.x)) : 0
  const y = top - CARD_HEIGHT - 60
  const free = tasks.filter((t) => t.columnId === null)
  for (let slot = 0; ; slot++) {
    const x = left + 26 + slot * (CARD_WIDTH + 24)
    const taken = free.some(
      (t) => Math.abs(t.position.x - x) < CARD_WIDTH && Math.abs(t.position.y - y) < CARD_HEIGHT,
    )
    if (!taken) return { x, y }
  }
}

// A card created offline-first carries a temporary id until the server answers
// with the real one. Any later write to that card waits for this promise so it
// never targets an id the server has not heard of.
const pendingCreates = new Map<string, Promise<string | undefined>>()

async function realId(id: string): Promise<string | undefined> {
  return pendingCreates.has(id) ? pendingCreates.get(id) : id
}

interface TaskState {
  tasks: Task[]
  /** Replace the whole list with what the server returned. */
  hydrate: (tasks: Task[]) => void
  /** Local-only, called on every drag tick. Persist with `commitTask`. */
  moveTask: (id: string, position: { x: number; y: number }) => void
  /** Local-only: every card in a column follows when the column is dragged. */
  shiftColumnTasks: (columnId: string, dx: number, dy: number) => void
  /** Write the position of every card in a column (column drag end). */
  commitColumnTasks: (columnId: string) => Promise<void>
  /** Local-only column change while dragging. Persist with `commitTask`. */
  setColumn: (id: string, columnId: string | null) => void
  /** Write a card's current position + column to the server (drag end). */
  commitTask: (id: string) => Promise<void>
  createTask: (input: TaskInput, position: { x: number; y: number }) => void
  /** Edit a card. Pass `position` when the edit also moves it (e.g. to another column). */
  updateTask: (id: string, patch: TaskInput & { position?: { x: number; y: number } }) => void
  deleteTask: (id: string) => void
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],

  hydrate: (tasks) => set({ tasks }),

  moveTask: (id, position) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, position } : t)),
    })),

  setColumn: (id, columnId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, columnId, updatedAt: new Date().toISOString() } : t,
      ),
    })),

  shiftColumnTasks: (columnId, dx, dy) => {
    if (dx === 0 && dy === 0) return
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.columnId === columnId
          ? { ...t, position: { x: t.position.x + dx, y: t.position.y + dy } }
          : t,
      ),
    }))
  },

  commitColumnTasks: async (columnId) => {
    const ids = get()
      .tasks.filter((t) => t.columnId === columnId)
      .map((t) => t.id)
    await Promise.all(ids.map((id) => get().commitTask(id)))
  },

  commitTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    const { position, columnId } = task
    const serverId = await realId(id)
    if (!serverId) return
    await track(api.tasks.update(serverId, { position, columnId }))
  },

  createTask: (input, position) => {
    const now = new Date().toISOString()
    const tempId = `tmp-${crypto.randomUUID()}`
    const task: Task = {
      ...input,
      id: tempId,
      boardId: currentBoardId(),
      position,
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ tasks: [...state.tasks, task] }))

    const request = track(api.tasks.create(currentBoardId(), { ...input, position }), () =>
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== tempId) })),
    ).then((created) => {
      pendingCreates.delete(tempId)
      if (!created) return undefined
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === tempId
            ? { ...t, id: created.id, createdAt: created.createdAt, updatedAt: created.updatedAt }
            : t,
        ),
      }))
      return created.id
    })
    pendingCreates.set(tempId, request)
  },

  updateTask: (id, patch) => {
    const before = get().tasks.find((t) => t.id === id)
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      ),
    }))
    void realId(id).then((serverId) => {
      if (!serverId) return
      return track(api.tasks.update(serverId, patch), () => {
        if (before) set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? before : t)) }))
      })
    })
  },

  deleteTask: (id) => {
    const before = get().tasks.find((t) => t.id === id)
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))
    void realId(id).then((serverId) => {
      if (!serverId) return
      return track(api.tasks.remove(serverId), () => {
        if (before) set((state) => ({ tasks: [...state.tasks, before] }))
      })
    })
  },
}))

export const priorityLabel: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}
