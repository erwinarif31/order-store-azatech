import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../src/App.vue'

const tokenKey = 'order-desk-token'
const user = { id: 'd1a9b64e-c43a-4ae5-b04f-ae8bc5ef944b', name: 'Store Admin', email: 'admin@example.com' }
const fetchMock = vi.fn<typeof fetch>()
let wrapper: VueWrapper | undefined

function respond(data: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

function me(): void {
  respond({ success: true, message: 'OK', data: { user } })
}

async function open(path = '/') {
  const { default: router } = await import('../src/router')
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return router
}

async function submit(): Promise<void> {
  await wrapper!.get('#email').setValue(user.email)
  await wrapper!.get('#password').setValue('correct-password')
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('authentication through the real views and route guard', () => {
  it('shows a loading shell until initial session verification finishes', async () => {
    sessionStorage.setItem(tokenKey, 'restored-token')
    let finish!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { default: router } = await import('../src/router')
    wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Checking your session')
    expect(wrapper.find('#account-heading').exists()).toBe(false)
    finish(new Response(JSON.stringify({ success: true, message: 'OK', data: { user } })))
    await router.isReady()
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('#account-heading').text()).toBe('Your account')
  })

  it('returns to login when initial verification times out', async () => {
    sessionStorage.setItem(tokenKey, 'retained-token')
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    try {
      fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      }))
      const { default: router } = await import('../src/router')
      wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()
      expect(wrapper.get('[role="status"]').text()).toContain('Checking your session')
      expect(timeout).toHaveBeenCalledWith(10000)
      controller.abort(new DOMException('Request timed out', 'TimeoutError'))
      await router.isReady()
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/login')
      expect(wrapper.get('[role="alert"]').text()).toContain('took too long to respond')
      expect(wrapper.find('#account-heading').exists()).toBe(false)
      expect(sessionStorage.getItem(tokenKey)).toBe('retained-token')
    } finally {
      timeout.mockRestore()
    }
  })

  it('redirects an unauthenticated protected visit before showing the account', async () => {
    const router = await open()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper!.find('#account-heading').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs in, stores only a tab token, verifies identity and navigates to the account', async () => {
    sessionStorage.setItem(tokenKey, 'stale-token')
    // An unavailable verification leaves the login view usable with the token preserved.
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const router = await open('/login')
    respond({ success: true, message: 'OK', data: { token: 'signed-token', user } })
    me()
    await submit()
    expect(sessionStorage.getItem(tokenKey)).toBe('signed-token')
    expect(localStorage.length).toBe(0)
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper!.text()).toContain(user.name)
    expect(wrapper!.text()).toContain(user.email)
    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost:3000/api/login')
    expect(options?.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(options?.body as string)).toEqual({ email: user.email, password: 'correct-password' })
    expect(fetchMock.mock.calls[2]![1]?.headers).toHaveProperty('Authorization', 'Bearer signed-token')
  })

  it('shows invalid credentials without creating a session', async () => {
    await open('/login')
    respond({ success: false, message: 'Invalid email or password', errors: {} }, 401)
    await submit()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Invalid email or password')
    expect(sessionStorage.getItem(tokenKey)).toBeNull()
    expect(wrapper!.find('#account-heading').exists()).toBe(false)
    expect(wrapper!.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('attaches 422 field errors to their inputs', async () => {
    await open('/login')
    respond({ success: false, message: 'Validation failed', errors: {
      email: ['Email is invalid'], password: ['Password is required'],
    } }, 422)
    await submit()
    for (const field of ['email', 'password']) {
      expect(wrapper!.get(`#${field}`).attributes('aria-invalid')).toBe('true')
      expect(wrapper!.get(`#${field}`).attributes('aria-describedby')).toBe(`${field}-error`)
      expect(wrapper!.get(`#${field}-error`).text()).not.toBe('')
    }
    expect(wrapper!.get('[role="alert"]').text()).toContain('Validation failed')
    expect(sessionStorage.getItem(tokenKey)).toBeNull()
  })

  it('restores the tab session using /me with Bearer authorization', async () => {
    sessionStorage.setItem(tokenKey, 'restored-token')
    me()
    const router = await open()
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper!.text()).toContain(user.name)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/me', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer restored-token' }),
    }))
  })

  it('clears an expired token and explains the redirect', async () => {
    sessionStorage.setItem(tokenKey, 'expired-token')
    respond({ success: false, message: 'Unauthorized', errors: {} }, 401)
    const router = await open()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem(tokenKey)).toBeNull()
    expect((await import('../src/lib/auth')).currentUser.value).toBeNull()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Your session has expired')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('signs out, removes the session and replaces the route with login', async () => {
    sessionStorage.setItem(tokenKey, 'signed-token')
    me()
    const router = await open()
    await wrapper!.get('.signout-button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem(tokenKey)).toBeNull()
    expect((await import('../src/lib/auth')).currentUser.value).toBeNull()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows retry guidance for a login network failure', async () => {
    await open('/login')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await submit()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Check your connection and try again')
    expect(sessionStorage.getItem(tokenKey)).toBeNull()
  })

  it('preserves the token on a transient verification failure without rendering protected content or looping', async () => {
    sessionStorage.setItem(tokenKey, 'retained-token')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const router = await open()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem(tokenKey)).toBe('retained-token')
    expect(wrapper!.find('#account-heading').exists()).toBe(false)
    expect(wrapper!.get('[role="alert"]').text()).toContain('try again')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    me()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('redirects a signed-in visitor away from login', async () => {
    sessionStorage.setItem(tokenKey, 'valid-token')
    me()
    me()
    const router = await open('/login')
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper!.find('form').exists()).toBe(false)
  })

  it('shows server retry guidance and preserves an existing token', async () => {
    sessionStorage.setItem(tokenKey, 'retained-token')
    respond({ success: false, message: 'Internal error' }, 503)
    await open()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Please try again shortly')
    expect(sessionStorage.getItem(tokenKey)).toBe('retained-token')
  })

  it('keeps password visibility accessible', async () => {
    await open('/login')
    const toggle = wrapper!.get('.password-toggle')
    expect(wrapper!.get('#password').attributes('type')).toBe('password')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper!.get('#password').attributes('type')).toBe('text')
    expect(toggle.attributes('aria-label')).toBe('Hide password')
    expect(toggle.attributes('aria-pressed')).toBe('true')
  })

  it('disables submit while signing in and prevents duplicate requests', async () => {
    await open('/login')
    let finish!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await wrapper!.get('#email').setValue(user.email)
    await wrapper!.get('#password').setValue('password')
    await wrapper!.get('form').trigger('submit')
    expect(wrapper!.get('button[type="submit"]').text()).toBe('Signing in…')
    expect(wrapper!.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper!.get('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    finish(new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401 }))
    await flushPromises()
    expect(wrapper!.get('button[type="submit"]').text()).toBe('Sign in')
  })
})
