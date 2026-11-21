<script setup lang="ts">
import { computed } from 'vue'
import { Play } from 'lucide-vue-next'
import type { TorrentItem } from '@/api/torrents'

const props = defineProps<{ hero: TorrentItem | null; loading: boolean; focused: boolean }>()
const emit = defineEmits<{ (e: 'watch'): void }>()

const genres = computed(() => (props.hero?.genres ?? [])
  .slice(0, 3)
  .map(g => g.name.slice(0, 1).toLocaleUpperCase('ru-RU') + g.name.slice(1)))
</script>

<template>
  <section class="tv-hero" :class="{ 'is-empty': !hero }" data-testid="tv-hero" :data-hero-id="hero?.tmdb_id">
    <img
      v-if="hero?.backdrop"
      :key="hero.backdrop"
      class="tv-hero-backdrop"
      :src="hero.backdrop"
      alt=""
      fetchpriority="high"
    />
    <div class="tv-hero-shade" aria-hidden="true" />
    <div v-if="hero" class="tv-hero-copy">
      <span class="tv-hero-label" data-testid="tv-hero-label">СЕГОДНЯ В ФОКУСЕ · Новая история каждые 4 часа</span>
      <h1 class="tv-hero-title" data-testid="tv-hero-title">{{ hero.title }}</h1>
      <div class="tv-hero-meta" data-testid="tv-hero-meta">
        <span v-if="hero.year">{{ hero.year }}</span>
        <span v-if="hero.rating" class="tv-hero-rating"><span class="tv-star" aria-hidden="true">★</span> {{ hero.rating.toFixed(1) }}</span>
        <span v-for="genre in genres" :key="genre" class="tv-hero-genre">{{ genre }}</span>
      </div>
      <p class="tv-hero-overview">{{ hero.overview || 'Откройте историю, к которой хочется вернуться.' }}</p>
      <button
        type="button"
        class="tv-hero-watch"
        :class="{ 'tv-focused': focused }"
        data-tv-key="hero:0"
        data-testid="tv-hero-watch"
        @click="emit('watch')"
      >
        <Play :size="28" fill="currentColor" aria-hidden="true" /> Смотреть
      </button>
    </div>
    <p v-else-if="loading" class="tv-hero-status">Загружаем историю дня…</p>
  </section>
</template>

<style scoped>
.tv-hero {
  position: relative;
  min-height: 78vh;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  background: #07080b;
}

.tv-hero.is-empty {
  min-height: 40vh;
}

.tv-hero-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.tv-hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(7, 8, 11, 0.96) 0%, rgba(7, 8, 11, 0.72) 34%, rgba(7, 8, 11, 0.12) 68%, transparent 100%),
    linear-gradient(0deg, #07080b 0%, rgba(7, 8, 11, 0.55) 26%, transparent 55%);
}

.tv-hero-copy {
  position: relative;
  z-index: 1;
  max-width: min(52vw, 980px);
  padding: 0 4vw 5vh;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.4vh;
}

.tv-hero-label {
  color: #9ce8d7;
  font-size: clamp(14px, 1.05vw, 26px);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tv-hero-title {
  margin: 0;
  font-size: clamp(36px, 3.6vw, 96px);
  line-height: 1.05;
  font-weight: 800;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
}

.tv-hero-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6em 1.2em;
  color: #d9dbe2;
  font-size: clamp(16px, 1.25vw, 32px);
  font-weight: 600;
}

.tv-hero-rating {
  color: #fff;
}

.tv-star {
  color: #f4d45e;
}

.tv-hero-genre {
  padding: 0.15em 0.6em;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  font-size: 0.85em;
}

.tv-hero-overview {
  margin: 0;
  max-width: 44em;
  color: #c9ccd4;
  font-size: clamp(16px, 1.2vw, 30px);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tv-hero-watch {
  margin-top: 1.2vh;
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.7em 1.8em;
  border: 0;
  border-radius: 14px;
  background: #f4d45e;
  color: #0d0e12;
  font: inherit;
  font-size: clamp(20px, 1.5vw, 40px);
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.tv-hero-watch:hover,
.tv-hero-watch.tv-focused {
  background: #9ce8d7;
}

.tv-hero-status {
  position: relative;
  z-index: 1;
  padding: 0 4vw 5vh;
  color: #9ca3af;
  font-size: clamp(18px, 1.3vw, 32px);
}
</style>
