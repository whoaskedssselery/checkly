import { api, describeApiError } from '@shared/api'
import { runSessionStart, sessionArea, setToken, setUnauthorizedHandler } from '@shared/api/session'
import { create } from 'zustand'

export interface User {
  id: string
  name: string
  email: string
  avatarColor: string
}

const STORAGE_KEY = 'checkly:user'

interface UserState {
  user: User | null
  /** Text of the last failed login/register, for the form to show. */
  error: string | null
  login: (email: string, password: string) => Promise<boolean>
  register: (name: string, email: string, password: string) => Promise<boolean>
  clearError: () => void
  logout: () => void
}

function readStoredUser(): User | null {
  try {
    const raw = sessionArea().getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function persist(user: User | null): void {
  try {
    if (user) sessionArea().setItem(STORAGE_KEY, JSON.stringify(user))
    else sessionArea().removeItem(STORAGE_KEY)
  } catch {
    // storage blocked — the session simply won't survive a reload
  }
}

export const useUserStore = create<UserState>((set) => {
  const finish = async (request: ReturnType<typeof api.auth.login>): Promise<boolean> => {
    set({ error: null })
    try {
      const { token, user } = await request
      setToken(token)
      try {
        await runSessionStart()
      } catch (err) {
        // Authenticated, but the board would not load: not a usable session.
        setToken(null)
        throw err
      }
      persist(user)
      set({ user })
      return true
    } catch (err) {
      set({ error: describeApiError(err) })
      return false
    }
  }

  return {
    user: readStoredUser(),
    error: null,
    login: (email, password) => finish(api.auth.login({ email, password })),
    register: (name, email, password) => finish(api.auth.register({ name, email, password })),
    clearError: () => set({ error: null }),
    logout: () => {
      // Revoke the refresh token on the server (fire and forget), then forget everything here.
      void api.auth.logout()
      setToken(null)
      persist(null)
      set({ user: null, error: null })
    },
  }
})

// A 401 on any protected request means the token is dead: drop the session.
setUnauthorizedHandler(() => useUserStore.getState().logout())
