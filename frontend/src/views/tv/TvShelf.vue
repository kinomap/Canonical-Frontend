<script setup lang="ts">
import type { TvCard } from './tvCards'

defineProps<{ id: string; title: string; cards: TvCard[]; focusedIndex: number }>()
const emit = defineEmits<{ (e: 'select', index: number): void }>()
</script>

<template>
  <section class="tv-shelf" :data-testid="`tv-shelf-${id}`" :aria-label="title">
    <h2 class="tv-shelf-title">{{ title }}</h2>
    <div class="tv-shelf-track" role="list">
      <button
        v-for="(card, index) in cards"
        :key="card.key"
        type="button"
        role="listitem"
        class="tv-card"
        :class="{ 'tv-focused': focusedIndex === index }"
        :data-tv-key="`${id}:${index}`"
        :aria-label="card.title"
        @click="emit('select', index)"
      >
        <span class="tv-card-poster">
          <img v-if="card.poster" :src="card.poster" alt="" loading="lazy" />
          <span v-else class="tv-card-fallback">{{ card.title }}</span>
        </span>
        <span class="tv-card-title">{{ card.title }}</span>
        <span class="tv-card-meta">
          <span v-if="card.year">{{ card.year }}</span>
          <span v-if="card.rating"><span class="tv-star" aria-hidden="true">★</span> {{ card.rating.toFixed(1) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.tv-shelf {
  padding: 2.4vh 0 1vh;
}

.tv-shelf-title {
  margin: 0 0 1.4vh;
  padding: 0 4vw;
  font-size: clamp(22px, 1.6vw, 44px);
  font-weight: 800;
}

.tv-shelf-track {
  display: flex;
  gap: 1.4vw;
  padding: 2.2vh 4vw 3vh;
  overflow-x: auto;
  overflow-y: visible;
  scroll-padding: 0 4vw;
  scrollbar-width: none;
}

.tv-shelf-track::-webkit-scrollbar {
  display: none;
}

.tv-card {
  flex: 0 0 clamp(150px, 10.5vw, 300px);
  display: flex;
  flex-direction: column;
  gap: 0.6vh;
  padding: 0;
  border: 3px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.tv-card-poster {
  position: relative;
  display: block;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 11px;
  background: #16181e;
}

.tv-card-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tv-card-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: #9ca3af;
  font-weight: 700;
  text-align: center;
}

.tv-card-title {
  padding: 0 6px;
  font-size: clamp(15px, 0.95vw, 26px);
  font-weight: 700;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tv-card-meta {
  display: flex;
  gap: 0.8em;
  padding: 0 6px 6px;
  color: #9ca3af;
  font-size: clamp(13px, 0.85vw, 22px);
}

.tv-star {
  color: #f4d45e;
}
</style>
