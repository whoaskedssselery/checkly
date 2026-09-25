import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { createHttpApi } from './http'
import {
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
  setUnauthorizedHandler,
} from './session'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('http client', () => {
  const api = createHttpApi('http://api.test/v1/')

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setUnauthorizedHandler(null)
  })

  const fetchMock = () => vi.mocked(fetch)
  const headersOf = (call: number) =>
    (fetchMock().mock.calls[call][1]?.headers ?? {}) as Record<string, string>

  it('builds the URL without a double slash and sends JSON', async () => {
    fetchMock().mockResolvedValue(json(200, { token: 't', user: {} }))
    await api.auth.login({ email: 'a@b.co', password: 'secret12' })
    const [url, init] = fetchMock().mock.calls[0]
    expect(url).toBe('http://api.test/v1/auth/login')
    expect(init?.method).toBe('POST')
    expect(headersOf(0)['Content-Type']).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'secret12' }))
  })

  it('sends the bearer token when there is one, and none when there is not', async () => {
    fetchMock().mockResolvedValue(json(200, {}))
    await api.boards.list()
    expect(headersOf(0).Authorization).toBeUndefined()

    setToken('abc')
    await api.boards.list()
    expect(headersOf(1).Authorization).toBe('Bearer abc')
  })

  it('encodes path segments', async () => {
    fetchMock().mockResolvedValue(json(204))
    await api.tasks.remove('a/b c')
    expect(fetchMock().mock.calls[0][0]).toBe('http://api.test/v1/tasks/a%2Fb%20c')
  })

  it('treats 204 as success with no body', async () => {
    fetchMock().mockResolvedValue(json(204))
    await expect(api.tasks.remove('1')).resolves.toBeUndefined()
  })

  it('maps an error body to ApiError with code and field errors', async () => {
    fetchMock().mockResolvedValue(
      json(400, {
        error: { code: 'VALIDATION_ERROR', message: 'bad', fields: { title: 'required' } },
      }),
    )
    const err = await api.tasks
      .create('board-1', {
        title: '',
        columnId: 'c',
        priority: 'low',
        tags: [],
        position: { x: 0, y: 0 },
      })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { title: 'required' },
    })
  })

  it('reports a dropped connection as NETWORK_ERROR', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.auth.me()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('maps a 5xx without a JSON body to SERVER_ERROR', async () => {
    fetchMock().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(api.boards.get('board-1')).rejects.toMatchObject({
      status: 502,
      code: 'SERVER_ERROR',
    })
  })

  it('a 401 on a protected call signals the session is over', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock().mockResolvedValue(
      json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
    )
    await expect(api.boards.get('board-1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('a 401 from /auth/login (wrong password) does NOT log anyone out', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock().mockResolvedValue(
      json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'wrong' } }),
    )
    await expect(api.auth.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('http client: NestJS backend adapter', () => {
  const api = createHttpApi('http://api.test')

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setUnauthorizedHandler(null)
  })
  const fetchMock = () => vi.mocked(fetch)
  const urls = () => fetchMock().mock.calls.map((c) => String(c[0]))
  const authOf = (init?: RequestInit) =>
    ((init?.headers ?? {}) as Record<string, string>).Authorization

  it('turns { accessToken, refreshToken, user } into a session and keeps the refresh token aside', async () => {
    fetchMock().mockResolvedValue(
      json(200, { user: { id: 'u1', email: 'a@b.co' }, accessToken: 'acc', refreshToken: 'ref' }),
    )
    const res = await api.auth.login({ email: 'a@b.co', password: 'secret12' })
    expect(res).toEqual({ token: 'acc', user: { id: 'u1', email: 'a@b.co' } })
    expect(getRefreshToken()).toBe('ref')
  })

  it('still understands a server that answers with { token }', async () => {
    fetchMock().mockResolvedValue(json(200, { token: 't1', user: { id: 'u1' } }))
    expect((await api.auth.login({ email: 'a@b.co', password: 'x' })).token).toBe('t1')
  })

  it('a reply with no access token is an error, not a half-open session', async () => {
    fetchMock().mockResolvedValue(json(200, { user: { id: 'u1' } }))
    await expect(api.auth.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    })
  })

  it.each([
    [400, '/auth/register', 'VALIDATION_ERROR'],
    [401, '/auth/login', 'INVALID_CREDENTIALS'],
    [403, '/boards/b1', 'FORBIDDEN'],
    [404, '/boards/b1', 'NOT_FOUND'],
    [409, '/auth/register', 'EMAIL_TAKEN'],
    [500, '/boards', 'SERVER_ERROR'],
  ])('maps a Nest %i on %s to %s', async (status, path, code) => {
    fetchMock().mockResolvedValue(json(status, { statusCode: status, message: 'text', error: 'x' }))
    const call =
      path === '/auth/register'
        ? api.auth.register({ name: 'n', email: 'a@b.co', password: 'secret12' })
        : path === '/auth/login'
          ? api.auth.login({ email: 'a@b.co', password: 'x' })
          : api.boards.list()
    await expect(call).rejects.toMatchObject({ status, code })
  })

  it('joins the messages of a validation failure', async () => {
    fetchMock().mockResolvedValue(
      json(400, { statusCode: 400, message: ['Некорректный email', 'Минимум 6 символов'] }),
    )
    await expect(api.auth.register({ name: '', email: 'x', password: '1' })).rejects.toMatchObject({
      message: 'Некорректный email; Минимум 6 символов',
    })
  })

  it('builds a whole board from the board, its columns and its tasks', async () => {
    fetchMock().mockImplementation(async (url) => {
      const u = String(url)
      if (u.endsWith('/columns')) return json(200, [{ id: 'c1' }])
      if (u.endsWith('/tasks')) return json(200, [{ id: 't1' }, { id: 't2' }])
      return json(200, { id: 'b1', code: 'CHK-AAAA', name: 'Доска', ownerId: 'u1' })
    })
    const board = await api.boards.get('b1')
    expect(board).toEqual({
      id: 'b1',
      code: 'CHK-AAAA',
      name: 'Доска',
      columns: [{ id: 'c1' }],
      tasks: [{ id: 't1' }, { id: 't2' }],
    })
    expect(urls().sort()).toEqual([
      'http://api.test/boards/b1',
      'http://api.test/boards/b1/columns',
      'http://api.test/boards/b1/tasks',
    ])
  })

  it('an expired access token is renewed once with the refresh token, and the request is repeated', async () => {
    setToken('old')
    setRefreshToken('ref1')
    fetchMock().mockImplementation(async (url, init) => {
      const u = String(url)
      if (u.endsWith('/auth/refresh'))
        return json(200, { user: {}, accessToken: 'new', refreshToken: 'ref2' })
      const auth = authOf(init)
      return auth === 'Bearer new'
        ? json(200, [])
        : json(401, { statusCode: 401, message: 'Unauthorized' })
    })
    await expect(api.boards.list()).resolves.toEqual([])
    expect(getToken()).toBe('new')
    expect(getRefreshToken()).toBe('ref2')
    expect(urls()).toEqual([
      'http://api.test/boards',
      'http://api.test/auth/refresh',
      'http://api.test/boards',
    ])
  })

  it('parallel 401s share ONE refresh (the backend spends each refresh token once)', async () => {
    setToken('old')
    setRefreshToken('ref1')
    let refreshes = 0
    fetchMock().mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshes++
        return json(200, { user: {}, accessToken: 'new', refreshToken: 'ref2' })
      }
      const auth = authOf(init)
      return auth === 'Bearer new' ? json(200, []) : json(401, { statusCode: 401 })
    })
    await Promise.all([api.boards.list(), api.boards.list(), api.boards.list()])
    expect(refreshes).toBe(1)
  })

  it('logs out when the refresh token is refused too', async () => {
    setToken('old')
    setRefreshToken('dead')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock().mockResolvedValue(json(401, { statusCode: 401, message: 'Unauthorized' }))
    await expect(api.boards.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('with no refresh token a 401 logs out straight away, without a refresh call', async () => {
    setToken('old')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock().mockResolvedValue(json(401, { statusCode: 401 }))
    await expect(api.boards.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(urls()).toEqual(['http://api.test/boards'])
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('logout revokes the refresh token on the server and forgets it locally', async () => {
    setRefreshToken('ref1')
    fetchMock().mockResolvedValue(json(204))
    await api.auth.logout()
    expect(urls()).toEqual(['http://api.test/auth/logout'])
    expect(JSON.parse(String(fetchMock().mock.calls[0][1]?.body))).toEqual({ refreshToken: 'ref1' })
    expect(getRefreshToken()).toBeNull()
  })
})
