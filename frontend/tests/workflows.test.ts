import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Order, Product } from '../src/lib/store'

const user = { id: 'uuid-user', name: 'Store Admin', email: 'admin@example.com' }
const product: Product = { id: 1, product_code: 'P001', name: 'Ledger book', price: '250000', stock: 12 }
const second: Product = { ...product, id: 2, name: 'Receipt book', product_code: 'P002' }
const saved: Order = {
  id: 7, order_number: 'ORD-007', customer_id: 3, status: 'PENDING', subtotal: '500000', discount_amount: '25000', grand_total: '475000',
  created_at: '2026-01-02T10:00:00.000Z', updated_at: '2026-01-02T10:00:00.000Z', customer: { id: 3, name: 'Customer One' },
  items: [{ id: 4, product_id: 1, product_code: 'OLD-001', product_name: 'Snapshot product', quantity: 2, unit_price: '250000', subtotal: '500000' }],
}
const fetchMock = vi.fn<typeof fetch>()
let wrapper: VueWrapper | undefined
let handler: (url: URL, options: RequestInit) => Response | Promise<Response>
function ok(data: unknown, meta?: unknown) { return new Response(JSON.stringify({ success: true, message: 'OK', data, meta })) }
function fail(status: number, errors = {}, message = 'Validation failed') { return new Response(JSON.stringify({ success: false, message, errors }), { status }) }
function page(data: unknown[], current = 1, total = 21) { return ok(data, { page: current, per_page: 10, total }) }
function defaults(url: URL) {
  if (url.pathname.endsWith('/me')) return ok({ user })
  if (url.pathname.endsWith('/customers')) return ok([{ id: 3, name: 'Customer One', email: null, phone: null }])
  if (url.pathname.endsWith('/products')) return page([product, second], Number(url.searchParams.get('page')))
  if (url.pathname.endsWith('/orders')) return page([saved], Number(url.searchParams.get('page')))
  return ok(saved)
}
async function open(path: string) {
  const { default: router } = await import('../src/router')
  const { default: App } = await import('../src/App.vue')
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return router
}
function button(text: string) { return wrapper!.findAll('button').find(b => b.text() === text)! }
async function click(text: string) { await button(text).trigger('click'); await flushPromises() }
async function cart() {
  await open('/orders/new')
  await wrapper!.get('#customer').setValue('3')
  await wrapper!.get('[aria-label="Add Ledger book"]').trigger('click')
  await wrapper!.get('#quantity-1').setValue(2)
}
async function submit() { await wrapper!.get('form[novalidate]').trigger('submit'); await flushPromises() }
function calls(path: string) { return fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname === `/api${path}`) }

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  sessionStorage.setItem('order-desk-token', 'valid-token')
  window.history.replaceState({}, '', '/')
  handler = (url) => defaults(url)
  fetchMock.mockReset()
  fetchMock.mockImplementation((url, options) => Promise.resolve(handler(new URL(String(url)), options || {})))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals() })

