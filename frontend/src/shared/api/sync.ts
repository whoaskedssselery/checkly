import { create } from 'zustand'
import { describeApiError } from './errors'

/**
 * Tracks background writes. The stores update the screen first (optimistic),
 * so a failed write must be surfaced somewhere — this is where it lands.
 */
interface SyncState {
  pending: number
  error: string | null
  dismiss: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  pending: 0,
  error: null,
  dismiss: () => set({ error: null }),
}))

/** Run a write, counting it as pending; on failure report it and call `rollback`. */
export async function track<T>(write: Promise<T>, rollback?: () => void): Promise<T | undefined> {
  useSyncStore.setState((s) => ({ pending: s.pending + 1 }))
  try {
    return await write
  } catch (err) {
    rollback?.()
    useSyncStore.setState({ error: describeApiError(err) })
    return undefined
  } finally {
    useSyncStore.setState((s) => ({ pending: s.pending - 1 }))
  }
}
