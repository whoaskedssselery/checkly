import { beforeEach, describe, expect, it } from 'vitest'
import { useUserStore } from './model'

describe('useUserStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useUserStore.setState({ user: null })
  })

  it('login derives a display name from the email when none is given', () => {
    useUserStore.getState().login('korzhnev@checkly.dev')
    expect(useUserStore.getState().user).toMatchObject({
      name: 'korzhnev',
      email: 'korzhnev@checkly.dev',
    })
  })

  it('login prefers an explicit name over the email-derived one', () => {
    useUserStore.getState().login('korzhnev@checkly.dev', 'Михаил')
    expect(useUserStore.getState().user?.name).toBe('Михаил')
  })

  it('login persists the user to localStorage', () => {
    useUserStore.getState().login('korzhnev@checkly.dev')
    const stored = JSON.parse(localStorage.getItem('checkly:mock-user') ?? 'null')
    expect(stored?.email).toBe('korzhnev@checkly.dev')
  })

  it('logout clears both state and localStorage', () => {
    useUserStore.getState().login('korzhnev@checkly.dev')
    useUserStore.getState().logout()
    expect(useUserStore.getState().user).toBeNull()
    expect(localStorage.getItem('checkly:mock-user')).toBeNull()
  })
})