describe('products', () => {
  it.each([200, 401, 503])('ignores stale session verification effects after a newer login: %i', async (status) => {
    let finish!: (response: Response) => void
    handler = () => new Promise(resolve => { finish = resolve })
    const { restore, currentUser, sessionMessage } = await import('../src/lib/auth')
    const pending = restore()
    const newerUser = { ...user, id: 'new-user', name: 'New Admin' }
    sessionStorage.setItem('order-desk-token', 'new-session-token')
    currentUser.value = newerUser
    sessionMessage.value = ''
    finish(status === 200 ? ok({ user }) : fail(status, {}, 'Old session failed'))
    expect(await pending).toBe(false)
    expect(sessionStorage.getItem('order-desk-token')).toBe('new-session-token')
    expect(currentUser.value).toEqual(newerUser)
    expect(sessionMessage.value).toBe('')
  })
  it.each([200, 401])('does not let an older login completion replace a newer session: %i', async (status) => {
    let finish!: (response: Response) => void
    handler = () => new Promise(resolve => { finish = resolve })
    const { login, currentUser } = await import('../src/lib/auth')
    const pending = login('old@example.com', 'password')
    const result = status === 401 ? expect(pending).rejects.toMatchObject({ status: 401 }) : pending
    const newerUser = { ...user, id: 'new-user', name: 'New Admin' }
    sessionStorage.setItem('order-desk-token', 'new-session-token')
    currentUser.value = newerUser
    finish(status === 200 ? ok({ token: 'old-token', user }) : fail(401))
    await result
    expect(sessionStorage.getItem('order-desk-token')).toBe('new-session-token')
    expect(currentUser.value).toEqual(newerUser)
  })
  it('ignores a stale unauthorized response after a newer login', async () => {
    let finish!: (response: Response) => void
    handler = () => new Promise(resolve => { finish = resolve })
    const { products } = await import('../src/lib/store')
    const { setUnauthorizedHandler } = await import('../src/lib/api')
    const unauthorized = vi.fn()
    setUnauthorizedHandler(unauthorized)
    const pending = products('', 1)
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 })
    sessionStorage.setItem('order-desk-token', 'new-session-token')
    finish(fail(401, {}, 'Unauthorized'))
    await rejected
    expect(sessionStorage.getItem('order-desk-token')).toBe('new-session-token')
    expect(unauthorized).not.toHaveBeenCalled()
  })
  it('searches explicitly, resets page, and follows pagination metadata', async () => {
    await open('/products')
    expect(wrapper!.text()).toContain('Ledger book')
    await click('Next')
    expect(new URL(String(calls('/products').at(-1)![0])).searchParams.get('page')).toBe('2')
    await wrapper!.get('#product-search').setValue('receipt')
    expect(calls('/products')).toHaveLength(2)
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    const query = new URL(String(calls('/products').at(-1)![0])).searchParams
    expect(Object.fromEntries(query)).toEqual({ search: 'receipt', page: '1', per_page: '10' })
    expect(wrapper!.text()).toContain('Page 1 of 3')
  })
  it('retries page one of a failed search rather than the previous successful page', async () => {
    await open('/products')
    await click('Next'); await click('Next')
    handler = url => { if (url.pathname.endsWith('/products')) throw new TypeError('offline'); return defaults(url) }
    await wrapper!.get('#product-search').setValue('receipt')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    handler = url => defaults(url)
    await click('Retry products')
    expect(Object.fromEntries(new URL(String(calls('/products').at(-1)![0])).searchParams)).toEqual({ search: 'receipt', page: '1', per_page: '10' })
  })
  it('shows loading, empty and retryable network failure without losing the session', async () => {
    let finish!: (response: Response) => void
    handler = url => url.pathname.endsWith('/products') ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await open('/products')
    expect(wrapper!.text()).toContain('Loading products')
    finish(page([], 1, 0)); await flushPromises()
    expect(wrapper!.text()).toContain('No products found')
    handler = url => { if (url.pathname.endsWith('/products')) throw new TypeError('offline'); return defaults(url) }
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Check your connection')
    expect(sessionStorage.getItem('order-desk-token')).toBe('valid-token')
    handler = url => defaults(url)
    await click('Retry products')
    expect(wrapper!.text()).toContain('Ledger book')
  })
})

