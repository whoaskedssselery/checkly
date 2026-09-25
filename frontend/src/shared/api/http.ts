import { ApiError, type ApiErrorCode } from './errors'
import { getRefreshToken, getToken, notifyUnauthorized, setRefreshToken, setToken } from './session'
import type { BoardDto, CheckllyApi, ColumnDto, TaskDto, UserDto } from './types'

/**
 * What the NestJS backend answers with on failure. The older contract
 * (`{ error: { code, message, fields } }`) is still understood, so a server
 * that follows docs/release/openapi.yaml works too.
 */
interface ErrorBody {
  statusCode?: number
  message?: string | string[]
  error?: string | { code?: ApiErrorCode; message?: string; fields?: Record<string, string> }
}

interface SessionResponse {
  user: UserDto
  accessToken?: string
  refreshToken?: string
  token?: string
}

interface BoardSummaryResponse {
  id: string
  code: string
  name: string
  // The backend sends the whole board in one response; older servers only a summary.
  columns?: ColumnDto[]
  tasks?: TaskDto[]
}

/** Map an HTTP failure to the app's error codes. */
function codeFor(status: number, path: string, declared?: ApiErrorCode): ApiErrorCode {
  if (declared) return declared
  if (status === 400) return 'VALIDATION_ERROR'
  if (status === 401) return path.startsWith('/auth/login') ? 'INVALID_CREDENTIALS' : 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return path.startsWith('/auth/register') ? 'EMAIL_TAKEN' : 'CONFLICT'
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  if (status === 429) return 'RATE_LIMITED'
  return status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR'
}

/**
 * Real REST client. Selected when `VITE_API_URL` is set (see ./index.ts).
 *
 * The backend's own shapes differ from the app's in a few places, so this is
 * also the adapter: it turns `{ accessToken, refreshToken }` into a session,
 * builds a whole board from three requests, and refreshes an expired access
 * token once, quietly, before giving up and logging the user out.
 */
export function createHttpApi(baseUrl: string): CheckllyApi {
  const base = baseUrl.replace(/\/+$/, '')

  // One refresh at a time: the backend rotates refresh tokens (each is single
  // use), so two parallel refreshes would spend the token twice and log out.
  let refreshing: Promise<boolean> | null = null

  async function refreshSession(): Promise<boolean> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    refreshing ??= (async () => {
      try {
        const res = await fetch(`${base}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return false
        const data = (await res.json()) as SessionResponse
        if (!data.accessToken) return false
        setToken(data.accessToken)
        setRefreshToken(data.refreshToken ?? null)
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }

    if (res.status === 204) return undefined as T

    const data: unknown = await res.json().catch(() => null)
    if (res.ok) return data as T

    const isAuthCall = path.startsWith('/auth/')
    // An expired access token is not the end of the session: try the refresh
    // token once, then repeat the request.
    if (res.status === 401 && !isAuthCall && !retried && (await refreshSession())) {
      return request<T>(method, path, body, true)
    }
    // A 401 on a protected call means the session is gone; a 401 from
    // /auth/login just means "wrong password" and must not log anyone out.
    if (res.status === 401 && !path.startsWith('/auth/login')) notifyUnauthorized()

    const err = data as ErrorBody | null
    const declared = typeof err?.error === 'object' ? err.error : undefined
    const message =
      declared?.message ?? (Array.isArray(err?.message) ? err.message.join('; ') : err?.message)
    throw new ApiError(
      res.status,
      codeFor(res.status, path, declared?.code),
      message ?? res.statusText,
      declared?.fields,
    )
  }

  const startSession = (data: SessionResponse) => {
    const token = data.accessToken ?? data.token
    if (!token) throw new ApiError(500, 'SERVER_ERROR', 'The server sent no access token')
    // The refresh token is kept aside; the app itself only needs the access token.
    setRefreshToken(data.refreshToken ?? null)
    return { token, user: data.user }
  }

  async function fetchBoard(summary: BoardSummaryResponse): Promise<BoardDto> {
    if (summary.columns && summary.tasks) {
      return {
        id: summary.id,
        code: summary.code,
        name: summary.name,
        columns: summary.columns,
        tasks: summary.tasks,
      }
    }
    const id = encodeURIComponent(summary.id)
    const [columns, tasks] = await Promise.all([
      request<ColumnDto[]>('GET', `/boards/${id}/columns`),
      request<TaskDto[]>('GET', `/boards/${id}/tasks`),
    ])
    return { id: summary.id, code: summary.code, name: summary.name, columns, tasks }
  }

  return {
    auth: {
      register: async (input) => startSession(await request('POST', '/auth/register', input)),
      login: async (input) => startSession(await request('POST', '/auth/login', input)),
      me: () => request('GET', '/auth/me'),
      logout: async () => {
        const refreshToken = getRefreshToken()
        setRefreshToken(null)
        if (!refreshToken) return
        // Revoke the refresh token on the server; a failure changes nothing
        // for the user, who is logging out anyway.
        await request('POST', '/auth/logout', { refreshToken }).catch(() => {})
      },
    },
    boards: {
      list: () => request('GET', '/boards'),
      get: async (boardId) =>
        fetchBoard(
          await request<BoardSummaryResponse>('GET', `/boards/${encodeURIComponent(boardId)}`),
        ),
      create: async (input) => fetchBoard(await request('POST', '/boards', input)),
      join: async (input) => fetchBoard(await request('POST', '/boards/join', input)),
    },
    columns: {
      create: (boardId, input) =>
        request('POST', `/boards/${encodeURIComponent(boardId)}/columns`, input),
      update: (id, patch) => request('PATCH', `/columns/${encodeURIComponent(id)}`, patch),
      remove: async (id) => {
        await request('DELETE', `/columns/${encodeURIComponent(id)}`)
      },
    },
    tasks: {
      create: (boardId, input) =>
        request('POST', `/boards/${encodeURIComponent(boardId)}/tasks`, input),
      update: (id, patch) => request('PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
      remove: async (id) => {
        await request('DELETE', `/tasks/${encodeURIComponent(id)}`)
      },
    },
  }
}
