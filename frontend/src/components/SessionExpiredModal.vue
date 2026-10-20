<script setup lang="ts">
import { t } from '@/i18n'
/**
 * SessionExpiredModal — shown app-wide when auth:expired fires.
 *
 * Props:
 *   visible   — whether the modal is shown
 *   returnUrl — the path the user was on when the session expired;
 *               passed to /login?redirect=<returnUrl> so they land
 *               back on the same page after re-auth.
 *
 * Emits:
 *   confirm   — user clicked "Sign In Again"; parent handles logout + redirect
 */
defineProps<{
  visible: boolean
  returnUrl: string
}>()

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <Transition name="session-modal">
    <div v-if="visible" class="session-overlay" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div class="session-card">
        <!-- Lock icon -->
        <div class="session-icon-wrap">
          <svg class="session-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <!-- Text -->
        <h2 id="session-title" class="session-title">{{ t("Session Expired") }}</h2>
        <p class="session-body"> {{ t("Your session has ended due to inactivity or token expiry.") }}<br> {{ t("Please sign in again to continue.") }} </p>

        <!-- CTA -->
        <button class="session-btn" @click="emit('confirm')" autofocus>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg> {{ t("Sign In Again") }} </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */
.session-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  /* Frosted-glass backdrop */
  background: rgba(7, 8, 12, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ── Card ────────────────────────────────────────────────────────────────── */
.session-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 48px 40px;
  max-width: 400px;
  width: 100%;
  text-align: center;

  background: rgba(24, 25, 32, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

/* ── Icon ────────────────────────────────────────────────────────────────── */
.session-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(251, 191, 36, 0.1);
  border: 1.5px solid rgba(251, 191, 36, 0.3);
  box-shadow: 0 0 24px rgba(251, 191, 36, 0.12);
}

.session-icon {
  width: 32px;
  height: 32px;
  color: #fbbf24;
}

/* ── Typography ──────────────────────────────────────────────────────────── */
.session-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f3f4f6;
  margin: 0;
  letter-spacing: -0.02em;
}

.session-body {
  font-size: 0.95rem;
  color: #9ca3af;
  line-height: 1.6;
  margin: 0;
}

/* ── Button ──────────────────────────────────────────────────────────────── */
.session-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
  width: 100%;
  justify-content: center;

  color: #fff;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.session-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}

.session-btn:active {
  transform: translateY(0);
}

/* ── Transition ──────────────────────────────────────────────────────────── */
.session-modal-enter-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.session-modal-leave-active {
  transition: opacity 0.18s ease;
}
.session-modal-enter-from {
  opacity: 0;
  transform: scale(0.92);
}
.session-modal-leave-to {
  opacity: 0;
}
</style>
