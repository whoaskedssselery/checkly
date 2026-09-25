import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { createHttpApi } from './http'
import { DEMO_EMAIL, DEMO_PASSWORD, mockApi, resetMockDb } from './mock'
import { setRefreshToken, setToken } from './session'
import type { BoardDto, CheckllyApi, TaskCreate } from './types'

/**
 * API contract suite — the "HTTP requests straight at the API" part of QA.
 *
 * By default it runs against the localStorage mock. Point it at the real
 * backend with
 *
 *   CONTRACT_API_URL=http://localhost:3001 pnpm test contract
 *
 * and the very same assertions run over HTTP. The server needs the demo seed
 * (`npm run seed` in backend/): the user demo@checkly.dev and its board
 * CHK-B1D4. Ids are discovered, never assumed, so both sides can use their
 * own id format. Start the backend with AUTH_RATE_LIMIT=1000, or the login
 * brake will (rightly) stop this suite.
 */
const url = process.env.CONTRACT_API_URL
const api: CheckllyApi = url ? createHttpApi(url) : mockApi
const DEMO_BOARD_CODE = 'CHK-B1D4'

async function expectError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({ status, code })
}

const task = (columnId: string | null, over: Partial<TaskCreate> = {}): TaskCreate => ({
  title: 'Contract task',
  columnId,
  priority: 'medium',
  tags: [],
  position: { x: 1, y: 2 },
  ...over,
})

const unique = (tag: string) =>
  `${tag}+${Date.now()}.${Math.random().toString(36).slice(2, 7)}@checkly.dev`

