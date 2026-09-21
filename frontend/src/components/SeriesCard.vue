<script setup lang="ts">
import type { SeriesSummary } from '@/types/movie'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  series: SeriesSummary
  eager?: boolean
}>(), {
  eager: false
})

const posterError = ref(false)

const handlePosterError = () => {
  posterError.value = true
}

// Clean display title
const displayTitle = computed(() => {
  let t = props.series.title
  // Remove leading emoji clusters
  t = t.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+\s*/gu, '')
  // Remove " / YEAR / MSX storage" or " / MSX storage" suffix
  t = t.replace(/\s*\/\s*\d{4}\s*\/.*$/u, '')
  t = t.replace(/\s*\/\s*MSX\s+\w+.*/iu, '')
  return t.trim() || props.series.title
})

const displayYear = computed(() => {
  if (props.series.year) return props.series.year
  const match = props.series.title.match(/\/\s*(\d{4})\s*\//)
  return match ? match[1] : null
})
</script>

<template>
  <router-link
    :to="`/series/${series.id}`"
    class="series-card"
    :data-id="series.id"
    tabindex="0"
  >
    <div class="poster-wrapper">
      <img
        v-if="series.poster_url && !posterError"
        :src="series.poster_url"
        :alt="series.title"
        class="poster-img"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
        @error="handlePosterError"
      />
      <div v-else class="poster-fallback branded-fallback">
        <div class="fallback-content">
          <div class="brand-text">KINOSOTA</div>
          <h4 class="fallback-title">{{ displayTitle }}</h4>
          <span class="fallback-year" v-if="displayYear">{{ displayYear }}</span>
        </div>
      </div>

      <div class="badges-overlay" v-if="series.rating">
        <span class="badge rating-badge">{{ series.rating.toFixed(1) }}</span>
      </div>
    </div>

    <div class="card-content">
      <h3 class="series-title" :title="displayTitle">{{ displayTitle }}</h3>
    </div>
  </router-link>
</template>

<style scoped>
.series-card {
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 12px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease;
  outline: none;
}

.series-card:hover,
.series-card:focus-visible {
  transform: translateY(-6px) scale(1.02);
}

.poster-wrapper {
  position: relative;
  aspect-ratio: 2 / 3;
  width: 100%;
  background: #1a1b22;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.series-card:hover .poster-wrapper {
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
}

.poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.series-card:hover .poster-img {
  transform: scale(1.05);
}

.poster-fallback.branded-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #000000 100%);
  color: #fff;
  text-align: center;
  padding: 16px;
  position: relative;
  overflow: hidden;
}

.poster-fallback.branded-fallback::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.05), transparent);
  transform: skewX(-20deg);
  animation: shine 6s infinite;
}

@keyframes shine {
  0% { left: -100%; }
  20% { left: 200%; }
  100% { left: 200%; }
}

.fallback-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1;
}

.brand-text {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

.fallback-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
  color: #f3f4f6;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.fallback-year {
  font-size: 0.85rem;
  color: #9ca3af;
  font-weight: 500;
}

.badges-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  pointer-events: none;
  z-index: 2;
}

.badge {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  backdrop-filter: blur(8px);
}

.rating-badge {
  background: rgba(0, 0, 0, 0.75);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.card-content {
  padding: 12px 4px;
  display: flex;
  flex-direction: column;
}

.series-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
</style>
