<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import type { MovieSummary } from '@/types/movie'
import MovieCard from '@/components/MovieCard.vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  movies: MovieSummary[]
  viewAllLink?: string
  eager?: boolean
}>(), {
  eager: false
})

const railContainer = ref<HTMLElement | null>(null)

function scrollLeft() {
  if (railContainer.value) {
    railContainer.value.scrollBy({ left: -400, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
}

function scrollRight() {
  if (railContainer.value) {
    railContainer.value.scrollBy({ left: 400, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
}

function handleWheel(event: WheelEvent) {
  // Let native horizontal scroll work (e.g. trackpads)
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

  if (railContainer.value) {
    const track = railContainer.value
    // Check if we are at the edges to allow page scroll when slider is at the end
    const atLeft = track.scrollLeft <= 0 && event.deltaY < 0
    const atRight = track.scrollWidth - track.clientWidth - track.scrollLeft <= 1 && event.deltaY > 0
    
    if (!atLeft && !atRight) {
      event.preventDefault()
      // Use auto behavior for mouse wheel to prevent jank
      track.scrollBy({ left: event.deltaY, behavior: 'auto' })
    }
  }
}
</script>

<template>
  <section v-if="movies && movies.length > 0" class="movie-rail">
    <div class="rail-header">
      <h2 class="rail-title">{{ title }}</h2>
      <div class="rail-header-right">
        <div class="scroll-buttons">
          <button class="scroll-btn" :title="t('Scroll Left')" @click="scrollLeft">
            <ChevronLeft :size="20" />
          </button>
          <button class="scroll-btn" :title="t('Scroll Right')" @click="scrollRight">
            <ChevronRight :size="20" />
          </button>
        </div>
        <router-link v-if="viewAllLink" :to="viewAllLink" class="rail-view-all">Смотреть все</router-link>
      </div>
    </div>

    <div ref="railContainer" class="rail-track" @wheel="handleWheel">
      <div v-for="(movie, index) in movies" :key="movie.id" class="rail-item">
        <MovieCard :movie="movie" :eager="eager && index < 6" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.movie-rail {
  margin-bottom: 36px;
}

.rail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.rail-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--ui-text);
  margin: 0;
  letter-spacing: -0.3px;
}

.rail-header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.scroll-buttons {
  display: flex;
  gap: 6px;
}

.scroll-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.scroll-btn:hover {
  background: var(--ui-raised);
}

.rail-track {
  display: flex;
  gap: var(--poster-gap);
  overflow-x: auto;
  scroll-behavior: smooth;
  padding-bottom: 12px;
  scrollbar-width: none;
  scroll-snap-type: x mandatory;
}

.rail-track::-webkit-scrollbar {
  display: none;
}

.rail-item {
  /* Rails and catalog grids use the same responsive poster geometry. */
  flex: 0 0 var(--poster-width);
  max-width: var(--poster-width);
  scroll-snap-align: start;
}
</style>
