<script setup lang="ts">
import { t } from '@/i18n'
defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="close">
      <div class="modal-card">
        <div class="modal-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="6 3 20 12 6 21 6 3"/>
          </svg>
        </div>

        <h3 class="modal-title">{{ t("Play Movie") }}</h3>
        <p class="modal-message">{{ t("Playback integration pending") }}</p>

        <button class="modal-btn" @click="close">{{ t("OK") }}</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.modal-card {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-panel);
  padding: 28px 24px;
  max-width: 360px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--ui-raised);
  color: var(--ui-link);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 8px 0;
}

.modal-message {
  font-size: 0.95rem;
  color: var(--ui-secondary);
  margin: 0 0 24px 0;
}

.modal-btn {
  width: 100%;
  padding: 10px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  border-radius: var(--ui-radius);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.modal-btn:hover {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}
</style>
