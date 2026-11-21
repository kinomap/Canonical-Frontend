<script setup lang="ts">
/**
 * TV fallback for any unknown /tv/* route (TV_NEXTGEN_PORTAL_SPEC §2.1): a full-screen TV page
 * with one remote button «Вернуться на главную ТВ». Never the desktop 404, header or footer.
 * OK, Back and Escape all lead to /tv.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { resolveTvKey } from '@/composables/useTvNavigation'
import TvIcon from './TvIcon.vue'

const router = useRouter()
const button = ref<HTMLButtonElement | null>(null)

function goHome() {
  void router.replace('/tv')
}

function onKeydown(event: KeyboardEvent) {
  const action = resolveTvKey(event)
  if (!action) return
  event.preventDefault()
  if (action === 'select' || action === 'back') goHome()
}

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  window.addEventListener('keydown', onKeydown)
  button.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.documentElement.classList.remove('tv-mode')
})
</script>

<template>
  <div class="tv-layer tv-404" data-testid="tv-not-found">
    <div class="tv-404-card">
      <span class="tv-404-sticker"><TvIcon name="movies" size="72" /></span>
      <h1>Этот экран не найден</h1>
      <p>Похоже, ссылка устарела. Всё кино ждёт вас на главной KINOSOTA TV.</p>
      <button
        ref="button"
        type="button"
        class="tv-404-btn tv-focused"
        data-tv-key="notfound:0"
        data-testid="tv-not-found-home"
        @click="goHome"
      >
        <TvIcon name="home" size="30" />
        <span>Вернуться на главную ТВ</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tv-layer {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at top, #141a2a 0%, #07080b 65%);
  color: #f5f5f7;
}

.tv-404-card {
  max-width: 56vw;
  text-align: center;
}

.tv-404-sticker {
  display: inline-flex;
  margin-bottom: 3vh;
  padding: 24px;
  border-radius: 28px;
  background: rgba(244, 212, 94, 0.08);
  color: #f4d45e;
  filter: drop-shadow(0 0 18px rgba(244, 212, 94, 0.45));
}

h1 {
  margin: 0 0 1.6vh;
  font-size: clamp(32px, 2.8vw, 76px);
  font-weight: 900;
}

p {
  margin: 0 0 5vh;
  color: #94a3b8;
  font-size: clamp(18px, 1.3vw, 34px);
}

.tv-404-btn {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 1.8vh 2.6vw;
  border: 3px solid #00d2ff;
  border-radius: 18px;
  background: rgba(0, 210, 255, 0.14);
  color: #fff;
  font: inherit;
  font-size: clamp(18px, 1.3vw, 34px);
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 28px rgba(0, 210, 255, 0.5);
  transform: scale(1.04);
}
</style>