describe('create order', () => {
  it('adds unique rows, edits quantities, estimates totals and removes rows', async () => {
    await cart()
    expect(wrapper!.get('[aria-label="Add Ledger book"]').attributes('disabled')).toBeDefined()
    const { money } = await import('../src/lib/format')
    expect(wrapper!.get('.totals').text()).toContain(money(475000))
    await wrapper!.get('[aria-label="Add Receipt book"]').trigger('click')
    expect(wrapper!.findAll('.line-item')).toHaveLength(2)
    await wrapper!.get('[aria-label="Remove Ledger book"]').trigger('click')
    expect(wrapper!.findAll('.line-item')).toHaveLength(1)
    expect(wrapper!.get('[aria-label="Add Ledger book"]').attributes('disabled')).toBeUndefined()
  })
  it('implements both Variant A thresholds and discount cap', async () => {
    const { estimate } = await import('../src/lib/format')
    for (const [subtotal, discount, total] of [
      ['499999.00', '0.00', '499999.00'], ['500000.00', '25000.00', '475000.00'],
      ['999999.00', '49999.95', '949999.05'], ['1000000.00', '100000.00', '900000.00'],
      ['1500000.00', '150000.00', '1350000.00'], ['2000000.00', '150000.00', '1850000.00'],
    ]) {
      expect(estimate([{ price: subtotal!, quantity: 1 }])).toEqual({ subtotal, discount, total })
    }
  })
  it('preserves exact large amounts in server snapshots and estimates', async () => {
    const { estimate, money } = await import('../src/lib/format')
    expect(money('9007199254740993.00')).toBe('Rp\u00a09.007.199.254.740.993,00')
    expect(money('9.007199254740993e+15')).toBe('Rp\u00a09.007.199.254.740.993,00')
    expect(estimate([{ price: '28059810762433', quantity: 321 }])).toEqual({
      subtotal: '9007199254740993.00', discount: '150000.00', total: '9007199254590993.00',
    })
    expect(estimate([{ price: '999999.90', quantity: 1 }])).toEqual({
      subtotal: '999999.90', discount: '50000.00', total: '949999.90',
    })
    expect(estimate([{ price: '5e5', quantity: 1 }])).toEqual({
      subtotal: '500000.00', discount: '25000.00', total: '475000.00',
    })
  })
  it('validates empty cart, customer, negative and fractional quantities locally', async () => {
    await open('/orders/new'); await submit()
    expect(wrapper!.text()).toContain('Choose a customer.')
    expect(wrapper!.text()).toContain('Add at least one product.')
    await wrapper!.get('#customer').setValue('3')
    await wrapper!.get('[aria-label="Add Ledger book"]').trigger('click')
    for (const value of [-1, 1.5, 2147483648]) {
      await wrapper!.get('#quantity-1').setValue(value); await submit()
      expect(wrapper!.get('#quantity-1').attributes('aria-invalid')).toBe('true')
      expect(wrapper!.text()).toContain('positive whole number')
    }
    expect(calls('/orders')).toHaveLength(0)
  })
  it('sends only customer and product quantities, then opens saved detail', async () => {
    handler = (url, options) => options.method === 'POST' ? ok(saved) : defaults(url)
    const router = await open('/orders/new')
    await wrapper!.get('#customer').setValue('3')
    await wrapper!.get('[aria-label="Add Ledger book"]').trigger('click')
    await submit()
    const options = calls('/orders')[0]![1]!
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({ customer_id: 3, items: [{ product_id: 1, quantity: 1 }] })
    expect(options.headers).toHaveProperty('Idempotency-Key', expect.any(String))
    expect(router.currentRoute.value.path).toBe('/orders/7')
    expect(wrapper!.text()).toContain('Snapshot product')
  })
  it('associates all server field arrays and clears stale errors after quantity and row edits', async () => {
    handler = (url, options) => options.method === 'POST' ? fail(422, { 'items.0.quantity': ['Not enough stock', 'Choose fewer'], 'items.1.product_id': ['Unavailable'], customer_id: ['Customer inactive'] }) : defaults(url)
    await cart()
    await wrapper!.get('[aria-label="Add Receipt book"]').trigger('click'); await submit()
    expect(wrapper!.get('#quantity-error-1').text()).toBe('Not enough stock Choose fewer')
    expect(wrapper!.get('#product-error-2').text()).toBe('Unavailable')
    expect(wrapper!.get('#customer-error').text()).toBe('Customer inactive')
    expect(wrapper!.findAll('.line-item')).toHaveLength(2)
    await wrapper!.get('#quantity-1').setValue(1)
    expect(wrapper!.find('#quantity-error-1').exists()).toBe(false)
    await submit()
    await wrapper!.get('[aria-label="Remove Ledger book"]').trigger('click')
    expect(wrapper!.find('#product-error-2').exists()).toBe(false)
    expect(wrapper!.get('#quantity-2').attributes('aria-invalid')).toBe('false')
    await submit()
    await wrapper!.get('#customer').setValue('')
    expect(wrapper!.find('#customer-error').exists()).toBe(false)
  })
  it('retains the cart and stable idempotency key on network retry, changing it after edits', async () => {
    handler = (url, options) => { if (options.method === 'POST') throw new TypeError('offline'); return defaults(url) }
    await cart(); await submit(); await submit()
    expect(wrapper!.findAll('.line-item')).toHaveLength(1)
    const key = (calls('/orders')[0]![1]!.headers as Record<string, string>)['Idempotency-Key']
    expect((calls('/orders')[1]![1]!.headers as Record<string, string>)['Idempotency-Key']).toBe(key)
    await wrapper!.get('#quantity-1').setValue(3); await submit()
    expect((calls('/orders')[2]![1]!.headers as Record<string, string>)['Idempotency-Key']).not.toBe(key)
    expect(calls('/orders')).toHaveLength(3)
  })
  it('reuses the idempotency key after timeout and replaces it on customer edits', async () => {
    await cart()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    handler = (url, options) => options.method === 'POST' ? new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
    }) : defaults(url)
    try {
      await wrapper!.get('form[novalidate]').trigger('submit')
      controller.abort(new DOMException('Timed out', 'TimeoutError'))
      await flushPromises()
      expect(wrapper!.get('[role="alert"]').text()).toContain('took too long')
    } finally { timeout.mockRestore() }
    handler = (url, options) => options.method === 'POST' ? fail(422) : defaults(url)
    await submit()
    const headers = calls('/orders').map(([, options]) => options!.headers as Record<string, string>)
    expect(headers[0]!['Idempotency-Key']).toBe(headers[1]!['Idempotency-Key'])
    await wrapper!.get('#customer').setValue('')
    await wrapper!.get('#customer').setValue('3')
    await submit()
    expect((calls('/orders')[2]![1]!.headers as Record<string, string>)['Idempotency-Key']).not.toBe(headers[0]!['Idempotency-Key'])
  })
  it('blocks navigation away while creation is pending, then opens the saved order', async () => {
    let finish!: (response: Response) => void
    handler = (url, options) => options.method === 'POST' ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await cart()
    const { default: router } = await import('../src/router')
    await wrapper!.get('form[novalidate]').trigger('submit')
    await router.push('/products')
    expect(router.currentRoute.value.path).toBe('/orders/new')
    expect(wrapper!.text()).toContain('Keep this page open')
    finish(ok(saved)); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/orders/7')
  })
  it('keeps submission locked while verifying navigation after successful creation', async () => {
    let verifyNavigation = false
    let finishVerification!: (response: Response) => void
    handler = (url, options) => {
      if (options.method === 'POST') { verifyNavigation = true; return ok(saved) }
      if (url.pathname.endsWith('/me') && verifyNavigation) return new Promise(resolve => { finishVerification = resolve })
      return defaults(url)
    }
    await cart(); await submit()
    expect(button('Opening order…').attributes('disabled')).toBeDefined()
    await wrapper!.get('form[novalidate]').trigger('submit'); await flushPromises()
    expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    finishVerification(ok({ user })); await flushPromises()
    const { default: router } = await import('../src/router')
    expect(router.currentRoute.value.path).toBe('/orders/7')
    expect(wrapper!.text()).toContain('Snapshot product')
  })
  it('keeps a saved order locked after verification fails and retries navigation without another POST', async () => {
    let verificationFails = false
    handler = (url, options) => {
      if (options.method === 'POST') { verificationFails = true; return ok(saved) }
      if (url.pathname.endsWith('/me') && verificationFails) return fail(503, {}, 'Temporary verification failure')
      return defaults(url)
    }
    await cart(); await submit()
    const { default: router } = await import('../src/router')
    expect(router.currentRoute.value.path).toBe('/orders/new')
    expect(wrapper!.text()).toContain('Your order was saved.')
    expect(wrapper!.get('[role="alert"]').text()).toContain('its details could not be opened')
    expect(wrapper!.get('#customer').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('#quantity-1').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('[aria-label="Remove Ledger book"]').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('[aria-label="Add Receipt book"]').attributes('disabled')).toBeDefined()
    await submit()
    expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    verificationFails = false
    await click('View saved order')
    expect(router.currentRoute.value.path).toBe('/orders/7')
    expect(wrapper!.text()).toContain('Snapshot product')
    expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })
  it('keeps a committed cart locked when a guard aborts navigation', async () => {
    handler = (url, options) => options.method === 'POST' ? ok(saved) : defaults(url)
    await cart()
    const { default: router } = await import('../src/router')
    const removeGuard = router.beforeEach(to => to.path === '/orders/7' ? false : true)
    try {
      await submit(); await submit()
      expect(router.currentRoute.value.path).toBe('/orders/new')
      expect(wrapper!.text()).toContain('Your order was saved.')
      expect(wrapper!.get('#quantity-1').attributes('disabled')).toBeDefined()
      expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    } finally { removeGuard() }
    await click('View saved order')
    expect(router.currentRoute.value.path).toBe('/orders/7')
    expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })
  it('keeps the saved order recoverable when navigation throws', async () => {
    handler = (url, options) => options.method === 'POST' ? ok(saved) : defaults(url)
    await cart()
    const { default: router } = await import('../src/router')
    const navigate = vi.spyOn(router, 'push').mockRejectedValueOnce(new Error('Navigation failed'))
    try {
      await submit()
      expect(wrapper!.text()).toContain('Your order was saved.')
      expect(wrapper!.get('[role="alert"]').text()).toContain('its details could not be opened')
      expect(wrapper!.get('#quantity-1').attributes('disabled')).toBeDefined()
    } finally { navigate.mockRestore() }
    await click('View saved order')
    expect(router.currentRoute.value.path).toBe('/orders/7')
    expect(calls('/orders').filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })
  it('does not let an inactive submission navigate away from a newer cart', async () => {
    let finish!: (response: Response) => void
    handler = (url, options) => options.method === 'POST' ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await cart()
    const { default: router } = await import('../src/router')
    await wrapper!.get('form[novalidate]').trigger('submit')
    const { logout } = await import('../src/lib/auth')
    logout()
    await router.replace('/login'); await flushPromises()
    sessionStorage.setItem('order-desk-token', 'new-session')
    await router.push('/orders/new'); await flushPromises()
    await wrapper!.get('#customer').setValue('3')
    await wrapper!.get('[aria-label="Add Receipt book"]').trigger('click')
    finish(ok(saved)); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/orders/new')
    expect(wrapper!.get('.line-item').text()).toContain('Receipt book')
    expect(wrapper!.find('#quantity-1').exists()).toBe(false)
  })
  it('allows an expired session redirect even while creation is pending', async () => {
    handler = (url, options) => options.method === 'POST' ? fail(401, {}, 'Unauthorized') : defaults(url)
    await cart(); await submit()
    const { default: router } = await import('../src/router')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('order-desk-token')).toBeNull()
  })
  it('disables create and cart edits while a request is pending', async () => {
    let finish!: (response: Response) => void
    handler = (url, options) => options.method === 'POST' ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await cart()
    await wrapper!.get('form[novalidate]').trigger('submit')
    await wrapper!.get('form[novalidate]').trigger('submit')
    expect(calls('/orders')).toHaveLength(1)
    expect(button('Creating order…').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('#quantity-1').attributes('disabled')).toBeDefined()
    finish(fail(422)); await flushPromises()
    expect(button('Create order').attributes('disabled')).toBeUndefined()
  })
})

