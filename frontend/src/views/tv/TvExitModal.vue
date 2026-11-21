<script setup lang="ts">
/** «Выйти в Launcher KINOSOTA?» on Back from the top of /tv. The host screen routes the remote keys here while it is open. */
defineProps<{ open: boolean; focused: 'exit' | 'stay' }>()
const emit = defineEmits<{ (e: 'exit'): void; (e: 'stay'): void }>()
</script>

<template>
  <div v-if="open" class="tv-exit" role="dialog" aria-modal="true" aria-labelledby="tv-exit-title" data-testid="tv-exit-modal">
    <div class="tv-exit-card">
      <h2 id="tv-exit-title">Выйти в Launcher KINOSOTA?</h2>
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
  backdrop-filter: blur(6px);
}

.tv-exit-card {
  min-width: 40vw;
  padding: 5vh 4vw;
  border-radius: 28px;
  background: #12141a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6);
  text-align: center;
}

.tv-exit-card h2 {
  margin: 0 0 4vh;
  font-size: clamp(26px, 2vw, 52px);
  font-weight: 900;
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
