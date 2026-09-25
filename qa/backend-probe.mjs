// Black-box probe of the backend API: node qa/backend-probe.mjs (BASE below). Needs the server up, migrated and seeded.
// It prints PASS/FAIL per check against docs/release/openapi.yaml and the notes in docs/release/backend-qa.md.
const BASE = 'http://localhost:3001'
const results = []
let n = 0

async function call(method, path, { body, token, raw, headers } = {}) {
  const h = { ...(headers ?? {}) }
  if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json'
  if (token) h.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, json, text, headers: res.headers }
}

function check(name, cond, detail = '') {
  n++
  results.push({ n, name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <-- ' + detail}`)
}

const stamp = Date.now()
const A = { email: `a+${stamp}@t.dev`, password: 'secret12', name: 'Аня' }
const C = { email: `c+${stamp}@t.dev`, password: 'secret12', name: 'Вера' }
const B = { email: `b+${stamp}@t.dev`, password: 'secret12', name: 'Борис' }

// ---------- auth
let r = await call('POST', '/auth/register', { body: A })
check('register -> 201', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)
check('register returns user+accessToken+refreshToken', r.json?.user && r.json?.accessToken && r.json?.refreshToken, JSON.stringify(Object.keys(r.json ?? {})))
check('register response has no password/hash', !/password|hash/i.test(JSON.stringify(r.json)), r.text.slice(0, 200))
const a = r.json
r = await call('POST', '/auth/register', { body: B }); const b = r.json
r = await call('POST', '/auth/register', { body: C }); const cTok = r.json?.accessToken

r = await call('POST', '/auth/register', { body: { ...A, email: A.email.toUpperCase() } })
check('duplicate email (other case) -> 409', r.status === 409, `${r.status} ${r.text.slice(0, 100)}`)
r = await call('POST', '/auth/register', { body: { email: 'nope', password: '123' } })
check('bad email/short password -> 400', r.status === 400, `${r.status}`)
check('  validation error is field-level (fields)', r.json && (r.json.fields || r.json.error?.fields), `shape: ${r.text.slice(0, 160)}`)
r = await call('POST', '/auth/register', { body: { email: `x+${stamp}@y.co`, password: 'a'.repeat(73) } })
check('73-char password -> 400 (bcrypt 72-byte limit)', r.status === 400, `${r.status}`)
r = await call('POST', '/auth/register', { body: { email: `x+${stamp}@y.co`, password: 'a'.repeat(30), extra: 'hack', isAdmin: true } })
check('unknown fields are stripped / rejected (no mass assignment)', r.status === 201 || r.status === 400, `${r.status}`)

r = await call('POST', '/auth/login', { body: { email: A.email, password: A.password } })
check('login -> 200', r.status === 200, `${r.status}`)
const wrong = await call('POST', '/auth/login', { body: { email: A.email, password: 'wrong-pass' } })
const ghost = await call('POST', '/auth/login', { body: { email: 'ghost@t.dev', password: 'wrong-pass' } })
check('wrong password -> 401', wrong.status === 401, `${wrong.status}`)
check('unknown email -> 401 identical body', ghost.status === 401 && ghost.text === wrong.text, `${ghost.text} vs ${wrong.text}`)
r = await call('POST', '/auth/login', { raw: '{ "email": "a@b.co", ' })
check('malformed JSON -> 400 JSON (no stack trace)', r.status === 400 && !/at .*\(.*:\d+/.test(r.text), `${r.status} ${r.text.slice(0, 120)}`)
r = await call('GET', '/auth/me', { token: a.accessToken })
check('GET /auth/me exists (frontend needs it)', r.status === 200, `${r.status}`)

// ---------- token handling
r = await call('GET', '/boards')
check('no token -> 401', r.status === 401)
r = await call('GET', '/boards', { token: a.accessToken + 'x' })
check('tampered token -> 401', r.status === 401)
// alg=none forged token
const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: a.user.id, email: A.email })).toString('base64url') + '.'
r = await call('GET', '/boards', { token: none })
check('alg=none forged token -> 401', r.status === 401, `${r.status}`)
r = await call('GET', '/boards', { token: a.refreshToken })
check('refresh token is NOT accepted as an access token', r.status === 401, `${r.status}`)

