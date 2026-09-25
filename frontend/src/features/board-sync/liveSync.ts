import { useUserStore } from '@entities/user/model'
import { isMockApi } from '@shared/api'
import { onMockDbChange } from '@shared/api/mock'
import { useSyncStore } from '@shared/api/sync'
import { refreshOpenBoard } from './boardSync'

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Reload the open board because someone else changed it. Calls are debounced,
 * and a reload waits while this tab has writes in flight or a drag/resize in
 * progress — an optimistic card or a half-dragged column is never overwritten
 * by a stale copy; it retries shortly instead.
 */
export function requestBoardRefresh(delay = 120): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    if (!useUserStore.getState().user) return
    const { pending, interacting } = useSyncStore.getState()
    if (pending > 0 || interacting) return requestBoardRefresh(300)
    try {
      await refreshOpenBoard()
    } catch {
      // a failed refresh just keeps what is on screen
    }
  }, delay)
}

/**
 * Live updates on the mock: writes made by OTHER tabs (the stand-in for a
 * server push). With the real backend the push arrives as a socket message —
 * see features/presence/socketPresence.ts, which calls requestBoardRefresh.
 */
export function startLiveSync(): () => void {
  if (!isMockApi) return () => {}
  const stop = onMockDbChange(() => requestBoardRefresh())
  return () => {
    stop()
    if (timer) clearTimeout(timer)
    timer = null
  }
}
