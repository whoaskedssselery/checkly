import { describe, expect, it } from 'vitest'
import { useUiStore } from './useUiStore'

describe('useUiStore', () => {
  it('defaults to the login screen', () => {
    useUiStore.setState({ screen: 'login' })
    expect(useUiStore.getState().screen).toBe('login')
  })

  it('setScreen switches the active screen', () => {
    useUiStore.getState().setScreen('board')
    expect(useUiStore.getState().screen).toBe('board')

    useUiStore.getState().setScreen('profile')
    expect(useUiStore.getState().screen).toBe('profile')
  })
})
