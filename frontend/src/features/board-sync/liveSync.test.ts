import { useUserStore } from '@entities/user/model'
import { useSyncStore } from '@shared/api/sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshOpenBoard = vi.fn().mockResolvedValue(undefined)
vi.mock('./boardSync', () => ({ refreshOpenBoard: () => refreshOpenBoard() }))

const { requestBoardRefresh } = await import('./liveSync')

describe('requestBoardRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refreshOpenBoard.mockClear()
    useUserStore.setState({ user: { id: 'u', name: 'A', email: 'a@b.co', avatarColor: '#000000' } })
    useSyncStore.setState({ pending: 0, interacting: false, error: null })
  })
  afterEach(() => {
    vi.useRealTimers()
    useUserStore.setState({ user: null })
  })

  it('reloads the board after a short debounce, once, however many changes arrive', async () => {
    requestBoardRefresh()
    requestBoardRefresh()
    requestBoardRefresh()
    await vi.advanceTimersByTimeAsync(130)
    expect(refreshOpenBoard).toHaveBeenCalledTimes(1)
  })

  it('waits while this tab has writes in flight, then reloads', async () => {
    useSyncStore.setState({ pending: 1 })
    requestBoardRefresh()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refreshOpenBoard).not.toHaveBeenCalled()

    useSyncStore.setState({ pending: 0 })
    await vi.advanceTimersByTimeAsync(400)
    expect(refreshOpenBoard).toHaveBeenCalledTimes(1)
  })

  it('waits while a card is being dragged or a column resized, so nothing jumps under the pointer', async () => {
    useSyncStore.getState().setInteracting(true)
    requestBoardRefresh()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refreshOpenBoard).not.toHaveBeenCalled()

    useSyncStore.getState().setInteracting(false)
    await vi.advanceTimersByTimeAsync(400)
    expect(refreshOpenBoard).toHaveBeenCalledTimes(1)
  })

  it('does nothing when nobody is signed in', async () => {
    useUserStore.setState({ user: null })
    requestBoardRefresh()
    await vi.advanceTimersByTimeAsync(500)
    expect(refreshOpenBoard).not.toHaveBeenCalled()
  })

  it('a failed reload keeps what is on screen and does not throw', async () => {
    refreshOpenBoard.mockRejectedValueOnce(new Error('offline'))
    requestBoardRefresh()
    await expect(vi.advanceTimersByTimeAsync(200)).resolves.not.toThrow()
  })
})
