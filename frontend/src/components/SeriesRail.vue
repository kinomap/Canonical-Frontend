<script setup lang="ts">
import { ref } from 'vue'
import type { SeriesSummary } from '@/types/movie'
import SeriesCard from '@/components/SeriesCard.vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  seriesList: SeriesSummary[]
  viewAllLink?: string
  eager?: boolean
}>(), {
  eager: false
})

const railContainer = ref<HTMLElement | null>(null)

function scrollLeft() {
  if (railContainer.value) {
    railContainer.value.scrollBy({ left: -400, behavior: 'smooth' })
  }
}

function scrollRight() {
  if (railContainer.value) {
    railContainer.value.scrollBy({ left: 400, behavior: 'smooth' })
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
  <div v-if="seriesList && seriesList.length > 0" class="series-rail">
    <div class="rail-header">
      <h2 class="rail-title">{{ title }}</h2>
      <div class="rail-header-right">
        <div class="scroll-buttons">
          <button class="scroll-btn" title="Scroll Left" @click="scrollLeft">
            <ChevronLeft :size="20" />
          </button>
          <button class="scroll-btn" title="Scroll Right" @click="scrollRight">
            <ChevronRight :size="20" />
          </button>
        </div>
      </div>
    </div>

    <div ref="railContainer" class="rail-track" @wheel="handleWheel">
      <div v-for="(seriesItem, index) in seriesList" :key="seriesItem.id" class="rail-item">
        <SeriesCard :series="seriesItem" :eager="eager && index < 5" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.series-rail {
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
  color: #f3f4f6;
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
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.scroll-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.rail-track {
  display: flex;
  gap: 16px;
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
  /* Exactly 5 cards visible with 16px gaps (4 gaps * 16px = 64px) */
  flex: 0 0 calc((100% - 64px) / 5);
  max-width: calc((100% - 64px) / 5);
  scroll-snap-align: start;
}
</style>
