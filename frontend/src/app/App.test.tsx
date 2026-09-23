import { useColumnStore } from '@entities/column/model'
import { useTaskStore } from '@entities/task/model'
import { useUserStore } from '@entities/user/model'
import { DEMO_EMAIL, DEMO_PASSWORD, resetMockDb } from '@shared/api/mock'
import { useUiStore } from '@shared/lib/useUiStore'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

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

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    resetMockDb()
    useUserStore.setState({ user: null, error: null })
    useUiStore.setState({ screen: 'login' })
    useColumnStore.setState({
      columns: [{ id: 'col-a', name: 'Backlog', color: 'red', position: { x: 0, y: 0 } }],
    })
    useTaskStore.setState({ tasks: [] })
  })

  it('renders the login screen by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
  })

  it('jumps straight to the board when a user is already logged in', async () => {
    useUserStore.setState({
      user: { id: '1', name: 'Коржнев', email: 'k@c.dev', avatarColor: '' },
    })
    render(<App />)
    expect(await screen.findByText('на доске сейчас')).toBeInTheDocument()
  })

  it('logging in moves from the login screen to the board', async () => {
    render(<App />)

    await userEvent.type(screen.getByLabelText('Email'), DEMO_EMAIL)
    await userEvent.type(screen.getByLabelText('Пароль'), DEMO_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('на доске сейчас')).toBeInTheDocument()
  })
})
