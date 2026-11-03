<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUser } from './lib/auth'
const route = useRoute()
const business = computed(() => Boolean(route.meta.requiresAuth))
watch(() => route.path, async () => {
  await nextTick()
  const heading = document.querySelector<HTMLElement>('main h1')
  heading?.setAttribute('tabindex', '-1')
  heading?.focus()
})

const ready = ref(false)
const startupError = ref(false)

void useRouter().isReady().then(() => {
  ready.value = true
}).catch(() => {
  startupError.value = true
})
</script>

<template>
  <div class="workspace" :class="{ 'business-workspace': business }">
    <header class="identity-panel">
      <div class="wordmark">
        <span class="ledger-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>Order desk</span>
      </div>
      <nav v-if="business" class="top-nav" aria-label="Main navigation">
        <RouterLink to="/products">Products</RouterLink>
        <RouterLink to="/orders" :class="{ 'router-link-active': route.path.startsWith('/orders/') && route.path !== '/orders/new' }">Orders</RouterLink>
        <RouterLink to="/orders/new">Create order</RouterLink>
        <RouterLink to="/" class="account-link">Account<span v-if="currentUser">: {{ currentUser.name }}</span></RouterLink>
      </nav>
      <div v-else class="workspace-intro">
        <h2>A workspace for your store’s orders.</h2>
        <p>Keep the day’s order management in one place.</p>
      </div>
    </header>
    <main id="main-content" class="main-area">
      <p v-if="startupError" class="form-error" role="alert">Unable to open the workspace. Reload the page to try again.</p>
      <p v-else-if="!ready" role="status">Checking your session…</p>
      <RouterView v-else />
    </main>
  </div>
</template>
