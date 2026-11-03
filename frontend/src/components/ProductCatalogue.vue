<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { products, type Product } from '../lib/store'
import type { Pagination } from '../lib/api'
import { money } from '../lib/format'
import PageControls from './PageControls.vue'
withDefaults(defineProps<{ selectable?: boolean; selected?: number[]; disabled?: boolean }>(), { selected: () => [] })
defineEmits<{ add: [product: Product] }>()
const search = ref('')
const applied = ref('')
const rows = ref<Product[]>([])
const meta = ref<Pagination>({ page: 1, per_page: 10, total: 0 })
const loading = ref(false)
const error = ref('')
let sequence = 0
let requestedPage = 1
async function load(page = requestedPage) {
  requestedPage = page
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await products(applied.value, page)
    if (request === sequence) { rows.value = result.data; meta.value = result.meta }
  } catch (e) { if (request === sequence) error.value = e instanceof Error ? e.message : 'Unable to load products.' }
  finally { if (request === sequence) loading.value = false }
}
function submit() { applied.value = search.value.trim(); void load(1) }
onMounted(() => load(1))
</script>
<template>
  <section aria-label="Product catalogue" :aria-busy="loading">
    <form class="filters" @submit.prevent="submit">
      <div><label for="product-search">Search products</label><input id="product-search" v-model="search" type="search" /></div>
      <button type="submit" :disabled="loading">Search</button>
    </form>
    <p v-if="loading" role="status">Loading products…</p>
    <div v-else-if="error" role="alert" class="form-error">{{ error }} <button type="button" @click="load()">Retry products</button></div>
    <template v-else>
      <p v-if="!rows.length" role="status">No products found. Try another search.</p>
      <div v-else class="table-scroll"><table>
        <thead><tr><th scope="col">Code</th><th scope="col">Product</th><th scope="col" class="numeric">Price</th><th scope="col" class="numeric">Stock</th><th v-if="selectable" scope="col">Select</th></tr></thead>
        <tbody><tr v-for="product in rows" :key="product.id"><td>{{ product.product_code }}</td><td>{{ product.name }}</td><td class="numeric">{{ money(product.price) }}</td><td class="numeric">{{ product.stock }}</td><td v-if="selectable"><button type="button" :aria-label="`Add ${product.name}`" :disabled="disabled || selected.includes(product.id)" @click="$emit('add', product)">{{ selected.includes(product.id) ? 'Added' : 'Add' }}</button></td></tr></tbody>
      </table></div>
      <PageControls :meta="meta" :loading="loading" @change="load" />
    </template>
  </section>
</template>
