import { useTaskStore } from '@entities/task/model'
import { create } from 'zustand'

export interface Column {
  id: string
  name: string
  color: string
  position: { x: number; y: number }
}

export const COLUMN_WIDTH = 300
export const COLUMN_HEIGHT = 470

// A dedicated waxy "chinagraph" family — never shared with presence or
// priority colors, so a new column can't accidentally collide with a
// teammate's cursor color or a priority signal.
const palette = ['var(--reel-1)', 'var(--reel-2)', 'var(--reel-3)', 'var(--reel-4)']

const initialColumns: Column[] = [
  { id: 'col-backlog', name: 'Backlog', color: palette[0], position: { x: 20, y: 0 } },
  { id: 'col-progress', name: 'In progress', color: palette[1], position: { x: 340, y: 0 } },
  { id: 'col-done', name: 'Done', color: palette[2], position: { x: 660, y: 0 } },
]

interface ColumnState {
  columns: Column[]
  addColumn: (name?: string) => void
  removeColumn: (id: string) => void
  moveColumnPosition: (id: string, position: { x: number; y: number }) => void
}

export const useColumnStore = create<ColumnState>((set, get) => ({
  columns: initialColumns,

  addColumn: (name) => {
    const columns = get().columns
    const color = palette[columns.length % palette.length]
    // Cascade new columns so they don't all land in the exact same spot.
    const offset = columns.length * 36
    set({
      columns: [
        ...columns,
        {
          id: crypto.randomUUID(),
          name: name?.trim() || `Колонка ${columns.length + 1}`,
          color,
          position: { x: 60 + offset, y: 480 + offset },
        },
      ],
    })
  },

  removeColumn: (id) => {
    const columns = get().columns
    if (columns.length <= 1) return
    const remaining = columns.filter((c) => c.id !== id)
    const fallback = remaining[0]
    // Tasks in the deleted column move to the first remaining one instead of vanishing.
    for (const task of useTaskStore.getState().tasks) {
      if (task.columnId === id) useTaskStore.getState().setColumn(task.id, fallback.id)
    }
    set({ columns: remaining })
  },

  moveColumnPosition: (id, position) =>
    set((state) => ({
      columns: state.columns.map((c) => (c.id === id ? { ...c, position } : c)),
    })),
}))
