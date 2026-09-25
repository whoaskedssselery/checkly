// Load test for the Checkly backend (k6: https://k6.io).
//
//   k6 run -e BASE_URL=http://localhost:3001 qa/load/board.k6.js
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6 run - < qa/load/board.k6.js
//
// Needs the demo account from the seed (SEED_DEMO=1): demo@checkly.dev / demo1234.
//
// Auth endpoints are rate limited on purpose (AUTH_RATE_LIMIT, default 10/min per
// address), so the test signs in ONCE in setup() and every virtual user shares
// that session — it measures the board API, not the limiter. The limiter itself
// is covered by the backend e2e tests.
//
// Traffic mirrors the UI: mostly board reads, now and then one card is created,
// moved (one PATCH per drag, not per mouse tick) and deleted.
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL || 'http://localhost:3001'
const json = { 'Content-Type': 'application/json' }

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '60s', target: 20 },
    { duration: '20s', target: 60 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:board}': ['p(95)<300'],
    'http_req_duration{name:write}': ['p(95)<400'],
  },
}

export function setup() {
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email: 'demo@checkly.dev', password: 'demo1234' }), {
    headers: json,
  })
  if (login.status !== 200) throw new Error(`demo login failed: ${login.status} ${login.body}`)
  const headers = { ...json, Authorization: `Bearer ${login.json('accessToken')}` }
  const boards = http.get(`${BASE}/boards`, { headers }).json()
  return { headers, boardId: boards[0].id }
}

export default function ({ headers, boardId }) {
  const board = http.get(`${BASE}/boards/${boardId}`, { headers, tags: { name: 'board' } })
  check(board, { 'board 200': (r) => r.status === 200 })
  const columnId = board.json('columns.0.id')

  for (let i = 0; i < 4; i++) {
    sleep(Math.random() * 2 + 1)
    http.get(`${BASE}/boards/${boardId}`, { headers, tags: { name: 'board' } })
  }

  const created = http.post(
    `${BASE}/boards/${boardId}/tasks`,
    JSON.stringify({ title: `k6 ${__VU}-${__ITER}`, columnId, position: { x: 10, y: 10 } }),
    { headers, tags: { name: 'write' } },
  )
  check(created, { 'create 201': (r) => r.status === 201 })
  const taskId = created.json('id')

  const moved = http.patch(`${BASE}/tasks/${taskId}`, JSON.stringify({ position: { x: 120, y: 80 } }), {
    headers,
    tags: { name: 'write' },
  })
  check(moved, { 'move 200': (r) => r.status === 200 })

  const removed = http.del(`${BASE}/tasks/${taskId}`, null, { headers, tags: { name: 'write' } })
  check(removed, { 'delete 2xx': (r) => r.status >= 200 && r.status < 300 })
}
