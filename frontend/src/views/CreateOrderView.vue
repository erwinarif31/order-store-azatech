<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import ProductCatalogue from '../components/ProductCatalogue.vue'
import { ApiError, TOKEN_KEY } from '../lib/api'
import { customers, createOrder, type Customer, type Product } from '../lib/store'
import { estimate, money } from '../lib/format'
const router = useRouter()
const customerId = ref<number | ''>('')
const customerRows = ref<Customer[]>([])
const customersLoading = ref(false)
const customersError = ref('')
const items = ref<{ product: Product; quantity: number }[]>([])
const pending = ref(false)
const error = ref('')
const errors = ref<Record<string, string[]>>({})
let key = ''
const savedDestination = ref('')
const cartLocked = computed(() => pending.value || Boolean(savedDestination.value))
let active = true
onBeforeRouteLeave(to => !pending.value || to.path === savedDestination.value || (to.name === 'login' && !sessionStorage.getItem(TOKEN_KEY)))
onUnmounted(() => { active = false })
const totals = computed(() => estimate(items.value.map(row => ({ price: row.product.price, quantity: row.quantity }))))
function edited() { if (cartLocked.value) return; key = ''; errors.value = {}; error.value = '' }
function add(product: Product) {
  if (cartLocked.value || items.value.some(row => row.product.id === product.id)) return
  items.value.push({ product, quantity: 1 }); edited()
}
function remove(index: number) { if (cartLocked.value) return; items.value.splice(index, 1); edited() }
async function loadCustomers() {
  customersLoading.value = true; customersError.value = ''
  try { customerRows.value = await customers() }
  catch (e) { customersError.value = e instanceof Error ? e.message : 'Unable to load customers.' }
  finally { customersLoading.value = false }
}
async function submit() {
  if (pending.value) return
  errors.value = {}; error.value = ''
  if (!savedDestination.value) {
    if (!customerId.value) errors.value.customer_id = ['Choose a customer.']
    if (!items.value.length) errors.value.items = ['Add at least one product.']
    items.value.forEach((row, i) => {
      if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 2147483647) errors.value[`items.${i}.quantity`] = ['Quantity must be a positive whole number no greater than 2147483647.']
    })
    if (Object.keys(errors.value).length) { error.value = 'Check the highlighted fields.'; return }
  }
  pending.value = true
  try {
    if (!savedDestination.value) {
      key ||= crypto.randomUUID()
      const saved = await createOrder({ customer_id: Number(customerId.value), items: items.value.map(row => ({ product_id: row.product.id, quantity: row.quantity })) }, key)
      if (!active) return
      savedDestination.value = `/orders/${saved.id}`
    }
    const failure = await router.push(savedDestination.value)
    if (active && failure) error.value = 'Your order was saved, but its details could not be opened. Try again.'
  } catch (e) {
    if (!active) return
    error.value = savedDestination.value ? 'Your order was saved, but its details could not be opened. Try again.' : e instanceof Error ? e.message : 'Unable to create order. Try again.'
    if (!savedDestination.value && e instanceof ApiError) errors.value = e.errors
  } finally { pending.value = false }
}
onMounted(loadCustomers)
</script>
<template>
  <section>
    <div class="page-heading"><h1>Create order</h1><RouterLink to="/orders">Back to orders</RouterLink></div>
    <p v-if="savedDestination" role="status">Your order was saved. Use View saved order to open its details.</p>
    <p v-if="customersLoading" role="status">Loading customers…</p>
    <div v-if="customersError" class="form-error" role="alert">{{ customersError }} <button @click="loadCustomers">Retry customers</button></div>
    <div class="field-group">
      <label for="customer">Customer</label>
      <select id="customer" v-model="customerId" :disabled="cartLocked || customersLoading" :aria-invalid="Boolean(errors.customer_id)" :aria-describedby="errors.customer_id ? 'customer-error' : undefined" @change="edited">
        <option value="">Choose a customer</option><option v-for="customer in customerRows" :key="customer.id" :value="customer.id">{{ customer.name }}{{ customer.email ? ` (${customer.email})` : '' }}</option>
      </select>
      <p v-if="errors.customer_id" id="customer-error" class="field-error">{{ errors.customer_id.join(' ') }}</p>
      <p v-if="!customersLoading && !customersError && !customerRows.length">No customers available. Ask your administrator to add a customer.</p>
    </div>
    <h2>Choose products</h2>
    <ProductCatalogue selectable :selected="items.map(row => row.product.id)" :disabled="cartLocked" @add="add" />
    <h2>Selected items</h2>
    <form novalidate :aria-busy="pending" @submit.prevent="submit">
      <div v-if="error" class="form-error" role="alert"><p>{{ error }}</p><ul v-if="Object.keys(errors).length"><li v-for="(messages, field) in errors" :key="field">{{ field }}: {{ messages.join(' ') }}</li></ul></div>
      <p v-if="!items.length">Add products from the catalogue to start your order.</p>
      <div v-for="(row, index) in items" :key="row.product.id" class="line-item">
        <div><strong>{{ row.product.name }}</strong><p>{{ row.product.product_code }}</p><p class="muted">Stock hint: {{ row.product.stock }} available. {{ money(row.product.price) }} each.</p><p v-if="errors[`items.${index}.product_id`]" :id="`product-error-${row.product.id}`" class="field-error">{{ errors[`items.${index}.product_id`]!.join(' ') }}</p></div>
        <div><label :for="`quantity-${row.product.id}`">Quantity for {{ row.product.name }}</label><input :id="`quantity-${row.product.id}`" v-model.number="row.quantity" type="number" min="1" max="2147483647" step="1" :disabled="cartLocked" :aria-invalid="Boolean(errors[`items.${index}.quantity`])" :aria-describedby="[errors[`items.${index}.quantity`] ? `quantity-error-${row.product.id}` : '', errors[`items.${index}.product_id`] ? `product-error-${row.product.id}` : ''].filter(Boolean).join(' ') || undefined" @input="edited" /><p v-if="errors[`items.${index}.quantity`]" :id="`quantity-error-${row.product.id}`" class="field-error">{{ errors[`items.${index}.quantity`]!.join(' ') }}</p></div>
        <div class="numeric">Estimated line total<p>{{ money(estimate([{ price: row.product.price, quantity: row.quantity }]).subtotal) }}</p></div>
        <button type="button" :disabled="cartLocked" :aria-label="`Remove ${row.product.name}`" @click="remove(index)">Remove</button>
      </div>
      <dl class="totals" aria-live="polite"><div><dt>Estimated subtotal</dt><dd>{{ money(totals.subtotal) }}</dd></div><div><dt>Estimated discount</dt><dd>{{ money(totals.discount) }}</dd></div><div><dt>Estimated grand total</dt><dd>{{ money(totals.total) }}</dd></div></dl>
      <p class="muted">Estimates only. The server validates stock and calculates final prices and discounts when you create the order.</p>
      <p v-if="pending" role="status">{{ savedDestination ? 'Opening your saved order.' : 'Creating your order. Keep this page open until the request finishes.' }}</p>
      <button class="primary-button task-button" type="submit" :disabled="pending">{{ pending ? (savedDestination ? 'Opening order…' : 'Creating order…') : savedDestination ? 'View saved order' : 'Create order' }}</button>
    </form>
  </section>
</template>
