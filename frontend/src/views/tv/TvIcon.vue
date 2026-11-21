<script setup lang="ts">
/**
 * Vector icon / sticker of the TV layer (see tvIcons.ts). Colour comes from `currentColor`:
 * passive #64748b, active gold / neon blue, focused white — the glow is applied by the focused host.
 */
import { computed } from 'vue'
import { tvIcon, type TvIconName } from './tvIcons'

const props = withDefaults(defineProps<{ name: TvIconName; size?: string }>(), { size: '1em' })

const gradientId = `tv-icon-glass-${Math.random().toString(36).slice(2, 10)}`
const shape = computed(() => tvIcon(props.name))
</script>

<template>
  <svg
    class="tv-icon"
    :data-icon="name"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.42" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0.06" />
      </linearGradient>
    </defs>
    <path v-for="(d, i) in shape.accent ?? []" :key="`a${i}`" :d="d" :fill="`url(#${gradientId})`" />
    <path v-for="(d, i) in shape.paths" :key="`p${i}`" :d="d" />
  </svg>
</template>

<style scoped>
.tv-icon {
  display: block;
  flex: none;
  overflow: visible;
}
</style>
