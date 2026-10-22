<script setup lang="ts">
import { t, messageText, language } from '@/i18n'
import SocialLogin from '@/components/SocialLogin.vue'
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const otp = ref('')
const challenge = ref('')
async function finishLogin(){authStore.setToken('cookie-session');await authStore.fetchCurrentUser();await router.push('/')}
async function confirmFactor(){loading.value=true;error.value=null;try{const r=await fetch('/api/v1/auth/mfa/complete',{method:'POST',headers:{'Content-Type':'application/json','X-TOTP-Code':otp.value,'X-Session-Mode':'cookie'},body:JSON.stringify({challenge:challenge.value})});const d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Неверный код подтверждения');await finishLogin();localStorage.removeItem('telegram_require_confirmation');localStorage.removeItem('tg_just_unlinked');localStorage.removeItem('tg_unlinked_username')}catch(e:any){error.value=e.message}finally{loading.value=false}}

const loading = ref(false)
const error = ref<string | null>(null)
// Show an informational notice when redirected after session expiry
const sessionExpired = computed(() => route.query.reason === 'session_expired')

</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">{{ t("Sign In") }}</h1>
        <p class="auth-subtitle">{{ t("Access your KINOSOTA account") }}</p>
      </div>

      <div v-if="sessionExpired" class="auth-session-alert"> {{ t("🔒 Your session has expired. Please sign in again.") }} </div>

      <div v-if="error" class="auth-error-alert">
        {{ error ? messageText(error) : '' }}
      </div>

<SocialLogin v-if="!challenge" @challenge="challenge=$event" />
      <form v-else class="auth-form" @submit.prevent="confirmFactor"><h2>Подтверждение 2FA</h2><label class="form-group">Код 2FA или резервный код<input class="form-input" v-model="otp" autocomplete="one-time-code" maxlength="64" autofocus required /></label><button class="submit-btn" :disabled="loading">Подтвердить вход</button><button type="button" class="submit-btn" @click="challenge='';otp=''">Назад</button></form>

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
  width:100%;box-sizing:border-box;min-height:46px;
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
