import { stubColumnWrites, stubTaskWrites } from '@app/test-api'
import { useColumnStore } from '@entities/column/model'
import { useTaskStore } from '@entities/task/model'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardCanvas } from './BoardCanvas'

const columns = [
  { id: 'col-a', name: 'Backlog', color: 'red', position: { x: 0, y: 0 } },
  { id: 'col-b', name: 'Done', color: 'green', position: { x: 300, y: 0 } },
]

const tasks = [
  {
    id: 'task-1',
    boardId: 'b1',
    columnId: 'col-a',
    title: 'Собрать макет',
    priority: 'medium' as const,
    tags: [],
    position: { x: 20, y: 20 },
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

// React Flow nodes wire up d3-drag on mount, which doesn't play well with
// jsdom's incomplete pointer-event model. fireEvent dispatches a plain
// `click` (what our onClick handlers actually listen for) without the
// full pointer-down/up sequence userEvent simulates, sidestepping that
// incompatibility while still exercising the real click handlers.
describe('BoardCanvas', () => {
  beforeEach(() => {
    useColumnStore.setState({ columns })
    stubColumnWrites()
    stubTaskWrites()
    useTaskStore.setState({ tasks })
  })

  it('renders every column with its task count', () => {
    render(<BoardCanvas onTaskClick={vi.fn()} />)

    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders the task card inside the canvas', () => {
    render(<BoardCanvas onTaskClick={vi.fn()} />)
    expect(screen.getByText('Собрать макет')).toBeInTheDocument()
  })

  it('calls onTaskClick with the task when a card is clicked', () => {
    const onTaskClick = vi.fn()
    render(<BoardCanvas onTaskClick={onTaskClick} />)

    fireEvent.click(screen.getByText('Собрать макет'))

    expect(onTaskClick).toHaveBeenCalledOnce()
    expect(onTaskClick.mock.calls[0][0]).toMatchObject({ id: 'task-1' })
  })

  it('removes a column from the board when its delete button is clicked', () => {
    render(<BoardCanvas onTaskClick={vi.fn()} />)

    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить колонку' })
    fireEvent.click(deleteButtons[1])

    expect(useColumnStore.getState().columns.map((c) => c.id)).toEqual(['col-a'])
  })

  it("disables the delete button on the board's last column", () => {
    useColumnStore.setState({ columns: [columns[0]] })
    render(<BoardCanvas onTaskClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Удалить колонку' })).toBeDisabled()
  })
})
