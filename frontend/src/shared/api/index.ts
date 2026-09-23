import { createHttpApi } from './http'
import { mockApi } from './mock'
import type { CheckllyApi } from './types'

/**
 * One switch decides where data comes from: set `VITE_API_URL` at build time
 * to talk to the real backend, leave it unset to run on the localStorage mock.
 */
const baseUrl = import.meta.env.VITE_API_URL as string | undefined

export const api: CheckllyApi = baseUrl ? createHttpApi(baseUrl) : mockApi
export const isMockApi = !baseUrl

export { ApiError, describeApiError } from './errors'
export type * from './types'
