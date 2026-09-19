import { create } from 'zustand'

export interface User {
  id: string
  name: string
  email: string
  avatarColor: string
}

const STORAGE_KEY = 'checkly:mock-user'

interface UserState {
  user: User | null
  login: (email: string, name?: string) => void
  logout: () => void
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export const useUserStore = create<UserState>((set) => ({
  user: readStoredUser(),
  login: (email, name) => {
    const user: User = {
      id: crypto.randomUUID(),
      name: name?.trim() || email.split('@')[0],
      email,
      avatarColor: 'var(--accent)',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    set({ user })
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null })
  },
}))
