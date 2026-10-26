<script setup lang="ts">
import PosterPlay from './PosterPlay.vue'
import {contentPath} from '@/utils/contentPath'
import { t } from '@/i18n'
import type { MovieSummary } from '@/types/movie'
import { computed, ref } from 'vue'
import { posterSrcset, posterUrl } from '@/utils/poster'

const props = withDefaults(defineProps<{
  movie: MovieSummary
  eager?: boolean
}>(), {
  eager: false
})

const posterError = ref(false)

const handlePosterError = () => {
  posterError.value = true
}

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

const displayYear = computed(() => {
  if (props.movie.year) return props.movie.year
  const match = props.movie.title.match(/\/\s*(\d{4})\s*\//)
  return match ? match[1] : null
})
</script>

<template>
  <article class="poster-article">
  <router-link
    :to="contentPath(movie.type==='series'?'series':'movie',movie.id,displayTitle)"
    class="movie-card"
    :data-id="movie.id"
    tabindex="0"
  >
    <div class="poster-wrapper">
      <img
        v-if="movie.poster && !posterError"
        :src="posterUrl(movie.poster)"
        :alt="`Постер фильма «${displayTitle}»`"
        :srcset="posterSrcset(movie.poster)"
        sizes="(max-width:599px) 45vw, (max-width:767px) 30vw, (max-width:1023px) 23vw, (max-width:1439px) 18vw, 240px"
        width="240" height="360" decoding="async"
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

      <PosterPlay />
      <div class="badges-overlay">
        <span class="badge series-badge" v-if="movie.type === 'series'">{{ t("СЕРИАЛ") }}</span>
        <span class="badge rating-badge" v-if="movie.rating">{{ movie.rating.toFixed(1) }}</span>
      </div>
    </div>

    <div class="card-content">
      <h3 class="movie-title" :title="displayTitle">{{ displayTitle }}</h3>
    </div>
  </router-link>
  </article>
</template>

<style scoped>
.movie-card {
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: var(--ui-radius);
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
  background: var(--ui-bg);
  border-radius: var(--ui-radius);
  overflow: hidden;
  box-shadow: none;
  border: 1px solid var(--ui-border);
}

.movie-card:hover .poster-wrapper {
  border-color: var(--ui-border);
  box-shadow: none;
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

.poster-fallback.branded-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #000000 100%);
  color: var(--ui-text);
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
  font-size: 12px;
  letter-spacing: 0.2em;
  color: var(--ui-secondary);
  text-transform: uppercase;
}

.fallback-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
  color: var(--ui-text);
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
  color: var(--ui-secondary);
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
  border-radius: var(--ui-radius);
  backdrop-filter: none;
}

.rating-badge {
  background: rgba(0, 0, 0, 0.75);
  color: var(--ui-warning);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.series-badge {
  background: var(--ui-raised);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  margin-right: 4px;
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
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
</style>

