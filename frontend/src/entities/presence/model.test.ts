import { beforeEach, describe, expect, it } from 'vitest'
import { type PresenceUser, peersOnBoard, usePresenceStore } from './model'

const peer = (id: string, over: Partial<PresenceUser> = {}): PresenceUser => ({
  id,
  userId: `u-${id}`,
  boardId: 'b1',
  name: id,
  color: '#fff',
  cursor: { x: 0, y: 0 },
  lastSeen: 1000,
  ...over,
})

describe('presence store', () => {
  beforeEach(() => usePresenceStore.getState().clear())

  it('upserts a peer and updates its cursor in place', () => {
    const { upsert } = usePresenceStore.getState()
    upsert(peer('a'))
    upsert(peer('a', { cursor: { x: 5, y: 6 } }))
    const peers = usePresenceStore.getState().peers
    expect(Object.keys(peers)).toEqual(['a'])
    expect(peers.a.cursor).toEqual({ x: 5, y: 6 })
  })

  it('removes a peer, ignoring one that is not there', () => {
    const { upsert, remove } = usePresenceStore.getState()
    upsert(peer('a'))
    remove('ghost')
    remove('a')
    expect(usePresenceStore.getState().peers).toEqual({})
  })

  it('prunes peers not heard from since the cut-off (closed tab, crash, sleep)', () => {
    const { upsert, prune } = usePresenceStore.getState()
    upsert(peer('old', { lastSeen: 1000 }))
    upsert(peer('fresh', { lastSeen: 9000 }))
    prune(5000)
    expect(Object.keys(usePresenceStore.getState().peers)).toEqual(['fresh'])
  })

  it('only lists peers on the given board, most recently heard first', () => {
    const peers = {
      a: peer('a', { lastSeen: 1 }),
      b: peer('b', { lastSeen: 3 }),
      c: peer('c', { boardId: 'other', lastSeen: 9 }),
    }
    expect(peersOnBoard(peers, 'b1').map((p) => p.id)).toEqual(['b', 'a'])
    expect(peersOnBoard(peers, undefined)).toEqual([])
  })
})
