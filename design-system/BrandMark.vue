<script setup lang="ts">
import mascot from './brand/kinosota-mascot-3d.webp'
import icon from './brand/kinosota-icon.svg'
defineProps<{ compact?: boolean }>()
</script>
<template>
  <span class="brand-logo" :class="{ compact }">
    <span class="logo-emblem" aria-hidden="true"><img class="logo-svg" :src="compact ? icon : mascot" alt="" width="44" height="44" decoding="async" /></span>
    <span v-if="!compact" class="wordmark"><span class="wordmark-highlight">KINO</span><span class="wordmark-honey">SOTA</span></span>
  </span>
</template>
<style scoped>
.brand-logo{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;user-select:none;line-height:1;max-width:100%}
.logo-emblem{width:44px;height:44px;display:inline-flex;flex-shrink:0}.logo-svg{width:100%;height:100%;object-fit:contain;display:block}
.wordmark{font-family:var(--ui-font);font-weight:850;font-size:20px;letter-spacing:-.035em;color:var(--ui-text)}
.wordmark-highlight{color:#fff8eb}.wordmark-honey{color:#ffce21}.compact .logo-emblem{width:36px;height:36px}
</style>
