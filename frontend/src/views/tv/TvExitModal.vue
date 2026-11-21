<script setup lang="ts">
/**
 * «Выйти в Launcher KINOSOTA?» on Back from the top of /tv or the menu entry «Выход».
 * The host screen routes the remote keys here while it is open; «Выйти» calls tvLauncher.exit() (MSX / Launcher).
 */
import TvIcon from './TvIcon.vue'

defineProps<{ open: boolean; focused: 'exit' | 'stay' }>()
const emit = defineEmits<{ (e: 'exit'): void; (e: 'stay'): void }>()
</script>

<template>
  <div v-if="open" class="tv-exit" role="dialog" aria-modal="true" aria-labelledby="tv-exit-title" data-testid="tv-exit-modal">
    <div class="tv-exit-card">
      <span class="tv-exit-sticker"><TvIcon name="exit" size="56" /></span>
      <h2 id="tv-exit-title">Выйти в Launcher KINOSOTA?</h2>
      <p class="tv-exit-sub">Вы вернётесь в Media Station X / Launcher.</p>
      <div class="tv-exit-actions">
        <button
          type="button"
          class="tv-exit-btn danger"
          :class="{ 'tv-focused': focused === 'exit' }"
          data-tv-key="exit:0"
          data-testid="tv-exit-confirm"
          @click="emit('exit')"
        >
          Выйти
        </button>
        <button
          type="button"
          class="tv-exit-btn"
          :class="{ 'tv-focused': focused === 'stay' }"
          data-tv-key="exit:1"
          data-testid="tv-exit-stay"
          @click="emit('stay')"
        >
          Остаться в приложении
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tv-exit {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.tv-exit-card {
  min-width: 40vw;
  padding: 5vh 4vw;
  border-radius: 28px;
  background: linear-gradient(160deg, rgba(22, 26, 38, 0.96) 0%, rgba(10, 12, 18, 0.96) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  text-align: center;
}

.tv-exit-sticker {
  display: inline-flex;
  margin-bottom: 2.4vh;
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 99, 99, 0.1);
  color: #ff8a8a;
  filter: drop-shadow(0 0 14px rgba(255, 99, 99, 0.45));
}

.tv-exit-card h2 {
  margin: 0 0 1.4vh;
  font-size: clamp(26px, 2vw, 52px);
  font-weight: 900;
}

.tv-exit-sub {
  margin: 0 0 4vh;
  color: #94a3b8;
  font-size: clamp(16px, 1.1vw, 28px);
}

.tv-exit-actions {
  display: flex;
  justify-content: center;
  gap: 2vw;
}

.tv-exit-btn {
  padding: 1.6vh 2.4vw;
  border: 3px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  font: inherit;
  font-size: clamp(18px, 1.3vw, 34px);
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.tv-exit-btn.tv-focused {
  color: #fff;
  border-color: #00d2ff;
  box-shadow: 0 0 24px rgba(0, 210, 255, 0.55);
  transform: scale(1.06);
}

.tv-exit-btn.danger.tv-focused {
  border-color: #ff6363;
  box-shadow: 0 0 24px rgba(255, 99, 99, 0.55);
}
</style>
