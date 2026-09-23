import { stubTaskWrites } from '@app/test-api'
import { ApiError, api } from '@shared/api'
import { useSyncStore } from '@shared/api/sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { freeSpotPosition, nextTaskPosition, type Task, useTaskStore } from './model'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  boardId: 'board-1',
  columnId: 'col-a',
  title: `Task ${id}`,
  priority: 'medium',
  tags: [],
  position: { x: 0, y: 0 },
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
})

const input = {
  title: 'New task',
  description: undefined,
  columnId: 'col-a',
  priority: 'low' as const,
  tags: ['qa'],
  dueDate: undefined,
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [task('t1'), task('t2', { position: { x: 5, y: 5 } })] })
    useSyncStore.setState({ pending: 0, error: null })
    stubTaskWrites()
  })

  it('hydrate replaces the list', () => {
    useTaskStore.getState().hydrate([task('x')])
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['x'])
  })

  it('moveTask updates only the target task position and does not call the api', () => {
    useTaskStore.getState().moveTask('t1', { x: 999, y: 999 })
    const [t1, t2] = useTaskStore.getState().tasks
    expect(t1.position).toEqual({ x: 999, y: 999 })
    expect(t2.position).toEqual({ x: 5, y: 5 })
    expect(api.tasks.update).not.toHaveBeenCalled()
  })

  it('setColumn reassigns a task and bumps updatedAt', () => {
    useTaskStore.getState().setColumn('t1', 'col-done')
    const after = useTaskStore.getState().tasks[0]
    expect(after.columnId).toBe('col-done')
    expect(after.updatedAt).not.toBe('2026-09-01T00:00:00Z')
  })

  it('commitTask sends the final position and column in one request', async () => {
    useTaskStore.getState().moveTask('t1', { x: 40, y: 50 })
    useTaskStore.getState().setColumn('t1', 'col-done')
    await useTaskStore.getState().commitTask('t1')
    expect(api.tasks.update).toHaveBeenCalledTimes(1)
    expect(api.tasks.update).toHaveBeenCalledWith('t1', {
      position: { x: 40, y: 50 },
      columnId: 'col-done',
    })
  })

  it('createTask shows the card at once, then swaps the temporary id for the server id', async () => {
    useTaskStore.getState().createTask(input, { x: 10, y: 20 })
    const optimistic = useTaskStore.getState().tasks.at(-1)
    expect(optimistic).toMatchObject({ title: 'New task', position: { x: 10, y: 20 } })
    expect(optimistic?.id.startsWith('tmp-')).toBe(true)

    await flush()
    const saved = useTaskStore.getState().tasks.at(-1)
    expect(saved?.id).toBe('srv-1')
    expect(saved).toMatchObject({ columnId: 'col-a', priority: 'low', tags: ['qa'] })
    expect(api.tasks.create).toHaveBeenCalledWith('board-1', {
      ...input,
      position: { x: 10, y: 20 },
    })
  })

  it('createTask removes the card and reports the error when the server rejects it', async () => {
    vi.spyOn(api.tasks, 'create').mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'bad'))
    useTaskStore.getState().createTask(input, { x: 1, y: 1 })
    expect(useTaskStore.getState().tasks).toHaveLength(3)

    await flush()
    expect(useTaskStore.getState().tasks).toHaveLength(2)
    expect(useSyncStore.getState().error).toBe('Проверьте введённые данные')
  })

  it('editing a card that is still being created waits for its real id', async () => {
    useTaskStore.getState().createTask(input, { x: 1, y: 1 })
    const tempId = useTaskStore.getState().tasks.at(-1)?.id as string
    useTaskStore.getState().updateTask(tempId, { ...input, title: 'Renamed early' })

    await flush()
    expect(api.tasks.update).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ title: 'Renamed early' }),
    )
  })

  it('updateTask merges the patch, then rolls back if the server refuses', async () => {
    vi.spyOn(api.tasks, 'update').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'gone'))
    useTaskStore.getState().updateTask('t1', { ...input, title: 'Renamed', priority: 'high' })
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ title: 'Renamed', priority: 'high' })

    await flush()
    expect(useTaskStore.getState().tasks[0].title).toBe('Task t1')
    expect(useSyncStore.getState().error).toContain('не найден')
  })

  it('deleteTask removes the task, and puts it back if the server refuses', async () => {
    useTaskStore.getState().deleteTask('t1')
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['t2'])
    await flush()
    expect(api.tasks.remove).toHaveBeenCalledWith('t1')

    vi.spyOn(api.tasks, 'remove').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'))
    useTaskStore.getState().deleteTask('t2')
    await flush()
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['t2'])
    expect(useSyncStore.getState().error).toBe('Нет связи с сервером')
  })
})

