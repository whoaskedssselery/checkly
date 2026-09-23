import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { createHttpApi } from './http'
import { DEMO_EMAIL, DEMO_PASSWORD, mockApi, resetMockDb } from './mock'
import { setToken } from './session'
import type { CheckllyApi, TaskCreate } from './types'

/**
 * API contract suite — the "HTTP requests straight at the API" part of QA.
 *
 * By default it runs against the localStorage mock. Point it at the real
 * backend with
 *
 *   CONTRACT_API_URL=http://localhost:3000/api pnpm test contract
 *
 * and the very same assertions run over HTTP. The server must have the seed
 * from backend/prisma/seed.ts (a demo user, board-1 and its columns).
 */
const url = process.env.CONTRACT_API_URL
const api: CheckllyApi = url ? createHttpApi(url) : mockApi
const board = 'board-1'

async function expectError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({ status, code })
}

const task = (over: Partial<TaskCreate> = {}): TaskCreate => ({
  title: 'Contract task',
  columnId: 'col-backlog',
  priority: 'medium',
  tags: [],
  position: { x: 1, y: 2 },
  ...over,
})

async function firstColumnId(): Promise<string> {
  const { columns } = await api.boards.get(board)
  return columns[0].id
}

describe(`API contract (${url ? 'real server' : 'mock'})`, () => {
  beforeEach(async () => {
    if (!url) resetMockDb()
    setToken(null)
  })

  async function signIn() {
    const { token } = await api.auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    setToken(token)
  }

  describe('auth', () => {
    it('POST /auth/register returns a token and a user without a password', async () => {
      const email = `qa+${Date.now()}@checkly.dev`
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
      ['GET board', () => api.boards.get(board)],
      ['POST task', () => api.tasks.create(board, task())],
      ['PATCH task', () => api.tasks.update('task-1', { title: 'x' })],
      ['DELETE task', () => api.tasks.remove('task-1')],
      [
        'POST column',
        () => api.columns.create(board, { name: 'x', color: 'red', position: { x: 0, y: 0 } }),
      ],
      ['DELETE column', () => api.columns.remove('col-done')],
    ])('%s without a token is 401', async (_label, call) => {
      await expectError(call(), 401, 'UNAUTHORIZED')
    })
  })

  describe('board', () => {
    it('GET /boards/:id returns columns and tasks that reference existing columns', async () => {
      await signIn()
      const res = await api.boards.get(board)
      expect(res.columns.length).toBeGreaterThan(0)
      const ids = new Set(res.columns.map((c) => c.id))
      for (const t of res.tasks) expect(t.columnId === null || ids.has(t.columnId)).toBe(true)
    })

    it('an unknown board is 404', async () => {
      await signIn()
      await expectError(api.boards.get('no-such-board'), 404, 'NOT_FOUND')
    })
  })

  describe('tasks', () => {
    it('create → update → delete round trip', async () => {
      await signIn()
      const col = await firstColumnId()
      const created = await api.tasks.create(board, task({ columnId: col, title: '  Padded  ' }))
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
      const after = await api.boards.get(board)
      expect(after.tasks.some((t) => t.id === created.id)).toBe(false)
    })

    it.each([
      ['empty title', { title: '' }],
      ['whitespace title', { title: '   ' }],
      ['256-character title', { title: 'x'.repeat(256) }],
      ['unknown priority', { priority: 'urgent' as never }],
      ['non-numeric position', { position: { x: 'a', y: 1 } as never }],
    ])('rejects %s (400 VALIDATION_ERROR)', async (_label, over) => {
      await signIn()
      await expectError(api.tasks.create(board, task(over)), 400, 'VALIDATION_ERROR')
    })

    it('a task may belong to no column (columnId null) and can be moved out of / into one', async () => {
      await signIn()
      const col = await firstColumnId()
      const free = await api.tasks.create(board, task({ columnId: null, title: 'Free' }))
      expect(free.columnId).toBeNull()
      const attached = await api.tasks.update(free.id, { columnId: col })
      expect(attached.columnId).toBe(col)
      const detached = await api.tasks.update(free.id, { columnId: null })
      expect(detached.columnId).toBeNull()
      await api.tasks.remove(free.id)
    })

    it('rejects a task in a column that does not exist (404 NOT_FOUND)', async () => {
      await signIn()
      await expectError(api.tasks.create(board, task({ columnId: 'col-ghost' })), 404, 'NOT_FOUND')
    })

    it('updating or deleting an unknown task is 404', async () => {
      await signIn()
      await expectError(api.tasks.update('task-ghost', { title: 'x' }), 404, 'NOT_FOUND')
      await expectError(api.tasks.remove('task-ghost'), 404, 'NOT_FOUND')
    })

    it('a second delete of the same task is 404, not a silent success', async () => {
      await signIn()
      const created = await api.tasks.create(board, task({ columnId: await firstColumnId() }))
      await api.tasks.remove(created.id)
      await expectError(api.tasks.remove(created.id), 404, 'NOT_FOUND')
    })
  })

  describe('columns', () => {
    it('create → rename/move → delete round trip', async () => {
      await signIn()
      const created = await api.columns.create(board, {
        name: 'Review',
        color: '#8d97a3',
        position: { x: 5, y: 6 },
      })
      const updated = await api.columns.update(created.id, { position: { x: 50, y: 60 } })
      expect(updated).toMatchObject({ name: 'Review', position: { x: 50, y: 60 } })
      await api.columns.remove(created.id)
    })

    it('refuses to delete a column that still holds tasks (409 COLUMN_NOT_EMPTY)', async () => {
      await signIn()
      const { tasks } = await api.boards.get(board)
      const inColumn = tasks.find((t) => t.columnId !== null)
      await expectError(api.columns.remove(inColumn?.columnId as string), 409, 'COLUMN_NOT_EMPTY')
    })

    it('rejects a CSS-variable colour: the column colour column is VARCHAR(7) hex (400)', async () => {
      await signIn()
      await expectError(
        api.columns.create(board, { name: 'X', color: 'var(--reel-1)', position: { x: 0, y: 0 } }),
        400,
        'VALIDATION_ERROR',
      )
    })

    it('rejects an empty column name (400)', async () => {
      await signIn()
      await expectError(
        api.columns.create(board, { name: ' ', color: 'red', position: { x: 0, y: 0 } }),
        400,
        'VALIDATION_ERROR',
      )
    })
  })
})

