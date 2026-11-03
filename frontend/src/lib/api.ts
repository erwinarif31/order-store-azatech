export const TOKEN_KEY = 'order-desk-token'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '')

export interface Pagination { page: number; per_page: number; total: number }
export interface Page<T> { data: T[]; meta: Pagination }
interface RequestOptions {
  body?: unknown
  authenticated?: boolean
  method?: 'GET' | 'POST' | 'PATCH'
  headers?: Record<string, string>
  suppressUnauthorized?: boolean
}
let unauthorizedHandler: (() => void) | undefined
export function setUnauthorizedHandler(callback: () => void): void { unauthorizedHandler = callback }

async function request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: Pagination }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const token = options.authenticated ? sessionStorage.getItem(TOKEN_KEY) : null
  if (token) headers.Authorization = `Bearer ${token}`

  const signal = AbortSignal.timeout(10000)
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
  } catch {
    if (signal.aborted) {
      throw new ApiError('The server took too long to respond. Please try again.', 0)
    }
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0)
  }

  if (response.status === 401 && options.authenticated && !options.suppressUnauthorized && sessionStorage.getItem(TOKEN_KEY) === token) {
    sessionStorage.removeItem(TOKEN_KEY)
    unauthorizedHandler?.()
  }

  let envelope: { success: boolean; message?: string; data?: T; errors?: Record<string, string[]>; meta?: Pagination }
  try {
    envelope = await response.json()
  } catch {
    throw new ApiError('The server returned an unreadable response. Please try again.', response.status)
  }
  if (!response.ok || !envelope.success) {
    const message = response.status >= 500
      ? 'The server is unavailable. Please try again shortly.'
      : envelope.message || 'The request failed. Please try again.'
    throw new ApiError(message, response.status, envelope.errors)
  }
  if (envelope.data === undefined) {
    throw new ApiError('The server returned an incomplete response. Please try again.', response.status)
  }
  return { data: envelope.data, meta: envelope.meta }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, options)).data
}

export async function apiPage<T>(path: string): Promise<Page<T>> {
  const result = await request<T[]>(path, { authenticated: true })
  if (!result.meta) throw new ApiError('The server returned incomplete pagination. Please try again.', 0)
  return { data: result.data, meta: result.meta }
}
