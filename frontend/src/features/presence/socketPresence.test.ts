import { useBoardStore } from '@entities/board/model'
import { usePresenceStore } from '@entities/presence/model'
import { setToken } from '@shared/api/session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A socket that lets the test play the server's part.
class FakeSocket {
  connected = true
  handlers = new Map<string, (payload?: unknown) => void>()
  emitted: [string, unknown][] = []
  options: { auth?: (done: (a: object) => void) => void } = {}
  disconnected = false

  on(event: string, handler: (payload?: unknown) => void) {
    this.handlers.set(event, handler)
    return this
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload])
    return this
  }
  removeAllListeners() {
    this.handlers.clear()
    return this
  }
  disconnect() {
    this.disconnected = true
    this.connected = false
    return this
  }
  /** What the server would push. */
  receive(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload)
  }
}

let fake: FakeSocket
let connectedTo: string | undefined

vi.mock('socket.io-client', () => ({
  io: (url: string, options: FakeSocket['options']) => {
    connectedTo = url
    fake.options = options
    return fake
  },
}))

const requestBoardRefresh = vi.fn()
vi.mock('../board-sync/liveSync', () => ({
  requestBoardRefresh: (...args: unknown[]) => requestBoardRefresh(...args),
}))

const { sendSocketCursor, socketOrigin, startSocketPresence } = await import('./socketPresence')

const wire = (clientId: string, userId: string, name: string, color = '#c46d5e') => ({
  clientId,
  userId,
  name,
  avatarColor: color,
  cursor: { x: 1, y: 2 },
})

describe('socket presence', () => {
  let stop: () => void

  beforeEach(() => {
    fake = new FakeSocket()
    requestBoardRefresh.mockClear()
    usePresenceStore.getState().clear()
    useBoardStore.setState({ board: { id: 'b1', code: 'CHK-AAAA', name: 'Доска' } })
    stop = startSocketPresence('http://localhost:3001/api')
  })
  afterEach(() => {
    stop()
    useBoardStore.setState({ board: null })
  })

  it('connects to the ORIGIN of the API address', () => {
    expect(connectedTo).toBe('http://localhost:3001')
    expect(socketOrigin('https://api.checkly.app/v1')).toBe('https://api.checkly.app')
  })

  it('sends the current access token, read fresh on every (re)connect', () => {
    setToken('tok-1')
    const done = vi.fn()
    fake.options.auth?.(done)
    expect(done).toHaveBeenLastCalledWith({ token: 'tok-1' })

    setToken('tok-2') // renewed while the socket was down
    fake.options.auth?.(done)
    expect(done).toHaveBeenLastCalledWith({ token: 'tok-2' })
  })

  it('joins the open board as soon as it connects', () => {
    fake.receive('connect')
    expect(fake.emitted).toContainEqual(['board:join', { boardId: 'b1' }])
  })

  it('fills the store from the roster the server sends the joiner', () => {
    fake.receive('presence:state', { users: [wire('s1', 'u1', 'Аня'), wire('s2', 'u2', 'Борис')] })
    const peers = usePresenceStore.getState().peers
    expect(Object.keys(peers).sort()).toEqual(['s1', 's2'])
    expect(peers.s1).toMatchObject({ userId: 'u1', name: 'Аня', boardId: 'b1', color: '#c46d5e' })
  })

  it('adds someone who joins and removes someone who leaves — per tab, not per person', () => {
    fake.receive('presence:join', { user: wire('tab1', 'u1', 'Аня') })
    fake.receive('presence:join', { user: wire('tab2', 'u1', 'Аня') })
    expect(Object.keys(usePresenceStore.getState().peers)).toEqual(['tab1', 'tab2'])

    fake.receive('presence:leave', { userId: 'u1', clientId: 'tab1' })
    expect(Object.keys(usePresenceStore.getState().peers)).toEqual(['tab2'])
  })

  it("moves a known peer's cursor, and ignores a cursor from someone it was never told about", () => {
    fake.receive('presence:join', { user: wire('s1', 'u1', 'Аня') })
    fake.receive('cursor:move', { clientId: 's1', userId: 'u1', x: 40, y: 50 })
    expect(usePresenceStore.getState().peers.s1.cursor).toEqual({ x: 40, y: 50 })

    fake.receive('cursor:move', { clientId: 'ghost', userId: 'u9', x: 1, y: 1 })
    expect(usePresenceStore.getState().peers.ghost).toBeUndefined()
  })

  it('replaces a legacy CSS-variable colour with a usable one', () => {
    fake.receive('presence:join', { user: wire('s1', 'u1', 'Аня', 'var(--accent)') })
    expect(usePresenceStore.getState().peers.s1.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('reloads the board when the server says it changed', () => {
    fake.receive('board:changed', { boardId: 'b1' })
    expect(requestBoardRefresh).toHaveBeenCalledTimes(1)
  })

  it('follows the user to another board: clears the roster and joins the new room', () => {
    fake.receive('presence:join', { user: wire('s1', 'u1', 'Аня') })
    fake.emitted.length = 0

    useBoardStore.setState({ board: { id: 'b2', code: 'CHK-BBBB', name: 'Другая' } })

    expect(usePresenceStore.getState().peers).toEqual({})
    expect(fake.emitted).toContainEqual(['board:join', { boardId: 'b2' }])
  })

  it('sends the pointer position, throttled', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1010)
      .mockReturnValueOnce(1100)
    sendSocketCursor(1, 1)
    sendSocketCursor(2, 2) // 10 ms later: dropped
    sendSocketCursor(3, 3) // 100 ms later: sent
    const moves = fake.emitted.filter(([e]) => e === 'cursor:move')
    expect(moves.map(([, p]) => p)).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 3 },
    ])
  })

  it('does not send a cursor while disconnected', () => {
    fake.connected = false
    sendSocketCursor(9, 9)
    expect(fake.emitted.filter(([e]) => e === 'cursor:move')).toEqual([])
  })

  it('stopping disconnects, forgets the listeners and empties the roster', () => {
    fake.receive('presence:join', { user: wire('s1', 'u1', 'Аня') })
    stop()
    expect(fake.disconnected).toBe(true)
    expect(fake.handlers.size).toBe(0)
    expect(usePresenceStore.getState().peers).toEqual({})
  })
})