describe('order list', () => {
  it('labels UTC date filters and displays the same UTC calendar day near local midnight', async () => {
    const boundary = { ...saved, created_at: '2026-01-01T18:00:00.000Z' }
    handler = url => url.pathname.endsWith('/orders') ? page([boundary]) : defaults(url)
    await open('/orders')
    expect(wrapper!.get('label[for="date-from"]').text()).toBe('From date (UTC)')
    expect(wrapper!.get('label[for="date-to"]').text()).toBe('To date (UTC)')
    const expected = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(boundary.created_at))
    expect(wrapper!.get('tbody').text()).toContain(`${expected} UTC`)
    await wrapper!.get('#date-from').setValue('2026-01-01')
    await wrapper!.get('#date-to').setValue('2026-01-01')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    const query = new URL(String(calls('/orders').at(-1)![0])).searchParams
    expect(query.get('date_from')).toBe('2026-01-01')
    expect(query.get('date_to')).toBe('2026-01-01')
  })
  it('retries the failed first page after applying a new filter', async () => {
    await open('/orders')
    await click('Next'); await click('Next')
    handler = url => { if (url.pathname.endsWith('/orders')) throw new TypeError('offline'); return defaults(url) }
    await wrapper!.get('#status').setValue('PAID')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    handler = url => defaults(url)
    await click('Retry orders')
    expect(Object.fromEntries(new URL(String(calls('/orders').at(-1)![0])).searchParams)).toEqual({ status: 'PAID', page: '1', per_page: '10' })
  })
  it('omits unset filters, validates dates and paginates applied filters', async () => {
    await open('/orders')
    expect(Object.fromEntries(new URL(String(calls('/orders')[0]![0])).searchParams)).toEqual({ page: '1', per_page: '10' })
    await wrapper!.get('#status').setValue('PAID')
    await wrapper!.get('#date-from').setValue('2026-02-02')
    await wrapper!.get('#date-to').setValue('2026-01-01')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    expect(wrapper!.get('#range-error').text()).toContain('on or before')
    expect(calls('/orders')).toHaveLength(1)
    await wrapper!.get('#date-to').setValue('2026-02-04')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    await click('Next')
    expect(Object.fromEntries(new URL(String(calls('/orders').at(-1)![0])).searchParams)).toEqual({ status: 'PAID', date_from: '2026-02-02', date_to: '2026-02-04', page: '2', per_page: '10' })
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    expect(new URL(String(calls('/orders').at(-1)![0])).searchParams.get('page')).toBe('1')
  })
  it('offers a create invitation for empty results and retries failures', async () => {
    handler = url => url.pathname.endsWith('/orders') ? page([], 1, 0) : defaults(url)
    await open('/orders')
    expect(wrapper!.text()).toContain('No orders match')
    expect(wrapper!.findAll('a').some(a => a.text() === 'Create an order' && a.attributes('href') === '/orders/new')).toBe(true)
    handler = url => { if (url.pathname.endsWith('/orders')) throw new TypeError('offline'); return defaults(url) }
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    expect(wrapper!.text()).toContain('Check your connection')
    handler = url => defaults(url)
    await click('Retry orders')
    expect(wrapper!.text()).toContain('ORD-007')
  })
})

