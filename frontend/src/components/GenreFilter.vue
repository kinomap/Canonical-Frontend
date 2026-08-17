<script setup lang="ts">
import type { Genre } from '@/types/movie'

defineProps<{
  genres: Genre[]
  selectedGenre: string | null
}>()

const emit = defineEmits<{
  (e: 'select', genreSlug: string | null): void
}>()

function select(slug: string | null) {
  emit('select', slug)
}
</script>

<template>
  <div class="genre-filter">
    <button
      class="genre-chip"
      :class="{ active: selectedGenre === null || selectedGenre === '' }"
      @click="select(null)"
    >
      All Genres
    </button>
    <button
      v-for="genre in genres"
      :key="genre.id"
      class="genre-chip"
      :class="{ active: selectedGenre === genre.slug }"
      @click="select(genre.slug)"
    >
      {{ genre.name }}
    </button>
  </div>
</template>

<style scoped>
.genre-filter {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.genre-chip {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.genre-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f3f4f6;
}

.genre-chip.active {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}
</style>
