import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { createHttpApi } from './http'
import { setToken, setUnauthorizedHandler } from './session'

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
    await api.boards.get('board-1')
    expect(headersOf(0).Authorization).toBeUndefined()

    setToken('abc')
    await api.boards.get('board-1')
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
