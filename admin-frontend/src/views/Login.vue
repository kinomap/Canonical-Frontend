<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
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
      errorMsg.value = 'Access denied. Admin role required.'
      return
    }

    localStorage.setItem('admin_token', 'cookie-session')
    router.push('/')
  } catch (err: any) {
    if (err.response && err.response.data && err.response.data.detail) {
      errorMsg.value = err.response.data.detail
    } else {
      errorMsg.value = 'Login failed. Please check your credentials.'
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
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <label>Username or Email</label>
          <input type="text" autocomplete="username" v-model="usernameOrEmail" required placeholder="Enter admin username" />
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" autocomplete="current-password" v-model="password" required placeholder="Enter password" />
        </div>
        
        <label>Код 2FA или резервный код<input v-model="otp" autocomplete="one-time-code" maxlength="64" /></label>
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        
        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Authenticating...' : 'Login' }}
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
  min-height: 100vh;
  background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
}

.login-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(12px);
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 100%;
  max-width: 400px;
}

.login-title {
  text-align: center;
  margin-bottom: 32px;
  font-size: 1.8rem;
  letter-spacing: 0.1em;
  color: #f8fafc;
}

.highlight {
  color: #38bdf8;
}

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
  color: #94a3b8;
  font-weight: 500;
}

.input-group input {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid #334155;
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.input-group input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.error-msg {
  color: #ef4444;
  font-size: 0.9rem;
  text-align: center;
  background: rgba(239, 68, 68, 0.1);
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.submit-btn {
  margin-top: 10px;
  padding: 14px;
  border-radius: 8px;
  border: none;
  background: #38bdf8;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.submit-btn:hover:not(:disabled) {
  background: #7dd3fc;
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