describe(`API contract (${url ? 'real server' : 'mock'})`, () => {
  let demo: BoardDto

  beforeEach(() => {
    if (!url) resetMockDb()
    setToken(null)
    setRefreshToken(null)
  })

  async function signIn(email = DEMO_EMAIL, password = DEMO_PASSWORD) {
    const { token } = await api.auth.login({ email, password })
    setToken(token)
  }

  /** Sign in as the demo user and load its seeded board. */
  async function signInAsDemo(): Promise<BoardDto> {
    await signIn()
    const list = await api.boards.list()
    const summary = list.find((b) => b.code === DEMO_BOARD_CODE)
    if (!summary) throw new Error(`the demo board ${DEMO_BOARD_CODE} is missing — run the seed`)
    demo = await api.boards.get(summary.id)
    return demo
  }

  describe('auth', () => {
    it('POST /auth/register returns a token and a user without a password', async () => {
      const email = unique('qa')
      const res = await api.auth.register({ name: 'QA', email, password: 'secret12' })
      expect(res.token).toBeTruthy()
      expect(res.user).toMatchObject({ name: 'QA', email })
      expect(JSON.stringify(res)).not.toMatch(/password|hash/i)
    })

    it('rejects a duplicate email, ignoring letter case (409 EMAIL_TAKEN)', async () => {
      await expectError(
        api.auth.register({ name: 'X', email: DEMO_EMAIL.toUpperCase(), password: 'secret12' }),
        409,
        'EMAIL_TAKEN',
      )
    })

    it.each([
      ['malformed email', 'not-an-email', 'secret12'],
      ['short password', 'ok@checkly.dev', '123'],
    ])('rejects %s (400 VALIDATION_ERROR)', async (_label, email, password) => {
      await expectError(api.auth.register({ name: 'X', email, password }), 400, 'VALIDATION_ERROR')
    })

    it('POST /auth/login accepts the demo account', async () => {
      const res = await api.auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      expect(res.user.email).toBe(DEMO_EMAIL)
    })

    it('login: wrong password and unknown email are indistinguishable (401 INVALID_CREDENTIALS)', async () => {
      await expectError(
        api.auth.login({ email: DEMO_EMAIL, password: 'nope-nope' }),
        401,
        'INVALID_CREDENTIALS',
      )
      await expectError(
        api.auth.login({ email: 'ghost@checkly.dev', password: 'nope-nope' }),
        401,
        'INVALID_CREDENTIALS',
      )
    })

    it('GET /auth/me needs a token (401) and returns the user with one', async () => {
      await expectError(api.auth.me(), 401, 'UNAUTHORIZED')
      await signIn()
      expect((await api.auth.me()).email).toBe(DEMO_EMAIL)
    })
  })

  describe('protected routes', () => {
    it.each([
      ['GET boards', () => api.boards.list()],
      ['GET board', () => api.boards.get('any')],
      ['POST board', () => api.boards.create({ name: 'x' })],
      ['POST join', () => api.boards.join({ code: DEMO_BOARD_CODE })],
      ['POST task', () => api.tasks.create('any', task(null))],
      ['PATCH task', () => api.tasks.update('any', { title: 'x' })],
      ['DELETE task', () => api.tasks.remove('any')],
      [
        'POST column',
        () => api.columns.create('any', { name: 'x', color: '#000000', position: { x: 0, y: 0 } }),
      ],
      ['PATCH column', () => api.columns.update('any', { name: 'x' })],
      ['DELETE column', () => api.columns.remove('any')],
    ])('%s without a token is 401', async (_label, call) => {
      await expectError(call(), 401, 'UNAUTHORIZED')
    })
  })

  describe('board', () => {
    it('GET /boards/:id returns columns and tasks that reference existing columns (or none)', async () => {
      const res = await signInAsDemo()
      expect(res.columns.length).toBeGreaterThan(0)
      const ids = new Set(res.columns.map((c) => c.id))
      for (const t of res.tasks) expect(t.columnId === null || ids.has(t.columnId)).toBe(true)
    })

    it('a board that does not exist is refused like one you may not see (403)', async () => {
      await signIn()
      await expectError(api.boards.get('no-such-board'), 403, 'FORBIDDEN')
    })

    it('POST /boards creates a board with starter columns and a shareable code', async () => {
      await signIn()
      const created = await api.boards.create({ name: '  Курсовой  ' })
      expect(created.name).toBe('Курсовой')
      expect(created.code).toMatch(/^CHK-[A-Z0-9]{4}$/)
      expect(created.columns.length).toBe(3)
      expect(created.tasks).toEqual([])
      expect((await api.boards.get(created.id)).id).toBe(created.id)
    })

    it.each([
      ['blank', '   '],
      ['151 characters', 'x'.repeat(151)],
    ])('POST /boards rejects a %s name (400)', async (_l, name) => {
      await signIn()
      await expectError(api.boards.create({ name }), 400, 'VALIDATION_ERROR')
    })

    it('POST /boards/join with an unknown code is 404', async () => {
      await signIn()
      await expectError(api.boards.join({ code: 'CHK-0000' }), 404, 'NOT_FOUND')
    })

    it('a non-member cannot read a board (403) until they join with its code — then it is idempotent', async () => {
      await signIn()
      const board = await api.boards.create({ name: 'Private' })

      const { token } = await api.auth.register({
        name: 'J',
        email: unique('join'),
        password: 'secret12',
      })
      setToken(token)
      await expectError(api.boards.get(board.id), 403, 'FORBIDDEN')

      const joined = await api.boards.join({ code: board.code.toLowerCase() })
      expect(joined.id).toBe(board.id)
      expect((await api.boards.join({ code: board.code })).id).toBe(board.id)
      expect((await api.boards.get(board.id)).id).toBe(board.id)
    })

    it('a new account already owns a board with starter columns, and can list it', async () => {
      const { token, user } = await api.auth.register({
        name: 'Ася',
        email: unique('own'),
        password: 'secret12',
      })
      setToken(token)
      const boards = await api.boards.list()
      expect(boards).toHaveLength(1)
      expect(boards[0].name).toContain(user.name)
      expect(boards[0].code).toMatch(/^CHK-[A-Z0-9]{4}$/)
      expect((await api.boards.get(boards[0].id)).columns).toHaveLength(3)
    })

    it('a new account is NOT a member of other teams boards', async () => {
      const board = await signInAsDemo()
      const { token } = await api.auth.register({
        name: 'Solo',
        email: unique('alone'),
        password: 'secret12',
      })
      setToken(token)
      await expectError(api.boards.get(board.id), 403, 'FORBIDDEN')
    })
  })

  describe('tasks', () => {
    it('create → update → delete round trip', async () => {
      const board = await signInAsDemo()
      const col = board.columns[0].id
      const created = await api.tasks.create(board.id, task(col, { title: '  Padded  ' }))
      expect(created).toMatchObject({ title: 'Padded', columnId: col, priority: 'medium' })
      expect(created.id).toBeTruthy()

      const updated = await api.tasks.update(created.id, {
        priority: 'high',
        position: { x: 9, y: 9 },
      })
      expect(updated).toMatchObject({ priority: 'high', position: { x: 9, y: 9 }, title: 'Padded' })
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.updatedAt).getTime(),
      )

      await api.tasks.remove(created.id)
      const after = await api.boards.get(board.id)
      expect(after.tasks.some((t) => t.id === created.id)).toBe(false)
    })

    it.each([
      ['empty title', { title: '' }],
      ['whitespace title', { title: '   ' }],
      ['256-character title', { title: 'x'.repeat(256) }],
      ['unknown priority', { priority: 'urgent' as never }],
      ['non-numeric position', { position: { x: 'a', y: 1 } as never }],
    ])('rejects %s (400 VALIDATION_ERROR)', async (_label, over) => {
      const board = await signInAsDemo()
      await expectError(
        api.tasks.create(board.id, task(board.columns[0].id, over)),
        400,
        'VALIDATION_ERROR',
      )
    })

    it('rejects a task in a column that does not exist (404 NOT_FOUND)', async () => {
      const board = await signInAsDemo()
      await expectError(
        api.tasks.create(board.id, task('00000000-0000-0000-0000-000000000000')),
        404,
        'NOT_FOUND',
      )
    })

    it('a task may belong to no column (columnId null) and can be moved out of / into one', async () => {
      const board = await signInAsDemo()
      const col = board.columns[0].id
      const free = await api.tasks.create(board.id, task(null, { title: 'Free' }))
      expect(free.columnId).toBeNull()
      const attached = await api.tasks.update(free.id, { columnId: col })
      expect(attached.columnId).toBe(col)
      const detached = await api.tasks.update(free.id, { columnId: null })
      expect(detached.columnId).toBeNull()
      await api.tasks.remove(free.id)
    })

    it("a task can never go into another board's column", async () => {
      const board = await signInAsDemo()
      const other = await api.boards.create({ name: 'Other' })
      await expectError(api.tasks.create(board.id, task(other.columns[0].id)), 404, 'NOT_FOUND')
    })

    it('updating or deleting an unknown task is 404', async () => {
      await signIn()
      await expectError(api.tasks.update('task-ghost', { title: 'x' }), 404, 'NOT_FOUND')
      await expectError(api.tasks.remove('task-ghost'), 404, 'NOT_FOUND')
    })

    it('a second delete of the same task is 404, not a silent success', async () => {
      const board = await signInAsDemo()
      const created = await api.tasks.create(board.id, task(board.columns[0].id))
      await api.tasks.remove(created.id)
      await expectError(api.tasks.remove(created.id), 404, 'NOT_FOUND')
    })

    it('a non-member cannot change or delete a task of that board (403)', async () => {
      const board = await signInAsDemo()
      const created = await api.tasks.create(board.id, task(board.columns[0].id))
      const { token } = await api.auth.register({
        name: 'Out',
        email: unique('out'),
        password: 'secret12',
      })
      setToken(token)
      await expectError(api.tasks.update(created.id, { title: 'stolen' }), 403, 'FORBIDDEN')
      await expectError(api.tasks.remove(created.id), 403, 'FORBIDDEN')
    })
  })

  describe('columns', () => {
    it('create → resize/move → delete round trip, size persisted', async () => {
      const board = await signInAsDemo()
      const created = await api.columns.create(board.id, {
        name: 'Review',
        color: '#8d97a3',
        position: { x: 5, y: 6 },
      })
      const updated = await api.columns.update(created.id, {
        position: { x: 50, y: 60 },
        width: 640,
        height: 900,
      })
      expect(updated).toMatchObject({
        name: 'Review',
        position: { x: 50, y: 60 },
        width: 640,
        height: 900,
      })

      const reread = (await api.boards.get(board.id)).columns.find((c) => c.id === created.id)
      expect(reread).toMatchObject({ width: 640, height: 900 })
      await api.columns.remove(created.id)
    })

    it('deleting a column moves its cards to the first remaining column instead of losing them', async () => {
      const board = await signInAsDemo()
      const doomed = await api.columns.create(board.id, {
        name: 'Doomed',
        color: '#8d97a3',
        position: { x: 0, y: 900 },
      })
      const card = await api.tasks.create(board.id, task(doomed.id, { title: 'survivor' }))

      await api.columns.remove(doomed.id)

      const after = await api.boards.get(board.id)
      const kept = after.tasks.find((t) => t.id === card.id)
      expect(kept).toBeDefined()
      expect(kept?.columnId).not.toBe(doomed.id)
      expect(after.columns.some((c) => c.id === kept?.columnId)).toBe(true)
      await api.tasks.remove(card.id)
    })

    it('the last column of a board cannot be deleted (400)', async () => {
      await signIn()
      const board = await api.boards.create({ name: 'One column left' })
      for (const c of board.columns.slice(1)) await api.columns.remove(c.id)
      await expectError(api.columns.remove(board.columns[0].id), 400, 'VALIDATION_ERROR')
    })

    it('rejects a CSS-variable colour: the colour is #rrggbb (400)', async () => {
      const board = await signInAsDemo()
      await expectError(
        api.columns.create(board.id, {
          name: 'X',
          color: 'var(--reel-1)',
          position: { x: 0, y: 0 },
        }),
        400,
        'VALIDATION_ERROR',
      )
    })

    it('rejects an empty column name (400)', async () => {
      const board = await signInAsDemo()
      await expectError(
        api.columns.create(board.id, { name: ' ', color: '#000000', position: { x: 0, y: 0 } }),
        400,
        'VALIDATION_ERROR',
      )
    })

    it('rejects a size outside the allowed range (400)', async () => {
      const board = await signInAsDemo()
      await expectError(
        api.columns.update(board.columns[0].id, { width: 10 }),
        400,
        'VALIDATION_ERROR',
      )
      await expectError(
        api.columns.update(board.columns[0].id, { height: 99999 }),
        400,
        'VALIDATION_ERROR',
      )
    })
  })
})
