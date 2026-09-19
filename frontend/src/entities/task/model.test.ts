import { beforeEach, describe, expect, it } from 'vitest'
import { useTaskStore } from './model'

const baseline = useTaskStore.getState().tasks

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: baseline })
  })

  it('starts with mock tasks', () => {
    expect(useTaskStore.getState().tasks.length).toBeGreaterThan(0)
  })

  it('moveTask updates only the target task position', () => {
    const { moveTask } = useTaskStore.getState()
    moveTask('task-1', { x: 999, y: 999 })
    const task1 = useTaskStore.getState().tasks.find((t) => t.id === 'task-1')
    const task2 = useTaskStore.getState().tasks.find((t) => t.id === 'task-2')
    expect(task1?.position).toEqual({ x: 999, y: 999 })
    expect(task2?.position).not.toEqual({ x: 999, y: 999 })
  })

  it('setColumn reassigns a task and bumps updatedAt', () => {
    const before = useTaskStore.getState().tasks.find((t) => t.id === 'task-1')
    useTaskStore.getState().setColumn('task-1', 'col-done')
    const after = useTaskStore.getState().tasks.find((t) => t.id === 'task-1')
    expect(after?.columnId).toBe('col-done')
    expect(after?.updatedAt).not.toBe(before?.updatedAt)
  })

  it('createTask adds a new task with the given fields and position', () => {
    const before = useTaskStore.getState().tasks.length
    useTaskStore.getState().createTask(
      {
        title: 'New task',
        description: undefined,
        columnId: 'col-backlog',
        priority: 'low',
        tags: ['qa'],
        dueDate: undefined,
      },
      { x: 10, y: 20 },
    )
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(before + 1)
    const created = tasks.at(-1)
    expect(created).toMatchObject({
      title: 'New task',
      columnId: 'col-backlog',
      priority: 'low',
      tags: ['qa'],
      position: { x: 10, y: 20 },
    })
    expect(created?.id).toBeTruthy()
  })

  it('updateTask merges the patch into the existing task', () => {
    useTaskStore.getState().updateTask('task-1', {
      title: 'Renamed',
      description: undefined,
      columnId: 'col-backlog',
      priority: 'high',
      tags: [],
      dueDate: undefined,
    })
    const updated = useTaskStore.getState().tasks.find((t) => t.id === 'task-1')
    expect(updated?.title).toBe('Renamed')
    expect(updated?.priority).toBe('high')
  })

  it('deleteTask removes the task and leaves the rest untouched', () => {
    const before = useTaskStore.getState().tasks.length
    useTaskStore.getState().deleteTask('task-1')
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(before - 1)
    expect(tasks.find((t) => t.id === 'task-1')).toBeUndefined()
  })
})
