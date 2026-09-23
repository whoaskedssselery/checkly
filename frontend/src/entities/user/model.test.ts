import { ApiError, api } from '@shared/api'
import { DEMO_EMAIL, DEMO_PASSWORD, resetMockDb } from '@shared/api/mock'
import { getToken, setSessionStartHandler, setToken } from '@shared/api/session'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUserStore } from './model'

describe('useUserStore', () => {
  beforeEach(() => {
    localStorage.clear()
    resetMockDb()
    useUserStore.setState({ user: null, error: null })
  })

  it('login stores the user and the token, and persists the user', async () => {
    const ok = await useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)
    expect(ok).toBe(true)
    expect(useUserStore.getState().user).toMatchObject({ email: DEMO_EMAIL })
    expect(getToken()).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem('checkly:user') ?? 'null')?.email).toBe(DEMO_EMAIL)
  })

  it('login matches the email case-insensitively', async () => {
    expect(await useUserStore.getState().login('DEMO@Checkly.DEV', DEMO_PASSWORD)).toBe(true)
  })

  it('a wrong password fails with one generic message and no session', async () => {
    const ok = await useUserStore.getState().login(DEMO_EMAIL, 'wrong-password')
    expect(ok).toBe(false)
    expect(useUserStore.getState().user).toBeNull()
    expect(useUserStore.getState().error).toBe('Неверный email или пароль')
    expect(getToken()).toBeNull()
  })

  it('an unknown email gets the same message as a wrong password', async () => {
    await useUserStore.getState().login('nobody@checkly.dev', 'whatever1')
    expect(useUserStore.getState().error).toBe('Неверный email или пароль')
  })

  it('register creates an account, uses the given name, and logs in', async () => {
    const ok = await useUserStore.getState().register('Михаил', 'new@checkly.dev', 'secret12')
    expect(ok).toBe(true)
    expect(useUserStore.getState().user).toMatchObject({ name: 'Михаил', email: 'new@checkly.dev' })
  })

  it('register derives a name from the email when none is given', async () => {
    await useUserStore.getState().register('  ', 'korzhnev@checkly.dev', 'secret12')
    expect(useUserStore.getState().user?.name).toBe('korzhnev')
  })

  it('register refuses a taken email even in a different letter case', async () => {
    const ok = await useUserStore.getState().register('X', 'DEMO@checkly.dev', 'secret12')
    expect(ok).toBe(false)
    expect(useUserStore.getState().error).toBe('Этот email уже зарегистрирован')
  })

  it('never keeps the password in the store or in storage', async () => {
    await useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)
    expect(JSON.stringify(useUserStore.getState().user)).not.toContain(DEMO_PASSWORD)
    expect(sessionStorage.getItem('checkly:user')).not.toContain(DEMO_PASSWORD)
  })

  it('logout clears state, user and token', async () => {
    await useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)
    useUserStore.getState().logout()
    expect(useUserStore.getState().user).toBeNull()
    expect(sessionStorage.getItem('checkly:user')).toBeNull()
    expect(getToken()).toBeNull()
  })
})

describe('useUserStore session start', () => {
  beforeEach(() => {
    localStorage.clear()
    resetMockDb()
    useUserStore.setState({ user: null, error: null })
  })

  afterEach(() => setSessionStartHandler(null))

  it('a login only counts once the session-start handler (board load) has finished', async () => {
    let finish: () => void = () => {}
    setSessionStartHandler(() => new Promise<void>((resolve) => (finish = resolve)))

    const pending = useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)
    await new Promise((r) => setTimeout(r, 10))
    expect(useUserStore.getState().user).toBeNull()

    finish()
    expect(await pending).toBe(true)
    expect(useUserStore.getState().user).not.toBeNull()
  })

  it('if the board cannot be loaded the login fails and leaves no token behind', async () => {
    setSessionStartHandler(() => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'offline')))
    expect(await useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)).toBe(false)
    expect(useUserStore.getState().user).toBeNull()
    expect(useUserStore.getState().error).toBe('Нет связи с сервером')
    expect(getToken()).toBeNull()
  })
})

describe('useUserStore session expiry', () => {
  beforeEach(() => {
    localStorage.clear()
    resetMockDb()
    useUserStore.setState({ user: null, error: null })
  })

  it('a 401 from any protected call logs the user out', async () => {
    await useUserStore.getState().login(DEMO_EMAIL, DEMO_PASSWORD)
    expect(useUserStore.getState().user).not.toBeNull()

    setToken(null) // the token disappears (expired / cleared in another tab)
    await api.boards.get('board-1').catch(() => {})

    expect(useUserStore.getState().user).toBeNull()
  })
})
