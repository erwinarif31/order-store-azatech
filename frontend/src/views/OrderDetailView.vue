<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { order, transitionOrder, type Order } from '../lib/store'
import { ApiError } from '../lib/api'
import { money, dateTime } from '../lib/format'
const route = useRoute()
const saved = ref<Order | null>(null)
const loading = ref(false)
const pending = ref(false)
const confirming = ref(false)
const error = ref('')
const actionError = ref('')
const notFound = ref(false)
async function load() {
  loading.value = true; error.value = ''; notFound.value = false; saved.value = null; confirming.value = false
  const id = String(route.params.id)
  try { const result = await order(id); if (id === String(route.params.id)) saved.value = result }
  catch (e) {
    if (id !== String(route.params.id)) return
    notFound.value = e instanceof ApiError && e.status === 404
    error.value = e instanceof Error ? e.message : 'Unable to load order.'
  } finally { if (id === String(route.params.id)) loading.value = false }
}
async function act(action: 'pay' | 'cancel') {
  if (pending.value || !saved.value) return
  pending.value = true; actionError.value = ''; confirming.value = false
  const id = String(saved.value.id)
  try { const result = await transitionOrder(id, action); if (id === String(route.params.id)) saved.value = result }
  catch (e) {
    if (id !== String(route.params.id)) return
    if (e instanceof ApiError && e.status === 409) {
      await load()
      actionError.value = 'This order changed. Review its latest status before trying again.'
    } else actionError.value = e instanceof Error ? e.message : 'Unable to update order. Try again.'
  } finally { pending.value = false }
}
watch(() => route.params.id, () => { actionError.value = ''; void load() }, { immediate: true })
</script>
<template>
  <section :aria-busy="loading || pending">
    <div class="page-heading"><h1>{{ saved ? saved.order_number : 'Order detail' }}</h1><RouterLink to="/orders">Back to orders</RouterLink></div>
    <p v-if="loading" role="status">Loading order…</p>
    <div v-else-if="notFound" role="alert"><h2>Order not found</h2><p>This order does not exist. <RouterLink to="/orders">Return to orders</RouterLink>.</p></div>
    <div v-else-if="error" class="form-error" role="alert">{{ error }} <button @click="load">Retry order</button></div>
    <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
    <template v-if="saved && !loading">
      <div class="order-context"><p><strong>Customer:</strong> {{ saved.customer.name }}</p><p v-if="saved.customer.email">{{ saved.customer.email }}</p><p v-if="saved.customer.phone">{{ saved.customer.phone }}</p><p>Status: <span class="status-badge" role="status">{{ saved.status }}</span></p><p>Created {{ dateTime(saved.created_at) }}</p></div>
      <div class="table-scroll"><table><thead><tr><th scope="col">Code</th><th scope="col">Product</th><th scope="col" class="numeric">Quantity</th><th scope="col" class="numeric">Unit price</th><th scope="col" class="numeric">Subtotal</th></tr></thead><tbody><tr v-for="item in saved.items" :key="item.id"><td>{{ item.product_code }}</td><td>{{ item.product_name }}</td><td class="numeric">{{ item.quantity }}</td><td class="numeric">{{ money(item.unit_price) }}</td><td class="numeric">{{ money(item.subtotal) }}</td></tr></tbody></table></div>
      <dl class="totals"><div><dt>Subtotal</dt><dd>{{ money(saved.subtotal) }}</dd></div><div><dt>Discount</dt><dd>{{ money(saved.discount_amount) }}</dd></div><div><dt>Grand total</dt><dd>{{ money(saved.grand_total) }}</dd></div></dl>
      <p class="muted">Final amounts saved by the server.</p>
      <div class="actions">
        <button v-if="saved.status === 'PENDING'" :disabled="pending" @click="act('pay')">Mark as paid</button>
        <button v-if="saved.status !== 'CANCELLED' && !confirming" :disabled="pending" @click="confirming = true">Cancel order</button>
      </div>
      <div v-if="confirming" class="confirmation" role="group" aria-labelledby="cancel-heading"><h2 id="cancel-heading">Cancel this order?</h2><p>This action changes the order status to cancelled.</p><button :disabled="pending" @click="act('cancel')">Confirm cancellation</button> <button :disabled="pending" @click="confirming = false">Keep order</button></div>
      <p v-if="pending" role="status">Updating order…</p>
    </template>
  </section>
</template>
