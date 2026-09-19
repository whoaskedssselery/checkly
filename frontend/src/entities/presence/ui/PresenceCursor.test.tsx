import { render, screen } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { PresenceUser } from '../model'
import { PresenceCursor } from './PresenceCursor'

const baseNodeProps = {
  id: 'p1',
  type: 'presence',
  selected: false,
  dragging: false,
  draggable: false,
  selectable: false,
  deletable: false,
  zIndex: 10,
  isConnectable: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
} satisfies Omit<NodeProps, 'data'>

const user: PresenceUser = {
  id: 'p1',
  name: 'Карчевский',
  color: '#d1558f',
  cursor: { x: 300, y: 120 },
}

describe('PresenceCursor', () => {
  it('shows the participant name and their initial', () => {
    render(<PresenceCursor {...baseNodeProps} data={user} />)

    expect(screen.getByText('Карчевский')).toBeInTheDocument()
    expect(screen.getByText('К')).toBeInTheDocument()
  })
})
