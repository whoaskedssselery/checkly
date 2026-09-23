import { stubTaskWrites } from '@app/test-api'
import { useColumnStore } from '@entities/column/model'
import { type Task, useTaskStore } from '@entities/task/model'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskFormModal } from './TaskFormModal'

const columns = [
  { id: 'col-a', name: 'Backlog', color: 'red', position: { x: 0, y: 0 } },
  { id: 'col-b', name: 'Done', color: 'green', position: { x: 300, y: 0 } },
]

const existingTask: Task = {
  id: 'task-1',
  boardId: 'b1',
  columnId: 'col-a',
  title: 'Existing task',
  description: 'Some detail',
  priority: 'medium',
  tags: ['frontend', 'urgent'],
  dueDate: '2026-09-20',
  position: { x: 20, y: 20 },
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

describe('TaskFormModal', () => {
  beforeEach(() => {
    useColumnStore.setState({ columns })
    useTaskStore.setState({ tasks: [existingTask] })
    stubTaskWrites()
  })

  it('creates a task with the entered fields', async () => {
    const onClose = vi.fn()
    render(<TaskFormModal onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Название'), 'New task')
    await userEvent.selectOptions(screen.getByLabelText('Колонка'), 'col-b')
    await userEvent.selectOptions(screen.getByLabelText('Приоритет'), 'high')
    await userEvent.type(screen.getByLabelText('Теги (через запятую)'), 'design, urgent')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    const created = useTaskStore.getState().tasks.find((t) => t.title === 'New task')
    expect(created).toMatchObject({
      columnId: 'col-b',
      priority: 'high',
      tags: ['design', 'urgent'],
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('rejects a whitespace-only title (the server would refuse it too)', async () => {
    render(<TaskFormModal onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Название'), '    ')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Укажите название')).toBeInTheDocument()
    expect(useTaskStore.getState().tasks).toHaveLength(1)
  })

  it('rejects a title over 255 characters', async () => {
    render(<TaskFormModal onClose={vi.fn()} />)

    await userEvent.click(screen.getByLabelText('Название'))
    await userEvent.paste('x'.repeat(256))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Не длиннее 255 символов')).toBeInTheDocument()
  })

  it('rejects an empty title without calling createTask', async () => {
    const onClose = vi.fn()
    render(<TaskFormModal onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Укажите название')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(useTaskStore.getState().tasks).toHaveLength(1)
  })

  it('pre-fills the form and saves changes when editing an existing task', async () => {
    const onClose = vi.fn()
    render(<TaskFormModal task={existingTask} onClose={onClose} />)

    expect(screen.getByLabelText('Название')).toHaveValue('Existing task')
    expect(screen.getByRole('heading', { name: 'Редактировать задачу' })).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Название'))
    await userEvent.type(screen.getByLabelText('Название'), 'Renamed task')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(useTaskStore.getState().tasks[0].title).toBe('Renamed task')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('deletes the task when editing', async () => {
    const onClose = vi.fn()
    render(<TaskFormModal task={existingTask} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes without changes when cancelled', async () => {
    const onClose = vi.fn()
    render(<TaskFormModal task={existingTask} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(useTaskStore.getState().tasks[0].title).toBe('Existing task')
  })
})

describe('TaskFormModal: changing the column moves the card', () => {
  beforeEach(() => {
    useColumnStore.setState({ columns })
    useTaskStore.setState({ tasks: [existingTask] })
    stubTaskWrites()
  })

  it('puts the card into the new column area, not just relabels it', async () => {
    render(<TaskFormModal task={existingTask} onClose={vi.fn()} />)

    await userEvent.selectOptions(screen.getByLabelText('Колонка'), 'col-b')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    const moved = useTaskStore.getState().tasks[0]
    expect(moved.columnId).toBe('col-b')
    // column B starts at x=300, so the card must sit inside it (x 300..600)
    expect(moved.position.x).toBeGreaterThanOrEqual(300)
    expect(moved.position.x).toBeLessThan(600)
  })

  it('"Без колонки" takes the card out of the column area, not just off its label', async () => {
    render(<TaskFormModal task={existingTask} onClose={vi.fn()} />)

    await userEvent.selectOptions(screen.getByLabelText('Колонка'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    const moved = useTaskStore.getState().tasks[0]
    expect(moved.columnId).toBeNull()
    // columns start at y=0; the free card must be clear of them (above the row)
    expect(moved.position.y + 132).toBeLessThanOrEqual(0)
  })

  it('creates a card with no column', async () => {
    render(<TaskFormModal onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Название'), 'Свободная')
    await userEvent.selectOptions(screen.getByLabelText('Колонка'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    const created = useTaskStore.getState().tasks.find((t) => t.title === 'Свободная')
    expect(created?.columnId).toBeNull()
  })

  it('keeps the position when the column is not changed', async () => {
    render(<TaskFormModal task={existingTask} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(useTaskStore.getState().tasks[0].position).toEqual({ x: 20, y: 20 })
  })
})
