<script setup lang="ts">
/** Rotating hero of a category showcase: the current top title, OK opens its title card. */
import { computed } from 'vue'
import type { TvCard } from './tvCards'

const props = defineProps<{ cards: TvCard[]; index: number; focused: boolean; title: string; subtitle: string }>()
const emit = defineEmits<{ (e: 'open'): void }>()

const card = computed(() => props.cards[props.index] ?? props.cards[0] ?? null)
const picture = computed(() => card.value?.backdrop || card.value?.poster || '')
</script>

<template>
  <section class="tv-sc-hero" :class="{ 'is-empty': !card }" data-testid="tv-showcase-hero">
    <img v-if="picture" :key="picture" class="tv-sc-hero-bg" :class="{ blur: !card?.backdrop }" :src="picture" alt="" />
    <div class="tv-sc-hero-shade" aria-hidden="true" />
    <div class="tv-sc-hero-copy">
      <span class="tv-sc-hero-kicker">{{ subtitle }}</span>
      <p class="tv-sc-hero-section" data-testid="tv-showcase-title">{{ title }}</p>
      <template v-if="card">
        <h1 class="tv-sc-hero-title" data-testid="tv-showcase-hero-title">{{ card.title }}</h1>
        <p class="tv-sc-hero-meta">
          <span v-if="card.year">{{ card.year }}</span>
          <span v-if="card.rating"><span class="tv-star" aria-hidden="true">★</span> {{ card.rating.toFixed(1) }}</span>
        </p>
        <p v-if="card.overview" class="tv-sc-hero-overview">{{ card.overview }}</p>
        <button
          type="button"
          class="tv-sc-hero-btn"
          :class="{ 'tv-focused': focused }"
          data-tv-key="hero:0"
          data-testid="tv-showcase-hero-open"
          @click="emit('open')"
        >
          ▶ Подробнее и смотреть
        </button>
        <div v-if="cards.length > 1" class="tv-sc-hero-dots" aria-hidden="true">
          <span v-for="(item, i) in cards" :key="item.key" :class="{ on: i === index }" />
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.tv-sc-hero {
  position: relative;
  min-height: 56vh;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.tv-sc-hero.is-empty {
  min-height: 22vh;
}

.tv-sc-hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: tv-sc-fade 0.6s ease;
}

.tv-sc-hero-bg.blur {
  filter: blur(28px) brightness(0.7);
  transform: scale(1.15);
}

.tv-sc-hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(7, 8, 11, 0.96) 0%, rgba(7, 8, 11, 0.6) 45%, rgba(7, 8, 11, 0.1) 100%),
    linear-gradient(0deg, #07080b 0%, rgba(7, 8, 11, 0) 45%);
}

.tv-sc-hero-copy {
  position: relative;
  max-width: 52vw;
  padding: 6vh 4vw 4vh;
}

.tv-sc-hero-kicker {
  color: #00d2ff;
  font-size: clamp(14px, 0.9vw, 22px);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tv-sc-hero-section {
  margin: 0.6vh 0 1.4vh;
  color: #f4d45e;
  font-size: clamp(18px, 1.3vw, 32px);
  font-weight: 800;
}

.tv-sc-hero-title {
  margin: 0 0 1.2vh;
  font-size: clamp(34px, 3.2vw, 84px);
  font-weight: 900;
  line-height: 1.05;
}

.tv-sc-hero-meta {
  display: flex;
  gap: 1.4vw;
  margin: 0 0 1.4vh;
  color: #d1d5db;
  font-size: clamp(16px, 1.1vw, 28px);
  font-weight: 700;
}

.tv-star {
  color: #f4d45e;
}

.tv-sc-hero-overview {
  display: -webkit-box;
  margin: 0 0 2.4vh;
  overflow: hidden;
  color: #cbd5e1;
  font-size: clamp(15px, 1vw, 26px);
  line-height: 1.45;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.tv-sc-hero-btn {
  padding: 1.4vh 2.2vw;
  border: 3px solid transparent;
  border-radius: 14px;
  background: #f4d45e;
  color: #0d0e12;
  font: inherit;
  font-size: clamp(17px, 1.2vw, 30px);
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.tv-sc-hero-btn.tv-focused {
  border-color: #00d2ff;
  box-shadow: 0 0 0 4px rgba(0, 210, 255, 0.35), 0 0 32px rgba(0, 210, 255, 0.6);
  transform: scale(1.06);
}

.tv-sc-hero-dots {
  display: flex;
  gap: 8px;
  margin-top: 2.4vh;
}

.tv-sc-hero-dots span {
  width: 26px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.25);
}

.tv-sc-hero-dots span.on {
  background: #f4d45e;
}

@keyframes tv-sc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
