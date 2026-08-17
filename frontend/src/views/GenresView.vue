<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient } from '@/api/client'
import type { Genre } from '@/types/movie'
import { ArrowRight } from 'lucide-vue-next'

const genres = ref<Genre[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function loadGenres() {
  error.value = null
  const timer = setTimeout(() => {
    if (!genres.value.length) loading.value = true
  }, 100)

  try {
    genres.value = await apiClient.listGenres()
  } catch (err: any) {
    error.value = err?.message || 'Failed to load genres'
  } finally {
    clearTimeout(timer)
    loading.value = false
  }
}

// Fallback to a default background if image fails to load
function onImageError(e: Event) {
  const target = e.target as HTMLElement;
  target.style.backgroundImage = 'linear-gradient(135deg, #1f2028 0%, #26293a 100%)';
}

onMounted(() => {
  loadGenres()
})
</script>

<template>
  <div class="genres-page">
    <div class="page-header">
      <h1 class="page-title">Жанры</h1>
      <p class="page-subtitle">Выберите настроение на вечер</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="genres-loading">
      <div v-for="i in 12" :key="i" class="genre-card-skeleton"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="genres-error">
      <h2>Failed to load genres</h2>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="loadGenres">Retry</button>
    </div>

    <!-- Genres Grid -->
    <div v-else-if="genres.length > 0" class="genres-grid">
      <router-link
        v-for="genre in genres"
        :key="genre.id"
        :to="`/movies?genre=${genre.slug}`"
        class="genre-card"
        tabindex="0"
      >
        <div 
          class="genre-card-bg"
          :style="{ backgroundImage: `url('/genres/${genre.slug}.jpg')` }"
          @error="onImageError"
        ></div>
        <div class="genre-card-overlay"></div>
        <div class="genre-card-content">
          <h3 class="genre-name">{{ genre.name }}</h3>
          <span class="genre-action">
            Смотреть
            <ArrowRight :size="16" stroke-width="2.5" />
          </span>
        </div>
      </router-link>
    </div>

    <!-- Empty -->
    <div v-else class="genres-empty">
      <p>No genres available yet.</p>
    </div>
  </div>
</template>

<style scoped>
.genres-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px 64px 24px;
  width: 100%;
}

.page-header {
  margin-bottom: 40px;
}

.page-title {
  font-size: 2.2rem;
  font-weight: 800;
  color: #f3f4f6;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}

.page-subtitle {
  color: #9ca3af;
  font-size: 1.1rem;
  margin: 0;
}

.genres-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.genre-card {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  outline: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.genre-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  z-index: 1;
}

.genre-card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to top, rgba(15, 16, 20, 0.95) 0%, rgba(15, 16, 20, 0.4) 50%, rgba(15, 16, 20, 0.1) 100%);
  z-index: 2;
  transition: background 0.3s ease;
}

.genre-card:hover .genre-card-bg,
.genre-card:focus-visible .genre-card-bg {
  transform: scale(1.08);
}

.genre-card:hover .genre-card-overlay,
.genre-card:focus-visible .genre-card-overlay {
  background: linear-gradient(to top, rgba(15, 16, 20, 0.85) 0%, rgba(15, 16, 20, 0.3) 60%, rgba(15, 16, 20, 0) 100%);
}

.genre-card-content {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 24px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  transition: transform 0.3s ease;
}

.genre-card:hover .genre-card-content,
.genre-card:focus-visible .genre-card-content {
  transform: translateY(-4px);
}

.genre-name {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  letter-spacing: -0.3px;
}

.genre-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #3b82f6;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.genre-card:hover .genre-action,
.genre-card:focus-visible .genre-action {
  opacity: 1;
  transform: translateX(0);
}

.genres-loading {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.genre-card-skeleton {
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  animation: shimmer 2s infinite linear;
  background: linear-gradient(to right, rgba(255,255,255,0.04) 4%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.04) 36%);
  background-size: 1000px 100%;
}

@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

.genres-error,
.genres-empty {
  text-align: center;
  padding: 80px 16px;
  color: #9ca3af;
  background: rgba(255,255,255,0.02);
  border-radius: 16px;
  border: 1px dashed rgba(255,255,255,0.1);
}

.retry-btn {
  margin-top: 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #2563eb;
}
</style>
