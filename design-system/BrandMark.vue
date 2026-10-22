<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>
<template>
  <span class="brand-logo" :class="{ compact }">
    <span class="logo-emblem" aria-hidden="true"><svg class="logo-svg" viewBox="0 0 40 40" fill="none"><rect x="1" y="1" width="38" height="38" rx="10" fill="var(--ui-raised)"/><circle cx="18" cy="20" r="10" stroke="var(--ui-brand)" stroke-width="2.5"/><path d="M15 14L26 20L15 26V14Z" fill="var(--ui-text)"/><circle cx="31" cy="11" r="2.5" fill="var(--ui-brand)"/><circle cx="32" cy="29" r="2" fill="var(--ui-brand)"/></svg></span>
    <span v-if="!compact" class="wordmark"><span class="wordmark-highlight">KINO</span>SOTA</span>
  </span>
</template>
<style scoped>
.brand-logo{display:inline-flex;align-items:center;gap:10px;white-space:nowrap;user-select:none;line-height:1}
.logo-emblem{width:36px;height:36px;display:inline-flex;flex-shrink:0}.logo-svg{width:100%;height:100%;display:block}
.wordmark{font-family:var(--ui-font);font-weight:800;font-size:20px;letter-spacing:-.025em;color:var(--ui-text)}
.wordmark-highlight{color:var(--ui-brand)}
</style>
