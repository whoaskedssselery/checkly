import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { type ZoneData, ZoneNode } from './ZoneNode'

function setup(over: Partial<ZoneData> = {}) {
  const data: ZoneData = {
    label: 'Backlog',
    color: '#d9a441',
    count: 0,
    x: 100,
    y: 50,
    width: 300,
    height: 470,
    canDelete: true,
    onDelete: vi.fn(),
    onResize: vi.fn(),
    onResizeEnd: vi.fn(),
    ...over,
  }
  render(
    <ReactFlowProvider>
      <ZoneNode data={data} />
    </ReactFlowProvider>,
  )
  return data
}

describe('ZoneNode resize handles', () => {
  it('has a keyboard-reachable handle on each of the four edges', () => {
    setup()
    expect(screen.getAllByRole('separator')).toHaveLength(4)
    for (const name of [
      'Изменить высоту колонки сверху',
      'Изменить высоту колонки снизу',
      'Изменить ширину колонки слева',
      'Изменить ширину колонки справа',
    ]) {
      expect(screen.getByRole('separator', { name })).toHaveAttribute('tabindex', '0')
    }
  })

  it('bottom edge: ArrowDown makes the column taller, ArrowUp shorter, and each saves', () => {
    const data = setup()
    const handle = screen.getByRole('separator', { name: 'Изменить высоту колонки снизу' })

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(data.onResize).toHaveBeenLastCalledWith({ x: 100, y: 50, width: 300, height: 494 })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(data.onResize).toHaveBeenLastCalledWith({ x: 100, y: 50, width: 300, height: 446 })
    expect(data.onResizeEnd).toHaveBeenCalledTimes(2)
  })

  it('right edge: ArrowRight widens; left edge: ArrowLeft widens and moves the origin left', () => {
    const data = setup()
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Изменить ширину колонки справа' }), {
      key: 'ArrowRight',
    })
    expect(data.onResize).toHaveBeenLastCalledWith({ x: 100, y: 50, width: 324, height: 470 })

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Изменить ширину колонки слева' }), {
      key: 'ArrowLeft',
    })
    expect(data.onResize).toHaveBeenLastCalledWith({ x: 76, y: 50, width: 324, height: 470 })
  })

  it('top edge: ArrowUp makes it taller and moves the origin up', () => {
    const data = setup()
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Изменить высоту колонки сверху' }), {
      key: 'ArrowUp',
    })
    expect(data.onResize).toHaveBeenLastCalledWith({ x: 100, y: 26, width: 300, height: 494 })
  })

  it('an edge ignores arrows that do not belong to its axis', () => {
    const data = setup()
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Изменить высоту колонки снизу' }), {
      key: 'ArrowLeft',
    })
    expect(data.onResize).not.toHaveBeenCalled()
  })
})
