<script setup lang="ts">
import type { Pagination } from '../lib/api'
defineProps<{ meta: Pagination; loading: boolean }>()
defineEmits<{ change: [page: number] }>()
</script>
<template>
  <nav class="pagination" aria-label="Pagination">
    <button type="button" :disabled="loading || meta.page <= 1" @click="$emit('change', meta.page - 1)">Previous</button>
    <span>Page {{ meta.page }} of {{ Math.max(1, Math.ceil(meta.total / meta.per_page)) }} ({{ meta.total }} results)</span>
    <button type="button" :disabled="loading || meta.page * meta.per_page >= meta.total" @click="$emit('change', meta.page + 1)">Next</button>
  </nav>
</template>
