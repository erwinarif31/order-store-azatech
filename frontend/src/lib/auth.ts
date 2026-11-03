import { ref } from 'vue'
import { api, ApiError, TOKEN_KEY } from './api'

export interface User {
  id: string
  name: string
  email: string
}

export const currentUser = ref<User | null>(null)
export const sessionMessage = ref('')

export async function login(email: string, password: string): Promise<void> {
  const previousToken = sessionStorage.getItem(TOKEN_KEY)
  try {
    const data = await api<{ token: string; user: User }>('/login', { body: { email, password } })
    if (sessionStorage.getItem(TOKEN_KEY) !== previousToken) return
    sessionStorage.setItem(TOKEN_KEY, data.token)
    currentUser.value = data.user
    sessionMessage.value = ''
  } catch (error) {
    if (sessionStorage.getItem(TOKEN_KEY) === previousToken && error instanceof ApiError && error.status === 401) logout()
    throw error
  }
}

export async function restore(): Promise<boolean> {
  const token = sessionStorage.getItem(TOKEN_KEY)
  currentUser.value = null
  if (!token) return false
  try {
    const data = await api<{ user: User }>('/me', { authenticated: true, suppressUnauthorized: true })
    if (sessionStorage.getItem(TOKEN_KEY) !== token) return false
    currentUser.value = data.user
    sessionMessage.value = ''
    return true
  } catch (error) {
    if (sessionStorage.getItem(TOKEN_KEY) !== token) return false
    if (error instanceof ApiError && error.status === 401) {
      logout()
      sessionMessage.value = 'Your session has expired. Please sign in again.'
    } else {
      sessionMessage.value = error instanceof Error
        ? error.message
        : 'Unable to verify your session. Please try again.'
    }
    throw error
  }
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  currentUser.value = null
  sessionMessage.value = ''
}