describe(`API contract: boards (${url ? 'real server' : 'mock'})`, () => {
  beforeEach(() => {
    if (!url) resetMockDb()
    setToken(null)
  })

  async function signInAs(email: string, password: string) {
    const { token } = await api.auth.login({ email, password })
    setToken(token)
  }

  it('POST /boards creates a board with starter columns and a shareable code', async () => {
    await signInAs(DEMO_EMAIL, DEMO_PASSWORD)
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
    await signInAs(DEMO_EMAIL, DEMO_PASSWORD)
    await expectError(api.boards.create({ name }), 400, 'VALIDATION_ERROR')
  })

  it('POST /boards/join with an unknown code is 404', async () => {
    await signInAs(DEMO_EMAIL, DEMO_PASSWORD)
    await expectError(api.boards.join({ code: 'CHK-0000' }), 404, 'NOT_FOUND')
  })

  it('a non-member cannot read a board (403) until they join with its code — then it is idempotent', async () => {
    await signInAs(DEMO_EMAIL, DEMO_PASSWORD)
    const board = await api.boards.create({ name: 'Private' })

    const email = `join+${Date.now()}@checkly.dev`
    const { token } = await api.auth.register({ name: 'J', email, password: 'secret12' })
    setToken(token)
    await expectError(api.boards.get(board.id), 403, 'FORBIDDEN')

    const joined = await api.boards.join({ code: board.code.toLowerCase() })
    expect(joined.id).toBe(board.id)
    expect((await api.boards.join({ code: board.code })).id).toBe(board.id)
    expect((await api.boards.get(board.id)).id).toBe(board.id)
  })

  it("a task cannot be put into another board's column (404)", async () => {
    await signInAs(DEMO_EMAIL, DEMO_PASSWORD)
    const other = await api.boards.create({ name: 'Other' })
    await expectError(
      api.tasks.create('board-1', task({ columnId: other.columns[0].id })),
      404,
      'NOT_FOUND',
    )
  })
})

describe(`API contract: personal board (${url ? 'real server' : 'mock'})`, () => {
  beforeEach(() => {
    if (!url) resetMockDb()
    setToken(null)
  })

  it('a new account already owns a board with starter columns, and can list it', async () => {
    const email = `own+${Date.now()}@checkly.dev`
    const { token, user } = await api.auth.register({ name: 'Ася', email, password: 'secret12' })
    setToken(token)
    const boards = await api.boards.list()
    expect(boards).toHaveLength(1)
    expect(boards[0].name).toContain(user.name)
    expect(boards[0].code).toMatch(/^CHK-[A-Z0-9]{4}$/)
    expect((await api.boards.get(boards[0].id)).columns).toHaveLength(3)
  })

  it('a new account is NOT a member of other teams boards', async () => {
    const email = `alone+${Date.now()}@checkly.dev`
    const { token } = await api.auth.register({ name: 'Solo', email, password: 'secret12' })
    setToken(token)
    await expectError(api.boards.get('board-1'), 403, 'FORBIDDEN')
  })

  it('GET /boards needs a token (401)', async () => {
    await expectError(api.boards.list(), 401, 'UNAUTHORIZED')
  })
})
