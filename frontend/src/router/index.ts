import { createRouter, createWebHistory } from 'vue-router'
import { logout, restore, sessionMessage } from '../lib/auth'
import { setUnauthorizedHandler, TOKEN_KEY } from '../lib/api'
import LoginView from '../views/LoginView.vue'
import AccountView from '../views/AccountView.vue'
import ProductsView from '../views/ProductsView.vue'
import OrdersView from '../views/OrdersView.vue'
import CreateOrderView from '../views/CreateOrderView.vue'
import OrderDetailView from '../views/OrderDetailView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'account', component: AccountView, meta: { requiresAuth: true } },
    { path: '/products', component: ProductsView, meta: { requiresAuth: true } },
    { path: '/orders', component: OrdersView, meta: { requiresAuth: true } },
    { path: '/orders/new', component: CreateOrderView, meta: { requiresAuth: true } },
    { path: '/orders/:id', component: OrderDetailView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

setUnauthorizedHandler(() => {
  logout()
  sessionMessage.value = 'Your session has expired. Please sign in again.'
  void router.replace('/login')
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    try {
      if (await restore()) return true
    } catch {
      // Verification failed: keep protected content unmounted, even on transient errors.
    }
    return { name: 'login', replace: true }
  }
  if (to.name === 'login' && sessionStorage.getItem(TOKEN_KEY) && !sessionMessage.value) {
    try {
      if (await restore()) return { name: 'account', replace: true }
    } catch {
      // Stay on login so verification failures cannot cause a redirect loop.
    }
  }
  return true
})

export default router
