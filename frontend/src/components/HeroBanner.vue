<script setup lang="ts">
import { t } from '@/i18n'
import type { MovieSummary } from '@/types/movie'
import { computed } from 'vue'

const props = defineProps<{
  movie: MovieSummary
}>()

const emit = defineEmits<{
  (e: 'play', movie: MovieSummary): void
}>()

const formattedRuntime = computed(() => {
  if (!props.movie.runtime) return null
  const hrs = Math.floor(props.movie.runtime / 60)
  const mins = props.movie.runtime % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
})

function onPlay() {
  emit('play', props.movie)
}
</script>

<template>
  <div class="hero-banner">
    <div class="backdrop-wrapper">
      <img v-if="movie.poster" :src="movie.poster" :alt="movie.title" class="backdrop-image" />
      <div class="backdrop-overlay"></div>
    </div>

    <div class="hero-content">
      <div class="hero-badges">
        <span v-if="movie.quality" class="hero-badge quality">{{ movie.quality }}</span>
        <span v-if="movie.rating" class="hero-badge rating">⭐ {{ movie.rating.toFixed(1) }}</span>
        <span v-if="movie.year" class="hero-badge">{{ movie.year }}</span>
        <span v-if="formattedRuntime" class="hero-badge">{{ formattedRuntime }}</span>
      </div>

      <h1 class="hero-title">{{ movie.title }}</h1>

      <div v-if="movie.genres && movie.genres.length" class="hero-genres">
        <span v-for="g in movie.genres" :key="g.id" class="hero-genre-tag">{{ g.name }}</span>
      </div>

      <div class="hero-actions">
        <button class="hero-play-btn" @click="onPlay" tabindex="0">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg> {{ t("Play Movie") }} </button>

        <router-link :to="`/movies/${movie.id}`" class="hero-details-btn" tabindex="0">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg> {{ t("More Details") }} </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-banner {
  position: relative;
  min-height: 420px;
  border-radius: var(--ui-radius-panel);
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  padding: 40px 32px;
  margin-bottom: 36px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
}

.backdrop-wrapper {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.backdrop-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.35;
  filter: blur(2px);
}

.backdrop-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(13, 14, 18, 0.95) 0%,
    rgba(13, 14, 18, 0.75) 50%,
    rgba(13, 14, 18, 0.4) 100%
  ),
  linear-gradient(to top, rgba(13, 14, 18, 1) 0%, transparent 60%);
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-badge {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--ui-radius);
  background: var(--ui-raised);
  color: var(--ui-text);
}

.hero-badge.quality {
  background: rgba(16, 185, 129, 0.25);
  color: var(--ui-success);
}

.hero-badge.rating {
  background: rgba(251, 191, 36, 0.2);
  color: var(--ui-warning);
}

.hero-title {
  font-size: 2.4rem;
  font-weight: 900;
  line-height: 1.15;
  color: var(--ui-text);
  margin: 0;
  letter-spacing: -0.5px;
}

.hero-genres {
  display: flex;
  gap: 6px;
}

.hero-genre-tag {
  font-size: 0.8rem;
  background: var(--ui-raised);
  padding: 2px 10px;
  border-radius: var(--ui-radius);
  color: var(--ui-secondary);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 8px;
}

.hero-play-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 12px 28px;
  border-radius: var(--ui-radius);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: none;
  transition: background 0.15s ease, transform 0.15s ease;
  outline: none;
}

.hero-play-btn:hover,
.hero-play-btn:focus-visible {
  background: var(--ui-primary);
  transform: translateY(-2px);
  box-shadow: 0 0 0 3px var(--ui-border);
  color: var(--ui-on-primary);
}

.hero-details-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
  text-decoration: none;
  padding: 12px 24px;
  border-radius: var(--ui-radius);
  font-size: 1rem;
  font-weight: 600;
  transition: background 0.15s ease;
  outline: none;
}

.hero-details-btn:hover,
.hero-details-btn:focus-visible {
  background: var(--ui-raised);
}
</style>
