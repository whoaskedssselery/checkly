import { create } from 'zustand'

export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  [key: string]: unknown
  id: string
  boardId: string
  columnId: string
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

// Sample data only — clearly mock, never presented as real user content.
const mockTasks: Task[] = [
  {
    id: 'task-1',
    boardId: 'board-1',
    columnId: 'col-done',
    title: 'Собрать макет доски',
    description: 'Набросать структуру канваса и карточек',
    priority: 'medium',
    tags: ['design'],
    position: { x: 686, y: 86 },
    dueDate: '2026-09-15',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-16T09:00:00Z',
  },
  {
    id: 'task-2',
    boardId: 'board-1',
    columnId: 'col-progress',
    title: 'Настроить React Flow',
    description: 'Подключить канвас, пан/зум, кастомные ноды',
    priority: 'high',
    tags: ['frontend'],
    position: { x: 366, y: 86 },
    dueDate: '2026-09-18',
    createdAt: '2026-09-11T09:00:00Z',
    updatedAt: '2026-09-17T09:00:00Z',
  },
  {
    id: 'task-3',
    boardId: 'board-1',
    columnId: 'col-progress',
    title: 'Схема БД для задач',
    description: 'Таблицы users/boards/tasks, миграции',
    priority: 'high',
    tags: ['backend'],
    position: { x: 366, y: 252 },
    dueDate: '2026-09-18',
    createdAt: '2026-09-11T09:00:00Z',
    updatedAt: '2026-09-17T09:00:00Z',
  },
  {
    id: 'task-4',
    boardId: 'board-1',
    columnId: 'col-backlog',
    title: 'Presence-курсоры',
    description: 'Мок живых участников на канвасе',
    priority: 'medium',
    tags: ['frontend'],
    position: { x: 46, y: 86 },
    dueDate: '2026-09-27',
    createdAt: '2026-09-12T09:00:00Z',
    updatedAt: '2026-09-12T09:00:00Z',
  },
  {
    id: 'task-5',
    boardId: 'board-1',
    columnId: 'col-backlog',
    title: 'Фильтры и поиск',
    priority: 'low',
    tags: ['frontend'],
    position: { x: 46, y: 252 },
    createdAt: '2026-09-12T09:00:00Z',
    updatedAt: '2026-09-12T09:00:00Z',
  },
]

interface TaskState {
  tasks: Task[]
  moveTask: (id: string, position: { x: number; y: number }) => void
  setColumn: (id: string, columnId: string) => void
  createTask: (input: TaskInput, position: { x: number; y: number }) => void
  updateTask: (id: string, patch: TaskInput) => void
  deleteTask: (id: string) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: mockTasks,

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

  createTask: (input, position) =>
    set((state) => {
      const now = new Date().toISOString()
      const task: Task = {
        id: crypto.randomUUID(),
        boardId: 'board-1',
        position,
        createdAt: now,
        updatedAt: now,
        ...input,
      }
      return { tasks: [...state.tasks, task] }
    }),

  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      ),
    })),

  deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}))

export const priorityLabel: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}
