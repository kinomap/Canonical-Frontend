<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'

import { safeReturnPath } from '../sessionNavigation'
const router = useRouter()
const route = useRoute()
const sessionNotice = computed(() => route.query.reason === 'expired' ? 'Сессия администратора завершена. Войдите снова, затем повторите загрузку ролика.' : route.query.reason === 'unavailable' ? 'Не удалось проверить сессию. Проверьте соединение и повторите вход.' : route.query.reason === 'forbidden' ? 'Для входа требуется учётная запись администратора.' : '')
const usernameOrEmail = ref('')
const password = ref('')
const otp = ref('')
const errorMsg = ref('')
const loading = ref(false)

const handleLogin = async () => {
  errorMsg.value = ''
  loading.value = true
  try {
    const res = await axios.post('/api/v1/auth/login', {
      username_or_email: usernameOrEmail.value,
      password: password.value
    },{headers:{'X-TOTP-Code':otp.value}})
    
    if (res.data.user.role !== 'admin') {
      errorMsg.value = 'Для входа требуется учётная запись администратора.'
      return
    }

    localStorage.setItem('admin_token', 'cookie-session')
    await router.replace(safeReturnPath(route.query.redirect))
  } catch (err: any) {
    if (err.response && err.response.data && err.response.data.detail) {
      errorMsg.value = err.response.data.detail
    } else {
      errorMsg.value = 'Не удалось войти. Проверьте логин и пароль.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">KINOSOTA <span class="highlight">ADMIN</span></h1>
      <p v-if="sessionNotice" role="status" class="session-notice">{{ sessionNotice }}</p>
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <label for="admin-username">Логин или электронная почта</label>
          <input id="admin-username" type="text" autocomplete="username" v-model="usernameOrEmail" required placeholder="Введите логин" />
        </div>
        <div class="input-group">
          <label for="admin-password">Пароль</label>
          <input id="admin-password" type="password" autocomplete="current-password" v-model="password" required placeholder="Введите пароль" />
        </div>
        
        <label>Код 2FA или резервный код<input v-model="otp" autocomplete="one-time-code" maxlength="64" /></label>
        <div v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</div>
        
        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Входим…' : 'Войти' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px 16px;
  background: var(--ui-surface);
}

.login-card {
  background: var(--ui-surface);
  backdrop-filter: none;
  padding: 32px;
  border-radius: var(--ui-radius-panel);
  box-shadow: none;
  border: 1px solid var(--ui-border);
  width: 100%;
  max-width: 400px;
}

.login-title {
  text-align: center;
  margin-bottom: 32px;
  font-size: 1.8rem;
  letter-spacing: 0.1em;
  color: var(--ui-text);
}

.highlight {
  color: var(--ui-link);
}

.session-notice { color:var(--ui-warning); line-height:1.5; margin-bottom:20px; }

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 0.9rem;
  color: var(--ui-link);
  font-weight: 500;
}

.input-group input {
  padding: 12px 16px;
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.input-group input:focus {
  border-color: var(--ui-control);
  box-shadow: 0 0 0 2px var(--ui-border);
}

.error-msg {
  color: var(--ui-danger);
  font-size: 0.9rem;
  text-align: center;
  background: rgba(239, 68, 68, 0.1);
  padding: 10px;
  border-radius: var(--ui-radius);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.submit-btn {
  margin-top: 10px;
  padding: 14px;
  border-radius: var(--ui-radius);
  border: none;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.submit-btn:hover:not(:disabled) {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
