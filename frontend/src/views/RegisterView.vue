<script setup lang="ts">
import { t, messageText, language } from '@/i18n'
import SocialLogin from '@/components/SocialLogin.vue'
import { ref } from 'vue'
import { registrationErrorCode } from '@/utils/registrationError'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const challenge=ref(''),otp=ref('')
async function confirmFactor(){loading.value=true;error.value=null;try{const r=await fetch('/api/v1/auth/mfa/complete',{method:'POST',headers:{'Content-Type':'application/json','X-TOTP-Code':otp.value,'X-Session-Mode':'cookie'},body:JSON.stringify({challenge:challenge.value})});const d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Неверный код подтверждения');authStore.setToken('cookie-session');await authStore.fetchCurrentUser();localStorage.removeItem('telegram_require_confirmation');localStorage.removeItem('tg_just_unlinked');localStorage.removeItem('tg_unlinked_username');await router.push('/')}catch(e:any){error.value=e.message}finally{loading.value=false}}

const loading = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  if (!username.value || !email.value || !password.value) {
    error.value = 'Please fill out all required fields'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  loading.value = true
  error.value = null
  try {
    await authStore.register(username.value.trim(), email.value.trim(), password.value)
    router.push('/')
  } catch (err: any) {
    error.value = registrationErrorCode(err?.status)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">{{ t("Create Account") }}</h1>
        <p class="auth-subtitle">{{ t("Join KINOSOTA VOD Portal") }}</p>
      </div>

      <div v-if="error" class="auth-error-alert">
        {{ error ? messageText(error) : '' }}
      </div>

      <p>{{ t("Пароль: 15–128 символов. Используйте уникальную длинную фразу.") }}</p>
      <form v-if="!challenge" class="auth-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label">{{ t("Username") }}</label>
          <input
            v-model="username"
            type="text"
            required
            :placeholder="t('choose a username')"
            class="form-input"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t("Email Address") }}</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="name@example.com"
            class="form-input"
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t("Password") }}</label>
          <input
            v-model="password"
            type="password" minlength="15" maxlength="128"
            required
            :placeholder="t('15–128 characters')"
            class="form-input"
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t("Confirm Password") }}</label>
          <input
            v-model="confirmPassword"
            type="password" minlength="15" maxlength="128"
            required
            :placeholder="t('repeat password')"
            class="form-input"
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading">{{ t("Creating Account...") }}</span>
          <span v-else>{{ t("Register") }}</span>
        </button>
      </form>

<SocialLogin v-if="!challenge" @challenge="challenge=$event" />
      <form v-else class="auth-form" @submit.prevent="confirmFactor"><h2>{{t('Подтверждение 2FA')}}</h2><label class="form-group">{{t('Код 2FA или резервный код')}}<input class="form-input" v-model="otp" autocomplete="one-time-code" maxlength="64" required /></label><button class="submit-btn" :disabled="loading">{{t('Подтвердить вход')}}</button><button type="button" class="submit-btn" @click="challenge='';otp=''">{{t('Назад')}}</button></form>
      <div class="auth-footer"> {{ t("Already have an account?") }} <router-link to="/login" class="auth-link">{{ t("Sign In") }}</router-link>
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
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-panel);
  padding: 40px 32px;
  max-width: 440px;
  width: 100%;
  box-shadow: none;
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.auth-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--ui-text);
  margin: 0 0 6px 0;
}

.auth-subtitle {
  font-size: 0.9rem;
  color: var(--ui-secondary);
  margin: 0;
}

.auth-error-alert {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--ui-danger);
  padding: 10px 14px;
  border-radius: var(--ui-radius);
  font-size: 0.9rem;
  margin-bottom: 20px;
  text-align: center;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-secondary);
}

.form-input {
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  padding: 10px 14px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--ui-control);
}

.submit-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 12px;
  border-radius: var(--ui-radius);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s ease;
}

.submit-btn:hover:not(:disabled) {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 0.9rem;
  color: var(--ui-secondary);
}

.auth-link {
  color: var(--ui-link);
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}

.auth-link:hover {
  text-decoration: underline;
}
</style>
