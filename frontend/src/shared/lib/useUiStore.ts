import { create } from 'zustand'

export type Screen = 'login' | 'board' | 'profile'

interface UiState {
  screen: Screen
  setScreen: (screen: Screen) => void
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'login',
  setScreen: (screen) => set({ screen }),
}))
