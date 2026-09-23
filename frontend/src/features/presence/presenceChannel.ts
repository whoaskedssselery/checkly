import { useBoardStore } from '@entities/board/model'
import { type PresenceUser, usePresenceStore } from '@entities/presence/model'
import { useUserStore } from '@entities/user/model'

/**
 * Live presence between open tabs of the same browser.
 *
 * Each tab announces itself (who, which board) every couple of seconds and
 * streams its pointer position; other tabs on the same board draw it. A tab
 * that stops announcing (closed, crashed, asleep) disappears after a few
 * seconds. This is the real thing for everything sharing this browser — the
 * transport is the only mock: with a backend the same messages go over a
 * WebSocket instead (docs/release/backend-spec.md §10).
 */

const CHANNEL = 'checkly-presence'
const HEARTBEAT_MS = 2000
const STALE_MS = 6500
const CURSOR_THROTTLE_MS = 40

type Message =
  | {
      type: 'hello'
      clientId: string
      boardId: string
      userId: string
      name: string
      color: string
    }
  | {
      type: 'cursor'
      clientId: string
      boardId: string
      userId: string
      name: string
      color: string
      x: number
      y: number
    }
  | { type: 'bye'; clientId: string }

const clientId = crypto.randomUUID()
const FALLBACK_COLORS = ['#79a6cf', '#a795d0', '#63b8a6']

function colorFor(userId: string, avatarColor: string | undefined): string {
  if (avatarColor?.startsWith('#')) return avatarColor
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

let channel: BroadcastChannel | null = null
let lastCursorSent = 0

function identity() {
  const user = useUserStore.getState().user
  const board = useBoardStore.getState().board
  if (!user || !board) return null
  return {
    boardId: board.id,
    userId: user.id,
    name: user.name,
    color: colorFor(user.id, user.avatarColor),
  }
}

function announce() {
  const me = identity()
  if (me) channel?.postMessage({ type: 'hello', clientId, ...me } satisfies Message)
}

/** Tell other tabs where this pointer is (board coordinates). Throttled. */
export function sendCursor(x: number, y: number): void {
  if (!channel) return
  const now = performance.now()
  if (now - lastCursorSent < CURSOR_THROTTLE_MS) return
  lastCursorSent = now
  const me = identity()
  if (me) channel.postMessage({ type: 'cursor', clientId, x, y, ...me } satisfies Message)
}

function receive(msg: Message) {
  const store = usePresenceStore.getState()
  if (msg.type === 'bye') return store.remove(msg.clientId)
  if (msg.clientId === clientId) return
  const previous = store.peers[msg.clientId]
  const peer: PresenceUser = {
    id: msg.clientId,
    userId: msg.userId,
    boardId: msg.boardId,
    name: msg.name,
    color: msg.color,
    cursor: msg.type === 'cursor' ? { x: msg.x, y: msg.y } : (previous?.cursor ?? { x: 0, y: 0 }),
    lastSeen: Date.now(),
  }
  store.upsert(peer)
}

/** Start announcing and listening. Returns a function that stops both. */
export function startPresence(): () => void {
  if (import.meta.env.MODE === 'test' || typeof BroadcastChannel === 'undefined') return () => {}

  channel = new BroadcastChannel(CHANNEL)
  const current = channel
  current.onmessage = (e: MessageEvent<Message>) => receive(e.data)

  announce()
  const heartbeat = setInterval(() => {
    announce()
    usePresenceStore.getState().prune(Date.now() - STALE_MS)
  }, HEARTBEAT_MS)

  // Changing board (or logging in) re-announces at once instead of waiting.
  const unsubBoard = useBoardStore.subscribe(announce)
  const goodbye = () => current.postMessage({ type: 'bye', clientId } satisfies Message)
  window.addEventListener('pagehide', goodbye)

  return () => {
    clearInterval(heartbeat)
    unsubBoard()
    window.removeEventListener('pagehide', goodbye)
    goodbye()
    current.close()
    channel = null
    usePresenceStore.getState().clear()
  }
}
