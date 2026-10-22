<script setup lang="ts">
import { t } from '@/i18n'
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
    > {{ t("All Genres") }} </button>
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
  scrollbar-color: var(--ui-secondary) transparent;
}

.genre-chip {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  color: var(--ui-secondary);
  padding: 6px 14px;
  border-radius: var(--ui-radius-panel);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.genre-chip:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.genre-chip.active {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border-color: var(--ui-control);
}
</style>
