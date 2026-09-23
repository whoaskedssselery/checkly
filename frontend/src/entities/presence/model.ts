import { create } from 'zustand'

/** Someone else looking at a board right now, and where their pointer is. */
export interface PresenceUser {
  [key: string]: unknown
  /** One per open tab (a person with two tabs open is two clients). */
  id: string
  userId: string
  boardId: string
  name: string
  color: string
  cursor: { x: number; y: number }
  lastSeen: number
}

interface PresenceState {
  peers: Record<string, PresenceUser>
  upsert: (peer: PresenceUser) => void
  remove: (id: string) => void
  /** Drop peers not heard from since `olderThan` (they closed the tab / crashed). */
  prune: (olderThan: number) => void
  clear: () => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
  peers: {},
  upsert: (peer) => set((s) => ({ peers: { ...s.peers, [peer.id]: peer } })),
  remove: (id) =>
    set((s) => {
      if (!(id in s.peers)) return s
      const { [id]: _gone, ...rest } = s.peers
      return { peers: rest }
    }),
  prune: (olderThan) =>
    set((s) => {
      const kept = Object.fromEntries(
        Object.entries(s.peers).filter(([, p]) => p.lastSeen >= olderThan),
      )
      return Object.keys(kept).length === Object.keys(s.peers).length ? s : { peers: kept }
    }),
  clear: () => set({ peers: {} }),
}))

/** People on `boardId`, one entry per person, nearest-heard first. */
export function peersOnBoard(
  peers: Record<string, PresenceUser>,
  boardId: string | undefined,
): PresenceUser[] {
  if (!boardId) return []
  return Object.values(peers)
    .filter((p) => p.boardId === boardId)
    .sort((a, b) => b.lastSeen - a.lastSeen)
}
