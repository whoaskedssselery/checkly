import { useBoardStore } from '@entities/board/model'
import { type PresenceUser, usePresenceStore } from '@entities/presence/model'
import { getToken } from '@shared/api/session'
import { io, type Socket } from 'socket.io-client'
import { requestBoardRefresh } from '../board-sync/liveSync'

/**
 * Live presence and live board updates over the backend's socket.io channel.
 *
 * The same job BroadcastChannel does between tabs of one browser
 * (presenceChannel.ts), but between any two machines: who is on the board,
 * where their pointers are, and a "board:changed" nudge after anyone's write.
 * Protocol: backend/src/presence/presence.types.ts.
 */

/** What the server sends about a person on a board (one per open tab). */
interface WirePeer {
  clientId: string
  userId: string
  name: string
  avatarColor: string
  cursor: { x: number; y: number }
}

const CURSOR_THROTTLE_MS = 40
const FALLBACK_COLOR = '#79a6cf'

let socket: Socket | null = null
let lastCursorSent = 0

const currentBoardId = () => useBoardStore.getState().board?.id

function toPeer(w: WirePeer, boardId: string): PresenceUser {
  return {
    id: w.clientId,
    userId: w.userId,
    boardId,
    name: w.name,
    // Older accounts may still carry a CSS variable as their colour.
    color: w.avatarColor?.startsWith('#') ? w.avatarColor : FALLBACK_COLOR,
    cursor: w.cursor ?? { x: 0, y: 0 },
    lastSeen: Date.now(),
  }
}

/** The socket server lives at the API's origin. */
export function socketOrigin(apiUrl: string): string {
  return new URL(apiUrl).origin
}

/** Tell the others where this pointer is (board coordinates). Throttled. */
export function sendSocketCursor(x: number, y: number): void {
  if (!socket?.connected || !currentBoardId()) return
  const now = performance.now()
  if (now - lastCursorSent < CURSOR_THROTTLE_MS) return
  lastCursorSent = now
  socket.emit('cursor:move', { x, y })
}

/** Connect, follow the open board, and mirror the room into the presence store. Returns a stop function. */
export function startSocketPresence(apiUrl: string): () => void {
  const presence = usePresenceStore.getState()

  const s = io(socketOrigin(apiUrl), {
    // Read on every (re)connect, so a renewed access token is picked up.
    auth: (done) => done({ token: getToken() ?? '' }),
    transports: ['websocket'],
    reconnectionDelayMax: 5000,
  })
  socket = s

  const join = () => {
    const boardId = currentBoardId()
    presence.clear()
    if (boardId) s.emit('board:join', { boardId })
  }

  s.on('connect', join)

  s.on('presence:state', ({ users }: { users: WirePeer[] }) => {
    const boardId = currentBoardId()
    if (!boardId) return
    presence.clear()
    for (const u of users) presence.upsert(toPeer(u, boardId))
  })

  s.on('presence:join', ({ user }: { user: WirePeer }) => {
    const boardId = currentBoardId()
    if (boardId) presence.upsert(toPeer(user, boardId))
  })

  s.on('presence:leave', ({ clientId }: { clientId: string }) => presence.remove(clientId))

  s.on('cursor:move', ({ clientId, x, y }: { clientId: string; x: number; y: number }) => {
    const known = usePresenceStore.getState().peers[clientId]
    // A cursor from someone we have not been told about yet is ignored: we
    // would not know their name or colour. The next presence event fills them in.
    if (known) presence.upsert({ ...known, cursor: { x, y }, lastSeen: Date.now() })
  })

  // Anyone (including this tab) changed the board: reload it.
  s.on('board:changed', () => requestBoardRefresh())

  // Switching boards moves this socket to the new room.
  const unsubscribe = useBoardStore.subscribe((state, prev) => {
    if (state.board?.id !== prev.board?.id && s.connected) join()
  })

  return () => {
    unsubscribe()
    s.removeAllListeners()
    s.disconnect()
    if (socket === s) socket = null
    presence.clear()
  }
}
