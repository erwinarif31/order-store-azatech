import { api, apiPage } from './api'

export type Money = string | number
export interface Product { id: number; product_code: string; name: string; price: Money; stock: number }
export interface Customer { id: number; name: string; email: string | null; phone: string | null }
export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED'
export interface Order {
  id: number; order_number: string; customer_id: number; status: OrderStatus
  subtotal: Money; discount_amount: Money; grand_total: Money; created_at: string; updated_at: string
  customer: { id: number; name: string; email?: string | null; phone?: string | null }
  items: { id: number; product_id: number; product_code: string; product_name: string; quantity: number; unit_price: Money; subtotal: Money }[]
}
export interface OrderInput { customer_id: number; items: { product_id: number; quantity: number }[] }
function query(values: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(values).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])).toString()
}
export const products = (search: string, page: number) => apiPage<Product>(`/products?${query({ search, page, per_page: 10 })}`)
export const customers = () => api<Customer[]>('/customers', { authenticated: true })
export const orders = (filters: { status: string; date_from: string; date_to: string }, page: number) => apiPage<Order>(`/orders?${query({ ...filters, page, per_page: 10 })}`)
export const order = (id: string) => api<Order>(`/orders/${encodeURIComponent(id)}`, { authenticated: true })
export const createOrder = (body: OrderInput, key: string) => api<Order>('/orders', { authenticated: true, body, headers: { 'Idempotency-Key': key } })
export const transitionOrder = (id: string, action: 'pay' | 'cancel') => api<Order>(`/orders/${encodeURIComponent(id)}/${action}`, { authenticated: true, method: 'PATCH' })
