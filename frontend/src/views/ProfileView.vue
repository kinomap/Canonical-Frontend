<script setup lang="ts">
import ChangePassword from '@/components/ChangePassword.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const promoCode=ref(''),promoMessage=ref(''),promoBusy=ref(false)
async function redeemPromo(){promoBusy.value=true;promoMessage.value='';try{const r=await fetch('/api/v1/me/promo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:promoCode.value})});if(!r.ok)throw new Error();await authStore.fetchCurrentUser();promoCode.value='';promoMessage.value='Доступ обновлён.'}catch{promoMessage.value='Промокод недоступен или сессия истекла.'}finally{promoBusy.value=false}}

onMounted(() => {
  if (!authStore.isAuthenticated.value) {
    router.push('/login')
  } else if (!authStore.user.value) {
    authStore.fetchCurrentUser()
  }
})

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function formatDate(isoStr?: string) {
  if (!isoStr) return 'N/A'
  try {
    return new Date(isoStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return isoStr
  }
}
</script>

<template>
  <div class="profile-page">
    <div v-if="authStore.loading.value" class="profile-loading">
      <div class="spinner"></div>
      <span>Loading user profile...</span>
    </div>

    <div v-else-if="authStore.user.value" class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar">
          {{ authStore.user.value.username[0].toUpperCase() }}
        </div>
        <div class="header-info">
          <h1 class="user-username">{{ authStore.user.value.username }}</h1>
          <span class="user-role-badge">{{ authStore.user.value.role }}</span>
        </div>
      </div>

      <div class="profile-sections">
        <div class="info-row">
          <span class="info-label">Email Address</span>
          <span class="info-value">{{ authStore.user.value.email }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">Account Status</span>
          <span class="info-value status-active">{{ authStore.user.value.status }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">Member Since</span>
          <span class="info-value">{{ formatDate(authStore.user.value.created_at) }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">Active Session</span>
          <span class="info-value text-blue">1 Device Connected</span>
        </div>
      </div>

      <section aria-label="Подписка и права"><h2>Ваш доступ</h2><p>{{authStore.user.value.subscription_status || 'free'}}</p><ul><li v-for="right in authStore.user.value.entitlements || []" :key="right">{{right}}</li></ul><form @submit.prevent="redeemPromo"><label>Промокод <input v-model="promoCode" required minlength="8" maxlength="64" autocomplete="off" /></label><button :disabled="promoBusy">Применить</button></form><p role="status">{{promoMessage}}</p></section>
      <ChangePassword v-if="authStore.user.value?.password_login_available !== false" />
      <div class="profile-actions">
        <button class="logout-btn" @click="handleLogout">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 40px 16px 64px 16px;
  width: 100%;
}

.profile-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px;
  color: #9ca3af;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.profile-card {
  background: #181920;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 24px;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #3b82f6;
  color: #ffffff;
  font-size: 1.8rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-username {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0;
}

.user-role-badge {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 2px 10px;
  border-radius: 12px;
  align-self: flex-start;
}

.profile-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.info-label {
  font-size: 0.9rem;
  color: #9ca3af;
}

.info-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f3f4f6;
}

.status-active {
  color: #34d399;
  text-transform: capitalize;
}

.text-blue {
  color: #60a5fa;
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
}

.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}
</style>
