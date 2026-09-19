export interface PresenceUser {
  [key: string]: unknown
  id: string
  name: string
  color: string
  cursor: { x: number; y: number }
}

// Simulated participants — clearly mock, stands in for the real WebSocket
// presence channel that backend has not built yet.
export const mockPresenceUsers: PresenceUser[] = [
  { id: 'p1', name: 'Карчевский', color: 'var(--live-1)', cursor: { x: 300, y: 120 } },
  { id: 'p2', name: 'Панов', color: 'var(--live-2)', cursor: { x: 560, y: 260 } },
]
