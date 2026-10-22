<script setup lang="ts">
import { t, messageText, language } from '@/i18n'
import SocialLogin from '@/components/SocialLogin.vue'
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const otp = ref('')
async function passwordLogin(){
 loading.value=true;error.value=null
 try{await authStore.login(username.value.trim(),password.value);password.value='';await router.push('/')}
 catch(e:any){let detail:any;try{detail=JSON.parse(e.message)}catch{}
  if(detail?.code==='MFA_REQUIRED'&&detail.challenge){challenge.value=detail.challenge;password.value=''}
  else error.value=e.message
 }finally{loading.value=false}
}
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

<template v-if="!challenge">
      <form class="auth-form" @submit.prevent="passwordLogin">
        <label class="form-group"><span class="form-label">Логин или электронная почта</span><input class="form-input" v-model="username" autocomplete="username" name="username" required maxlength="254" /></label>
        <label class="form-group"><span class="form-label">Пароль</span><input class="form-input" v-model="password" type="password" autocomplete="current-password" name="password" required maxlength="1024" /></label>
        <button class="submit-btn" type="submit" :disabled="loading">{{loading?'Входим…':'Войти'}}</button>
      </form>
      <p class="login-divider">или</p>
      <SocialLogin @challenge="challenge=$event;password=''" />
      </template>
      <form v-else class="auth-form" @submit.prevent="confirmFactor"><h2>Подтверждение 2FA</h2><label class="form-group">Код 2FA или резервный код<input class="form-input" v-model="otp" autocomplete="one-time-code" maxlength="64" autofocus required /></label><button class="submit-btn" :disabled="loading">Подтвердить вход</button><button type="button" class="submit-btn" @click="challenge='';otp=''">Назад</button></form>

    </div>
  </div>
</template>

<style scoped>
.login-divider{text-align:center;color:var(--ui-secondary);margin:20px 0}
.form-input:focus-visible,.submit-btn:focus-visible{outline:2px solid var(--ui-control);outline-offset:3px}

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
  max-width: 420px;
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

.auth-session-alert {
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: var(--ui-warning);
  padding: 10px 14px;
  border-radius: var(--ui-radius);
  font-size: 0.9rem;
  margin-bottom: 20px;
  text-align: center;
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
  color: var(--ui-secondary);
  cursor: pointer;
}

.submit-btn {
  width:100%;box-sizing:border-box;min-height:46px;
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
  color:var(--ui-on-primary);
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