describe('nextTaskPosition', () => {
  const column = { id: 'col-a', position: { x: 20, y: 0 } }

  it('uses the first slot of an empty column', () => {
    expect(nextTaskPosition(column, [])).toEqual({ x: 46, y: 86 })
  })

  it('lands below the lowest card, clear of it (regression: cards used to stack)', () => {
    const cards = [
      { columnId: 'col-a', position: { x: 46, y: 86 } },
      { columnId: 'col-a', position: { x: 46, y: 252 } },
    ]
    const next = nextTaskPosition(column, cards)
    // a card is 132px tall — the new one must start below the old one's bottom edge
    expect(next.y).toBeGreaterThanOrEqual(252 + 132)
  })

  it('is not fooled by a card that was dragged elsewhere or by other columns', () => {
    const cards = [
      { columnId: 'col-a', position: { x: 46, y: 86 } },
      { columnId: 'col-a', position: { x: 46, y: 400 } },
      { columnId: 'col-b', position: { x: 366, y: 900 } },
    ]
    expect(nextTaskPosition(column, cards).y).toBeGreaterThanOrEqual(400 + 132)
    expect(nextTaskPosition(column, cards).y).toBeLessThan(900)
  })
})

describe('dragging a column', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [
        task('in-a1', { columnId: 'col-a', position: { x: 46, y: 86 } }),
        task('in-a2', { columnId: 'col-a', position: { x: 46, y: 252 } }),
        task('in-b', { columnId: 'col-b', position: { x: 366, y: 86 } }),
      ],
    })
    stubTaskWrites()
  })

  it('shiftColumnTasks moves every card of that column by the same delta and no others', () => {
    useTaskStore.getState().shiftColumnTasks('col-a', 100, -20)
    const byId = Object.fromEntries(useTaskStore.getState().tasks.map((t) => [t.id, t.position]))
    expect(byId['in-a1']).toEqual({ x: 146, y: 66 })
    expect(byId['in-a2']).toEqual({ x: 146, y: 232 })
    expect(byId['in-b']).toEqual({ x: 366, y: 86 })
  })

  it('a zero move changes nothing', () => {
    const before = useTaskStore.getState().tasks
    useTaskStore.getState().shiftColumnTasks('col-a', 0, 0)
    expect(useTaskStore.getState().tasks).toBe(before)
  })

  it('commitColumnTasks saves each card of the column once, with its new position', async () => {
    useTaskStore.getState().shiftColumnTasks('col-a', 10, 10)
    await useTaskStore.getState().commitColumnTasks('col-a')
    expect(api.tasks.update).toHaveBeenCalledTimes(2)
    expect(api.tasks.update).toHaveBeenCalledWith('in-a1', {
      position: { x: 56, y: 96 },
      columnId: 'col-a',
    })
  })
})

describe('free-floating cards and moving between columns', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [task('t1', { columnId: 'col-a', position: { x: 46, y: 86 } })],
    })
    stubTaskWrites()
  })

  it('a card can be set to no column (dropped outside every column) and the api is told', async () => {
    useTaskStore.getState().moveTask('t1', { x: 900, y: 900 })
    useTaskStore.getState().setColumn('t1', null)
    await useTaskStore.getState().commitTask('t1')
    expect(useTaskStore.getState().tasks[0].columnId).toBeNull()
    expect(api.tasks.update).toHaveBeenCalledWith('t1', {
      position: { x: 900, y: 900 },
      columnId: null,
    })
  })

  it('a free-floating card does NOT travel with a column that is dragged', () => {
    useTaskStore.setState({
      tasks: [
        task('in', { columnId: 'col-a', position: { x: 50, y: 50 } }),
        task('free', { columnId: null, position: { x: 500, y: 50 } }),
      ],
    })
    useTaskStore.getState().shiftColumnTasks('col-a', 100, 100)
    const byId = Object.fromEntries(useTaskStore.getState().tasks.map((t) => [t.id, t.position]))
    expect(byId.in).toEqual({ x: 150, y: 150 })
    expect(byId.free).toEqual({ x: 500, y: 50 })
  })

  it('updateTask can move the card too, and sends the new position to the server', async () => {
    useTaskStore.getState().updateTask('t1', {
      ...input,
      columnId: 'col-b',
      position: { x: 366, y: 86 },
    })
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      columnId: 'col-b',
      position: { x: 366, y: 86 },
    })
    await flush()
    expect(api.tasks.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ columnId: 'col-b', position: { x: 366, y: 86 } }),
    )
  })
})

describe('freeSpotPosition', () => {
  const columns = [{ position: { x: 20, y: 0 } }, { position: { x: 340, y: 0 } }]

  it('is clear of the columns (above them)', () => {
    const p = freeSpotPosition(columns, [])
    expect(p.y + 132).toBeLessThanOrEqual(0)
  })

  it('does not stack on a free card already there: the next one goes alongside', () => {
    const first = freeSpotPosition(columns, [])
    const second = freeSpotPosition(columns, [{ columnId: null, position: first }])
    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThanOrEqual(first.x + 250)
  })

  it('cards inside columns do not block the free row', () => {
    const p = freeSpotPosition(columns, [{ columnId: 'a', position: { x: 46, y: 86 } }])
    expect(p).toEqual(freeSpotPosition(columns, []))
  })
})
