import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { Task } from '../model'
import { TaskCard, type TaskCardData } from './TaskCard'

const task: Task = {
  id: 't1',
  boardId: 'b1',
  columnId: 'col-progress',
  title: 'Тестовая задача',
  priority: 'high',
  tags: ['frontend'],
  dueDate: '2026-09-27',
  position: { x: 0, y: 0 },
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
}

function renderCard(data: TaskCardData, dragging = false) {
  return render(
    <ReactFlowProvider>
      <TaskCard
        id={data.id}
        data={data}
        type="task"
        selected={false}
        dragging={dragging}
        draggable
        selectable
        deletable
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>,
  )
}

describe('TaskCard', () => {
  it('renders title, priority label, tag and due date', () => {
    renderCard(task)

    expect(screen.getByText('Тестовая задача')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('#frontend')).toBeInTheDocument()
    expect(screen.getByText('09-27')).toBeInTheDocument()
  })

  it('renders without a tag or due date when the task has none', () => {
    renderCard({ ...task, tags: [], dueDate: undefined })

    expect(screen.queryByText(/^#/)).not.toBeInTheDocument()
    expect(screen.queryByText('09-27')).not.toBeInTheDocument()
  })

  it('accepts a resolved column color without crashing', () => {
    renderCard({ ...task, columnColor: '#c6791e' })
    expect(screen.getByText('Тестовая задача')).toBeInTheDocument()
  })
})
