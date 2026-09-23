import { useUserStore } from '@entities/user/model'
import { DEMO_EMAIL, DEMO_PASSWORD, resetMockDb } from '@shared/api/mock'
import { useUiStore } from '@shared/lib/useUiStore'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetMockDb()
    useUserStore.setState({ user: null, error: null })
    useUiStore.setState({ screen: 'login' })
  })

  it('defaults to the login tab without a name field', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Имя')).not.toBeInTheDocument()
  })

  it('switches to registration and shows the name field', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Регистрация' }))

    expect(screen.getByRole('heading', { name: 'Регистрация' })).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toBeInTheDocument()
  })

  it('rejects an invalid email without logging in', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Пароль'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Некорректный email')).toBeInTheDocument()
    expect(useUserStore.getState().user).toBeNull()
  })

  it('rejects a short password', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Пароль'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Минимум 6 символов')).toBeInTheDocument()
  })

  it('logs in and switches to the board screen on valid submit', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), DEMO_EMAIL)
    await userEvent.type(screen.getByLabelText('Пароль'), DEMO_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(useUiStore.getState().screen).toBe('board'))
    expect(useUserStore.getState().user?.email).toBe(DEMO_EMAIL)
  })

  it('shows the server error and stays on the form for a wrong password', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), DEMO_EMAIL)
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль')
    expect(useUiStore.getState().screen).toBe('login')
  })

  it('registers a new account from the registration tab', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Регистрация' }))

    await userEvent.type(screen.getByLabelText('Имя'), 'Новый')
    await userEvent.type(screen.getByLabelText('Email'), 'new@checkly.dev')
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret12')
    await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(useUiStore.getState().screen).toBe('board'))
    expect(useUserStore.getState().user).toMatchObject({ name: 'Новый', email: 'new@checkly.dev' })
  })

  it('reports an already-registered email on the registration tab', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Регистрация' }))

    await userEvent.type(screen.getByLabelText('Email'), DEMO_EMAIL)
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret12')
    await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Этот email уже зарегистрирован')
  })
})
