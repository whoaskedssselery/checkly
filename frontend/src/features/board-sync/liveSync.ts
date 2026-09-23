import { useUserStore } from '@entities/user/model'
import { isMockApi } from '@shared/api'
import { onMockDbChange } from '@shared/api/mock'
import { useSyncStore } from '@shared/api/sync'
import { refreshOpenBoard } from './boardSync'

/**
 * Live updates: when someone else changes the board, reload it.
 *
 * On the mock this listens to writes from other tabs (the stand-in for a
 * server push); with a real backend the same hook would be a WebSocket
 * message. A reload is skipped while this tab has writes in flight, so an
 * optimistic card is never overwritten by a stale copy — it retries shortly.
 */
export function startLiveSync(): () => void {
  if (!isMockApi) return () => {}

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      if (!useUserStore.getState().user) return
      if (useSyncStore.getState().pending > 0) return schedule(300)
      try {
        await refreshOpenBoard()
      } catch {
        // a failed refresh just keeps what is on screen
      }
    }, delay)
  }

  const stop = onMockDbChange(() => schedule(120))
  return () => {
    stop()
    if (timer) clearTimeout(timer)
  }
}
