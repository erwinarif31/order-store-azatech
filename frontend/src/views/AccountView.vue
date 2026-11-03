<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { currentUser, logout } from '../lib/auth'

const router = useRouter()
const errorMessage = ref('')

async function signOut(): Promise<void> {
  logout()
  try {
    await router.replace('/login')
  } catch {
    errorMessage.value = 'You are signed out. Reload the page to return to sign in.'
  }
}
</script>

<template>
  <section class="account-content" aria-labelledby="account-heading">
    <h1 id="account-heading">Your account</h1>
    <template v-if="currentUser">
      <p class="supporting-text">You’re signed in to Order desk.</p>
      <dl class="account-details">
        <div><dt>Name</dt><dd>{{ currentUser.name }}</dd></div>
        <div><dt>Email</dt><dd>{{ currentUser.email }}</dd></div>
      </dl>
      <button type="button" class="primary-button signout-button" @click="signOut">Sign out</button>
    </template>
    <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
  </section>
</template>
