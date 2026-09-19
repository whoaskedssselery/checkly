import { useUserStore } from '@entities/user/model'
import { useUiStore } from '@shared/lib/useUiStore'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProfilePage } from './ProfilePage'

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ screen: 'profile' })
  })

  it('shows a guest placeholder when no user is logged in', () => {
    useUserStore.setState({ user: null })
    render(<ProfilePage />)

    expect(screen.getByText('Гость')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows the logged-in user name and email', () => {
    useUserStore.setState({
      user: {
        id: '1',
        name: 'Коржнев',
        email: 'korzhnev@checkly.dev',
        avatarColor: 'var(--accent)',
      },
    })
    render(<ProfilePage />)

    expect(screen.getByText('Коржнев')).toBeInTheDocument()
    expect(screen.getByText('korzhnev@checkly.dev')).toBeInTheDocument()
  })

  it('navigates back to the board', async () => {
    useUserStore.setState({ user: null })
    render(<ProfilePage />)

    await userEvent.click(screen.getByRole('button', { name: 'Назад к доске' }))

    expect(useUiStore.getState().screen).toBe('board')
  })

  it('logs out and returns to the login screen', async () => {
    useUserStore.setState({
      user: {
        id: '1',
        name: 'Коржнев',
        email: 'korzhnev@checkly.dev',
        avatarColor: 'var(--accent)',
      },
    })
    render(<ProfilePage />)

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(useUserStore.getState().user).toBeNull()
    expect(useUiStore.getState().screen).toBe('login')
  })
})
