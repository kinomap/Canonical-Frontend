<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()
</script>

<template>
  <div class="brand-logo" :class="{ compact }">
    <div class="logo-emblem">
      <svg
        class="logo-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        fill="none"
      >
        <!-- Background Badge -->
        <rect width="40" height="40" rx="10" fill="url(#brand_grad)" />

        <!-- Lens / Film Ring -->
        <circle cx="18" cy="20" r="10" stroke="#ffffff" stroke-width="2.5" stroke-opacity="0.9" />

        <!-- Play Symbol in center -->
        <polygon points="15,14 26,20 15,26" fill="#ffffff" />

        <!-- Film Reel Accent Notches -->
        <circle cx="31" cy="11" r="2.5" fill="#60a5fa" />
        <circle cx="32" cy="29" r="2" fill="#93c5fd" />

        <!-- Gradients -->
        <defs>
          <linearGradient id="brand_grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stop-color="#2563eb" />
            <stop offset="1" stop-color="#1d4ed8" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <span v-if="!compact" class="wordmark">
      <span class="wordmark-highlight">KINO</span>SOTA
    </span>
  </div>
</template>

<style scoped>
.brand-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  user-select: none;
}

.logo-emblem {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 4px 10px rgba(37, 99, 235, 0.4));
  transition: transform 0.2s ease;
}

.brand-logo:hover .logo-svg {
  transform: scale(1.06);
}

.wordmark {
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: 0.5px;
  color: #ffffff;
  font-family: Inter, system-ui, sans-serif;
  line-height: 1;
}

.wordmark-highlight {
  color: #60a5fa;
}
</style>
