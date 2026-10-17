<script setup lang="ts">
import SocialLogin from '@/components/SocialLogin.vue'
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const usernameOrEmail = ref('')
const password = ref('')

const loading = ref(false)
const error = ref<string | null>(null)
// Show an informational notice when redirected after session expiry
const sessionExpired = computed(() => route.query.reason === 'session_expired')

async function handleSubmit() {
  if (!usernameOrEmail.value || !password.value) {
    error.value = 'Please enter both username/email and password'
    return
  }

  loading.value = true
  error.value = null
  try {
    await authStore.login(usernameOrEmail.value.trim(), password.value)
    const candidate = String(route.query.redirect || '/profile')
    const redirectPath = candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('\\') ? candidate : '/profile'
    router.push(redirectPath)
  } catch (err: any) {
    error.value = err?.message || 'Invalid username or password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">Sign In</h1>
        <p class="auth-subtitle">Access your KINOSOTA account</p>
      </div>

      <div v-if="sessionExpired" class="auth-session-alert">
        🔒 Your session has expired. Please sign in again.
      </div>

      <div v-if="error" class="auth-error-alert">
        {{ error }}
      </div>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label">Username or Email</label>
          <input
            v-model="usernameOrEmail"
            type="text"
            required
            placeholder="enter username or email"
            class="form-input"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="form-input"
            autocomplete="current-password"
          />
        </div>

        <p>Защищённый вход сохраняется до 12 часов. На чужом устройстве обязательно выйдите из аккаунта.</p>

        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading">Signing in...</span>
          <span v-else>Sign In</span>
        </button>
      </form>

<SocialLogin />
      <div class="auth-footer">
        Don't have an account?
        <router-link to="/register" class="auth-link">Create Account</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  width: 100%;
}

.auth-card {
  background: #181920;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 40px 32px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.auth-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 6px 0;
}

.auth-subtitle {
  font-size: 0.9rem;
  color: #9ca3af;
  margin: 0;
}

.auth-session-alert {
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fbbf24;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.9rem;
  margin-bottom: 20px;
  text-align: center;
}

.auth-error-alert {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.9rem;
  margin-bottom: 20px;
  text-align: center;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #d1d5db;
}

.form-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #ffffff;
  padding: 10px 14px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: #3b82f6;
}

.form-remember-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.remember-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9ca3af;
  cursor: pointer;
}

.submit-btn {
  background: #3b82f6;
  color: #ffffff;
  border: none;
  padding: 12px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s ease;
}

.submit-btn:hover:not(:disabled) {
  background: #2563eb;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 0.9rem;
  color: #9ca3af;
}

.auth-link {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}

.auth-link:hover {
  text-decoration: underline;
}
</style>
