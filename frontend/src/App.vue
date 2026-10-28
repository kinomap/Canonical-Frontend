<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import CinemaFooter from '@/components/CinemaFooter.vue'
import {toastMessage} from '@/lib/toast'
import DesktopAuthorizeModal from '@/components/DesktopAuthorizeModal.vue'
import SessionExpiredModal from '@/components/SessionExpiredModal.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Modal state — shown when auth:expired fires
const sessionExpiredVisible = ref(false)
// Captures the page the user was on when the session expired
const sessionReturnUrl = ref('/')

function handleAuthExpired() {
  // Only act if there is actually an active session to expire
  if (authStore.token.value) {
    // Snapshot current path before clearing auth state
    sessionReturnUrl.value = route.fullPath
    // Do NOT redirect yet — show the friendly modal first
    sessionExpiredVisible.value = true
  }
}

function handleSessionConfirm() {
  sessionExpiredVisible.value = false
  // The form has established a new cookie session; keep the current page.
  window.dispatchEvent(new CustomEvent('auth:restored'))
  router.go(0)

}

// Register before RouterView children mount and start their first account request.
window.addEventListener('auth:expired', handleAuthExpired)

onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired)
})
</script>

<template>
  <div class="app-wrapper">
    <a class="skip-link" href="#main-content">Перейти к содержимому</a>
    <AppHeader />
    <p v-if="toastMessage" class="global-toast" role="status" aria-live="polite">{{toastMessage}}</p>
    <main id="main-content" tabindex="-1" class="app-main">
      <RouterView />
    </main>
    <CinemaFooter v-if="!['/profile','/login','/register'].includes(route.path)" />

    <DesktopAuthorizeModal />
    <!-- Global session-expired modal — rendered above everything -->
    <SessionExpiredModal
      :visible="sessionExpiredVisible"
      :return-url="sessionReturnUrl"
      @confirm="handleSessionConfirm"
    />
  </div>
</template>

<style scoped>
.global-toast{position:fixed;z-index:10000;bottom:24px;left:50%;transform:translateX(-50%);width:min(620px,calc(100vw - 48px));box-sizing:border-box;margin:0;padding:16px 20px;border:1px solid var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-raised);color:var(--ui-text);box-shadow:0 12px 40px #0006;line-height:1.5;font-size:14px}

.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>

<style>

/* All desktop account tabs share one shell and one navigation rail. */
@media(min-width:1024px){.app-wrapper:has(.account-page.account-shell)>.app-header{display:none}}
</style>