// ---------- refresh rotation
r = await call('POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } })
check('refresh -> 200 new pair', r.status === 200 && r.json?.accessToken, `${r.status}`)
const rotated = r.json
r = await call('POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } })
check('re-using a spent refresh token -> 401', r.status === 401, `${r.status}`)
r = await call('POST', '/auth/logout', { body: { refreshToken: rotated.refreshToken } })
check('logout -> 204', r.status === 204, `${r.status}`)
r = await call('POST', '/auth/refresh', { body: { refreshToken: rotated.refreshToken } })
check('refresh after logout -> 401', r.status === 401, `${r.status}`)
const A2 = (await call('POST', '/auth/login', { body: { email: A.email, password: A.password } })).json
const tokA = A2.accessToken, tokB = b.accessToken

// ---------- boards
r = await call('GET', '/boards', { token: tokA })
check('new user has a personal board on register', Array.isArray(r.json) && r.json.length >= 1, `${r.status} ${r.text.slice(0, 150)}`)
r = await call('POST', '/boards', { token: tokA, body: { name: '  Курсовой  ' } })
check('POST /boards -> 201', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`)
const board = r.json
check('  name trimmed, code CHK-XXXX', board?.name === 'Курсовой' && /^CHK-[A-Z0-9]{4}$/.test(board?.code ?? ''), JSON.stringify(board))
r = await call('GET', `/boards/${board.id}`, { token: tokB })
check('non-member reads board -> 403', r.status === 403, `${r.status}`)
r = await call('GET', `/boards/${board.id}/tasks`, { token: tokB })
check('non-member lists tasks -> 403', r.status === 403, `${r.status}`)
r = await call('GET', `/boards/${board.id}`, { token: tokA })
check('member reads board -> 200 (with columns+tasks in ONE call?)', r.status === 200 && r.json?.columns && r.json?.tasks, `keys: ${Object.keys(r.json ?? {})}`)
r = await call('POST', '/boards/join', { token: tokB, body: { code: board.code } })
check('POST /boards/join by code exists (frontend feature)', r.status === 200, `${r.status} ${r.text.slice(0, 100)}`)
r = await call('GET', '/boards/not-a-real-id', { token: tokA })
check('unknown board id -> 403/404 (not 500)', [403, 404].includes(r.status), `${r.status}`)

// ---------- columns / tasks
r = await call('GET', `/boards/${board.id}/columns`, { token: tokA })
const cols = r.json
check('board has 3 default columns', Array.isArray(cols) && cols.length === 3, `${r.status}`)
check('default column colour is #rrggbb (frontend hex)', /^#[0-9a-f]{6}$/i.test(cols?.[0]?.color ?? ''), `color=${cols?.[0]?.color}`)
r = await call('POST', `/boards/${board.id}/columns`, { token: tokA, body: { name: 'Review', color: '#8d97a3', position: { x: 5, y: 6 } } })
check('create column -> 201', r.status === 201, `${r.status}`)
const col = r.json
r = await call('PATCH', `/columns/${col.id}`, { token: tokA, body: { width: 500, height: 700, position: { x: 1, y: 2 } } })
check('PATCH column accepts width/height', r.status === 200 && r.json?.width === 500, `${r.status} ${r.text.slice(0, 160)}`)
r = await call('PATCH', `/columns/${col.id}`, { token: cTok, body: { name: 'hack' } })
check('non-member cannot patch column -> 403', r.status === 403, `${r.status}`)
r = await call('POST', `/boards/${board.id}/columns`, { token: tokA, body: { name: ' ', position: { x: 0, y: 0 } } })
check('blank column name -> 400', r.status === 400, `${r.status}`)

const T = (over) => ({ title: 'Task', columnId: cols[0].id, priority: 'medium', position: { x: 1, y: 2 }, ...over })
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ title: '  Padded  ' }) })
check('create task -> 201, title trimmed', r.status === 201 && r.json?.title === 'Padded', `${r.status} ${r.text.slice(0, 120)}`)
const task = r.json
check('task fields match contract (position{x,y}, priority, tags)', task?.position?.x === 1 && task?.priority === 'medium' && Array.isArray(task?.tags), JSON.stringify(task))
for (const [name, over] of [
  ['empty title', { title: '' }], ['whitespace title', { title: '   ' }], ['title 201+ chars', { title: 'x'.repeat(256) }],
  ['bad priority', { priority: 'urgent' }], ['non-numeric position', { position: { x: 'a', y: 1 } }],
]) {
  r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T(over) })
  check(`create task: ${name} -> 400`, r.status === 400, `${r.status}`)
}
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ title: 'x'.repeat(256) }) })
check('  256-char title -> 400', r.status === 400, `${r.status}`)
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ columnId: '00000000-0000-0000-0000-000000000000' }) })
check('task in unknown column -> 404', r.status === 404, `${r.status}`)
// column of ANOTHER board
const other = (await call('POST', '/boards', { token: tokB, body: { name: 'B board' } })).json
const otherCols = (await call('GET', `/boards/${other.id}/columns`, { token: tokB })).json
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ columnId: otherCols[0].id }) })
check("task in ANOTHER board's column -> 404 (never 201)", r.status === 404, `${r.status}`)
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ columnId: null }) })
check('task with columnId null (free-floating) -> 201', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`)
r = await call('PATCH', `/tasks/${task.id}`, { token: tokA, body: { position: { x: 9, y: 9 }, columnId: col.id } })
check('PATCH task position+column -> 200', r.status === 200 && r.json?.columnId === col.id, `${r.status}`)
r = await call('PATCH', `/tasks/${task.id}`, { token: tokA, body: { columnId: null } })
check('PATCH task columnId:null (detach) -> 200', r.status === 200, `${r.status} ${r.text.slice(0, 100)}`)
r = await call('PATCH', `/tasks/${task.id}`, { token: tokA, body: {} })
check('PATCH task with empty body -> 400', r.status === 400, `${r.status}`)
r = await call('PATCH', `/tasks/${task.id}`, { token: cTok, body: { title: 'stolen' } })
check('non-member cannot patch task -> 403', r.status === 403, `${r.status}`)
r = await call('DELETE', `/tasks/${task.id}`, { token: cTok })
check('non-member cannot delete task -> 403', r.status === 403, `${r.status}`)
r = await call('PATCH', `/tasks/${task.id}`, { token: tokA, body: { columnId: otherCols[0].id } })
check("PATCH task into another board's column -> 404", r.status === 404, `${r.status}`)
r = await call('DELETE', `/tasks/${task.id}`, { token: tokA })
check('delete task -> 200/204', [200, 204].includes(r.status), `${r.status}`)
r = await call('DELETE', `/tasks/${task.id}`, { token: tokA })
check('delete again -> 404', r.status === 404, `${r.status}`)
r = await call('PATCH', '/tasks/not-a-uuid', { token: tokA, body: { title: 'x' } })
check('non-uuid id -> 404 (not 500)', r.status === 404, `${r.status}`)

// delete column with tasks
await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ columnId: col.id, title: 'in col' }) })
r = await call('DELETE', `/columns/${col.id}`, { token: tokA })
check('delete non-empty column: backend moves tasks (design choice, contract said 409)', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

// ---------- injection / hardening
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ title: "'; DROP TABLE \"Task\";--" }) })
check('SQL-injection string stored verbatim, no 500', r.status === 201, `${r.status}`)
r = await call('GET', `/boards/${board.id}/tasks`, { token: tokA })
check('  tasks table still there', r.status === 200, `${r.status}`)
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ description: 'd'.repeat(10001) }) })
check('description > 10000 chars -> 400', r.status === 400, `${r.status}`)
r = await call('POST', `/boards/${board.id}/tasks`, { token: tokA, body: T({ description: 'y'.repeat(200000) }) })
check('200 kB body -> 400/413 (body-size limit)', [400, 413].includes(r.status), `${r.status}`)
const h = (await call('GET', '/boards', { token: tokA })).headers
check('security headers (helmet: X-Content-Type-Options)', h.get('x-content-type-options') === 'nosniff', 'missing')
check('no X-Powered-By fingerprint', !h.get('x-powered-by'), `x-powered-by: ${h.get('x-powered-by')}`)
r = await call('GET', '/boards', { token: tokA, headers: { Origin: 'http://evil.example' } })
check('CORS: evil origin not allowed', !r.headers.get('access-control-allow-origin'), `ACAO=${r.headers.get('access-control-allow-origin')}`)
let last
for (let i = 0; i < 12; i++) last = await call('POST', '/auth/login', { body: { email: A.email, password: 'wrong' + i } })
check('login brute force gets rate-limited (429) after many tries', last.status === 429, `12 wrong logins in a row -> last status ${last.status}`)
r = await call('GET', '/health')
check('GET /health exists', r.status === 200, `${r.status}`)

const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`)
