<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../lib/api'
import { login, sessionMessage } from '../lib/auth'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

async function submit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  sessionMessage.value = ''
  fieldErrors.value = {}
  try {
    await login(email.value, password.value)
    password.value = ''
    await router.replace('/')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in. Please try again.'
    if (error instanceof ApiError) fieldErrors.value = error.errors
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-content" aria-labelledby="login-heading">
    <h1 id="login-heading">Sign in to your workspace</h1>
    <p class="supporting-text">Sign in to manage your store’s orders.</p>
    <p v-if="errorMessage || sessionMessage" class="form-error" role="alert">{{ errorMessage || sessionMessage }}</p>
    <form @submit.prevent="submit" :aria-busy="loading">
      <div class="field-group">
        <label for="email">Email</label>
        <input
          id="email" v-model="email" name="email" type="email" autocomplete="username" required
          :readonly="loading" :aria-invalid="Boolean(fieldErrors.email?.length)"
          :aria-describedby="fieldErrors.email?.length ? 'email-error' : undefined"
        />
        <p v-if="fieldErrors.email?.length" id="email-error" class="field-error">{{ fieldErrors.email.join(' ') }}</p>
      </div>
      <div class="field-group">
        <label for="password">Password</label>
        <div class="password-input">
          <input
            id="password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password" required :readonly="loading"
            :aria-invalid="Boolean(fieldErrors.password?.length)"
            :aria-describedby="fieldErrors.password?.length ? 'password-error' : undefined"
          />
          <button
            type="button" class="password-toggle" :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword" @click="showPassword = !showPassword"
          >{{ showPassword ? 'Hide' : 'Show' }}</button>
        </div>
        <p v-if="fieldErrors.password?.length" id="password-error" class="field-error">{{ fieldErrors.password.join(' ') }}</p>
      </div>
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    </form>
    <p class="session-note">Your sign-in is kept for this browser tab.</p>
  </section>
</template>
