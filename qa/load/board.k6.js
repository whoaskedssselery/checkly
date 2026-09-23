// Load test for the Checkly backend (k6: https://k6.io).
//
//   k6 run -e BASE_URL=http://localhost:3000/api qa/load/board.k6.js
//
// STATUS: written, NOT yet run — there is no backend to load yet.
// Needs the seed user demo@checkly.dev / demo1234 and board "board-1".
//
// Shape of the traffic mirrors the UI: everyone logs in once, then mostly
// reads the board and now and then creates/moves a card (moves are one PATCH
// per drag, not per mouse tick).
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api'
const json = { headers: { 'Content-Type': 'application/json' } }

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up
    { duration: '2m', target: 20 }, // steady: 20 concurrent users
    { duration: '30s', target: 60 }, // spike
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    'http_req_duration{name:board}': ['p(95)<300'], // board read: p95 under 300 ms
    'http_req_duration{name:write}': ['p(95)<400'],
    'http_req_duration{name:login}': ['p(95)<800'], // password hashing is slow on purpose
  },
}

export default function () {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: 'demo@checkly.dev', password: 'demo1234' }),
    { ...json, tags: { name: 'login' } },
  )
  check(login, { 'login 200': (r) => r.status === 200 })
  const token = login.json('token')
  const auth = { headers: { ...json.headers, Authorization: `Bearer ${token}` } }

  const board = http.get(`${BASE}/boards/board-1`, { ...auth, tags: { name: 'board' } })
  check(board, { 'board 200': (r) => r.status === 200 })
  const columnId = board.json('columns.0.id')

  for (let i = 0; i < 5; i++) {
    sleep(Math.random() * 2 + 1) // think time
    http.get(`${BASE}/boards/board-1`, { ...auth, tags: { name: 'board' } })
  }

  const created = http.post(
    `${BASE}/boards/board-1/tasks`,
    JSON.stringify({ title: `k6 ${__VU}-${__ITER}`, columnId, position: { x: 10, y: 10 } }),
    { ...auth, tags: { name: 'write' } },
  )
  check(created, { 'create 201': (r) => r.status === 201 })

  const taskId = created.json('id')
  const moved = http.patch(
    `${BASE}/tasks/${taskId}`,
    JSON.stringify({ position: { x: 200, y: 300 } }),
    { ...auth, tags: { name: 'write' } },
  )
  check(moved, { 'patch 200': (r) => r.status === 200 })

  const removed = http.del(`${BASE}/tasks/${taskId}`, null, { ...auth, tags: { name: 'write' } })
  check(removed, { 'delete 204': (r) => r.status === 204 })
}
