import { ApiError, type ApiErrorCode } from './errors'
import { getToken, notifyUnauthorized } from './session'
import type { CheckllyApi } from './types'

interface ErrorBody {
  error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> }
}

/** Real REST client. Selected when `VITE_API_URL` is set (see ./index.ts). */
export function createHttpApi(baseUrl: string): CheckllyApi {
  const base = baseUrl.replace(/\/+$/, '')

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    const err = (data as ErrorBody | null)?.error
    // A 401 on a protected call means the token is gone/expired; a 401 from
    // /auth/login just means "wrong password" and must not log anyone out.
    if (res.status === 401 && !path.startsWith('/auth/login')) notifyUnauthorized()
    throw new ApiError(
      res.status,
      err?.code ?? (res.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR'),
      err?.message ?? res.statusText,
      err?.fields,
    )
  }

  return {
    auth: {
      register: (input) => request('POST', '/auth/register', input),
      login: (input) => request('POST', '/auth/login', input),
      me: () => request('GET', '/auth/me'),
    },
    boards: {
      list: () => request('GET', '/boards'),
      get: (boardId) => request('GET', `/boards/${encodeURIComponent(boardId)}`),
      create: (input) => request('POST', '/boards', input),
      join: (input) => request('POST', '/boards/join', input),
    },
    columns: {
      create: (boardId, input) =>
        request('POST', `/boards/${encodeURIComponent(boardId)}/columns`, input),
      update: (id, patch) => request('PATCH', `/columns/${encodeURIComponent(id)}`, patch),
      remove: (id) => request('DELETE', `/columns/${encodeURIComponent(id)}`),
    },
    tasks: {
      create: (boardId, input) =>
        request('POST', `/boards/${encodeURIComponent(boardId)}/tasks`, input),
      update: (id, patch) => request('PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
      remove: (id) => request('DELETE', `/tasks/${encodeURIComponent(id)}`),
    },
  }
}
