<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { orders, type Order } from '../lib/store'
import type { Pagination } from '../lib/api'
import { money, dateTime } from '../lib/format'
import PageControls from '../components/PageControls.vue'
const filters = ref({ status: '', date_from: '', date_to: '' })
let applied = { ...filters.value }
const rows = ref<Order[]>([])
const meta = ref<Pagination>({ page: 1, per_page: 10, total: 0 })
const loading = ref(false)
const error = ref('')
const rangeError = ref('')
let sequence = 0
let requestedPage = 1
async function load(page = requestedPage) {
  requestedPage = page
  const request = ++sequence
  loading.value = true; error.value = ''
  try { const result = await orders(applied, page); if (request === sequence) { rows.value = result.data; meta.value = result.meta } }
  catch (e) { if (request === sequence) error.value = e instanceof Error ? e.message : 'Unable to load orders.' }
  finally { if (request === sequence) loading.value = false }
}
function apply() {
  rangeError.value = ''
  if (filters.value.date_from && filters.value.date_to && filters.value.date_from > filters.value.date_to) { rangeError.value = 'From date must be on or before to date.'; return }
  applied = { ...filters.value }; void load(1)
}
onMounted(() => load(1))
</script>
<template>
  <section :aria-busy="loading">
    <div class="page-heading"><h1>Orders</h1><RouterLink to="/orders/new">Create order</RouterLink></div>
    <form class="filters" @submit.prevent="apply">
      <div><label for="status">Status</label><select id="status" v-model="filters.status"><option value="">All statuses</option><option>PENDING</option><option>PAID</option><option>CANCELLED</option></select></div>
      <div><label for="date-from">From date (UTC)</label><input id="date-from" v-model="filters.date_from" type="date" :aria-invalid="Boolean(rangeError)" :aria-describedby="rangeError ? 'range-error' : undefined" /></div>
      <div><label for="date-to">To date (UTC)</label><input id="date-to" v-model="filters.date_to" type="date" :aria-invalid="Boolean(rangeError)" :aria-describedby="rangeError ? 'range-error' : undefined" /></div>
      <button :disabled="loading" type="submit">Apply filters</button>
    </form>
    <p v-if="rangeError" id="range-error" class="form-error" role="alert">{{ rangeError }}</p>
    <p v-if="loading" role="status">Loading orders…</p>
    <div v-else-if="error" class="form-error" role="alert">{{ error }} <button @click="load()">Retry orders</button></div>
    <template v-else>
      <p v-if="!rows.length" role="status">No orders match these filters. <RouterLink to="/orders/new">Create an order</RouterLink> or change your filters.</p>
      <div v-else class="table-scroll"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col" class="numeric">Grand total</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td><RouterLink :to="`/orders/${row.id}`">{{ row.order_number }}</RouterLink></td><td>{{ row.customer.name }}</td><td><span class="status-badge">{{ row.status }}</span></td><td>{{ dateTime(row.created_at) }}</td><td class="numeric">{{ money(row.grand_total) }}</td></tr></tbody></table></div>
      <PageControls :meta="meta" :loading="loading" @change="load" />
    </template>
  </section>
</template>
