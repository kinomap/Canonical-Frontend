<script setup lang="ts">
import { toasts } from '../toast'
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast-${toast.type}`">
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 9999;
}

.toast {
  padding: 12px 24px;
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-weight: 500;
  box-shadow: var(--ui-shadow-overlay);
  min-width: 250px;
}

.toast-success { background: var(--ui-success-bg); color:var(--ui-success);border:1px solid #32755e; }
.toast-error { background: var(--ui-danger-bg); color:var(--ui-danger);border:1px solid #8c4c60; }
.toast-info { background: var(--ui-primary); color: var(--ui-on-primary); }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.toast-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
