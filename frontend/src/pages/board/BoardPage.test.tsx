import { useColumnStore } from '@entities/column/model'
import { useTaskStore } from '@entities/task/model'
import { useUserStore } from '@entities/user/model'
import { useUiStore } from '@shared/lib/useUiStore'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardPage } from './BoardPage'

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

describe('BoardPage', () => {
  beforeEach(() => {
    useColumnStore.setState({
      columns: [{ id: 'col-a', name: 'Backlog', color: 'red', position: { x: 0, y: 0 } }],
    })
    useTaskStore.setState({ tasks: [] })
    useUserStore.setState({ user: { id: '1', name: 'Коржнев', email: 'k@c.dev', avatarColor: '' } })
    useUiStore.setState({ screen: 'board' })
  })

  it('shows the simulated participants on the live-presence strip', () => {
    render(<BoardPage />)
    expect(screen.getByText('на доске сейчас')).toBeInTheDocument()
    expect(screen.getByTitle('Карчевский')).toBeInTheDocument()
    expect(screen.getByTitle('Панов')).toBeInTheDocument()
  })

  it('opens the task creation modal from the Add menu', () => {
    render(<BoardPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Добавить задачу' }))

    expect(screen.getByRole('heading', { name: 'Новая задача' })).toBeInTheDocument()
  })

  it('navigates to the profile screen from the avatar button', async () => {
    render(<BoardPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))

    expect(useUiStore.getState().screen).toBe('profile')
  })
})
