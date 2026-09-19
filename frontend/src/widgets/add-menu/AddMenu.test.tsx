import { useColumnStore } from '@entities/column/model'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMenu } from './AddMenu'

// jsdom has no layout engine, so Floating UI measures every rect as 0x0 and
// its flip()/shift() overflow maths grinds against that degenerate geometry:
// one open of the Add menu blocked the event loop for roughly 25 seconds,
// which is what made the "menu closes" assertions look like animation
// flakiness. Collision detection is meaningless without layout, so these two
// middleware become no-ops here; placement, interactions and unmounting stay
// real, and the product keeps its actual middleware. vi.mock only applies
// from the test file that declares it, so this cannot move to test-setup.ts.
vi.mock('@floating-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@floating-ui/react')>()
  const inert = (name: string) => () => ({ name, fn: () => ({}) })
  return { ...actual, flip: inert('flip'), shift: inert('shift') }
})

// fireEvent.click (a plain synthetic `click`) is used instead of
// userEvent.click here: Floating UI's positioning + jsdom's incomplete
// layout engine make userEvent's full pointer-event simulation hang on
// this component. The click handlers only care about a `click` event.
describe('AddMenu', () => {
  beforeEach(() => {
    useColumnStore.setState({
      columns: [{ id: 'col-a', name: 'A', color: 'red', position: { x: 0, y: 0 } }],
    })
  })

  it('opens a menu with both actions when clicked', () => {
    render(<AddMenu onAddTask={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(screen.getByRole('menuitem', { name: 'Добавить задачу' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Добавить колонку' })).toBeInTheDocument()
  })

  it('calls onAddTask and closes when "Добавить задачу" is picked', async () => {
    const onAddTask = vi.fn()
    render(<AddMenu onAddTask={onAddTask} />)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Добавить задачу' }))

    expect(onAddTask).toHaveBeenCalledOnce()
    // The menu animates out, so it leaves the DOM a tick after the click.
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })

  it('adds a column and closes when "Добавить колонку" is picked', async () => {
    render(<AddMenu onAddTask={vi.fn()} />)
    const before = useColumnStore.getState().columns.length

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Добавить колонку' }))

    expect(useColumnStore.getState().columns).toHaveLength(before + 1)
    // The menu animates out, so it leaves the DOM a tick after the click.
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })
})