describe('order detail and business session handling', () => {
  it('uses snapshot descriptions and saved monetary amounts without requesting products', async () => {
    await open('/orders/7')
    const { money } = await import('../src/lib/format')
    expect(wrapper!.text()).toContain('Snapshot product')
    expect(wrapper!.text()).toContain('OLD-001')
    expect(wrapper!.get('.totals').text()).toContain(money(saved.grand_total))
    expect(wrapper!.get('.totals').text()).toContain(money(saved.discount_amount))
    expect(calls('/products')).toHaveLength(0)
  })
  it.each(['PENDING', 'PAID', 'CANCELLED'] as const)('shows only allowed actions for %s', async status => {
    handler = url => url.pathname.endsWith('/orders/7') ? ok({ ...saved, status }) : defaults(url)
    await open('/orders/7')
    expect(Boolean(button('Mark as paid'))).toBe(status === 'PENDING')
    expect(Boolean(button('Cancel order'))).toBe(status !== 'CANCELLED')
  })
  it('pays with bodyless PATCH and displays the canonical response', async () => {
    handler = (url, options) => options.method === 'PATCH' ? ok({ ...saved, status: 'PAID' }) : defaults(url)
    await open('/orders/7'); await click('Mark as paid')
    const options = calls('/orders/7/pay')[0]![1]!
    expect(options.method).toBe('PATCH'); expect(options.body).toBeUndefined()
    expect(button('Mark as paid')).toBeUndefined()
    expect(wrapper!.get('.status-badge').text()).toBe('PAID')
  })
  it('requires explicit cancellation confirmation before PATCH', async () => {
    handler = (url, options) => options.method === 'PATCH' ? ok({ ...saved, status: 'CANCELLED' }) : defaults(url)
    await open('/orders/7'); await click('Cancel order')
    expect(calls('/orders/7/cancel')).toHaveLength(0)
    await click('Keep order')
    expect(button('Confirm cancellation')).toBeUndefined()
    await click('Cancel order'); await click('Confirm cancellation')
    expect(calls('/orders/7/cancel')[0]![1]!.method).toBe('PATCH')
    expect(wrapper!.get('.status-badge').text()).toBe('CANCELLED')
    expect(button('Cancel order')).toBeUndefined()
  })
  it('refreshes after 409 and updates allowed buttons before showing conflict guidance', async () => {
    let conflicted = false
    handler = (url, options) => {
      if (options.method === 'PATCH') { conflicted = true; return fail(409, {}, 'Conflict') }
      if (conflicted && url.pathname.endsWith('/orders/7')) return ok({ ...saved, status: 'CANCELLED' })
      return defaults(url)
    }
    await open('/orders/7'); await click('Mark as paid')
    expect(calls('/orders/7')).toHaveLength(2)
    expect(wrapper!.get('[role="alert"]').text()).toContain('Review its latest status')
    expect(button('Mark as paid')).toBeUndefined()
    expect(button('Cancel order')).toBeUndefined()
  })
  it('separates 404 from retryable network failure', async () => {
    handler = url => url.pathname.endsWith('/orders/7') ? fail(404, {}, 'Not found') : defaults(url)
    await open('/orders/7')
    expect(wrapper!.text()).toContain('Order not found')
    expect(button('Retry order')).toBeUndefined()
  })
  it('retries detail network errors', async () => {
    handler = url => { if (url.pathname.endsWith('/orders/7')) throw new TypeError('offline'); return defaults(url) }
    await open('/orders/7')
    expect(wrapper!.text()).toContain('Check your connection')
    handler = url => defaults(url)
    await click('Retry order')
    expect(wrapper!.text()).toContain('Snapshot product')
  })
  it('shows loading states for order list and detail', async () => {
    let finish!: (response: Response) => void
    handler = url => url.pathname.endsWith('/orders') ? new Promise(resolve => { finish = resolve }) : defaults(url)
    const router = await open('/orders')
    expect(wrapper!.text()).toContain('Loading orders')
    finish(page([saved])); await flushPromises()
    handler = url => url.pathname.endsWith('/orders/7') ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await router.push('/orders/7'); await flushPromises()
    expect(wrapper!.text()).toContain('Loading order…')
    finish(ok(saved)); await flushPromises()
    expect(wrapper!.text()).toContain('Snapshot product')
  })
  it('disables status actions while PATCH is pending without optimistic changes', async () => {
    let finish!: (response: Response) => void
    handler = (url, options) => options.method === 'PATCH' ? new Promise(resolve => { finish = resolve }) : defaults(url)
    await open('/orders/7')
    await button('Mark as paid').trigger('click')
    expect(button('Mark as paid').attributes('disabled')).toBeDefined()
    expect(button('Cancel order').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('.status-badge').text()).toBe('PENDING')
    finish(fail(503)); await flushPromises()
    expect(wrapper!.get('.status-badge').text()).toBe('PENDING')
    expect(wrapper!.text()).toContain('Please try again shortly')
  })
  it('clears the business session and redirects on 401 without nested /me races', async () => {
    handler = url => url.pathname.endsWith('/products') ? fail(401, {}, 'Unauthorized') : defaults(url)
    const router = await open('/products')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('order-desk-token')).toBeNull()
    expect((await import('../src/lib/auth')).currentUser.value).toBeNull()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Your session has expired')
    expect(calls('/me')).toHaveLength(1)
  })
  it('protects every new route without rendering business content', async () => {
    sessionStorage.clear()
    const router = await open('/products')
    for (const path of ['/orders', '/orders/new', '/orders/7']) { await router.push(path); expect(router.currentRoute.value.path).toBe('/login') }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
