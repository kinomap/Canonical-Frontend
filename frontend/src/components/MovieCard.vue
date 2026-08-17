<script setup lang="ts">
import type { MovieSummary } from '@/types/movie'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  movie: MovieSummary
  eager?: boolean
}>(), {
  eager: false
})

// Clean display title — strip emoji prefixes and MSX/technical storage suffixes
const displayTitle = computed(() => {
  let t = props.movie.title
  // Remove leading emoji clusters (U+1F000–U+1FFFF and U+2600–U+27FF)
  t = t.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+\s*/gu, '')
  // Remove " / YEAR / MSX storage" or " / MSX storage" suffix
  t = t.replace(/\s*\/\s*\d{4}\s*\/.*$/u, '')
  t = t.replace(/\s*\/\s*MSX\s+\w+.*/iu, '')
  return t.trim() || props.movie.title
})
</script>

<template>
  <router-link
    :to="`/movies/${movie.id}`"
    class="movie-card"
    :data-id="movie.id"
    tabindex="0"
  >
    <div class="poster-wrapper">
      <img
        v-if="movie.poster"
        :src="movie.poster"
        :alt="movie.title"
        class="poster-img"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
      />
      <div v-else class="poster-fallback">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <polyline points="11 3 11 11 14 8 17 11 17 3"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M20.4 14.5 16 10 4 20"/>
        </svg>
      </div>

      <div class="badges-overlay" v-if="movie.rating">
        <span class="badge rating-badge">{{ movie.rating.toFixed(1) }}</span>
      </div>
    </div>

    <div class="card-content">
      <h3 class="movie-title" :title="displayTitle">{{ displayTitle }}</h3>
    </div>
  </router-link>
</template>

<style scoped>
.movie-card {
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

.movie-card:hover,
.movie-card:focus-visible {
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

.movie-card:hover .poster-wrapper {
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
}

.poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.movie-card:hover .poster-img {
  transform: scale(1.05);
}

.poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4b5563;
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

.movie-title {
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

