<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { apiClient } from '@/api/client'
import type { HomeCollections } from '@/types/movie'
import MovieRail from '@/components/MovieRail.vue'

// ── State ─────────────────────────────────────────────────────────────────────
const collections = ref<HomeCollections | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// New-movie notification
const newMovieCount = ref(0)
const knownTotal = ref<number | null>(null)
const knownLatest = ref<string | null>(null)
const showNewBanner = ref(false)

const hasAnyMovies = computed(() => {
  if (!collections.value) return false
  const c = collections.value
  return (
    (c.newest && c.newest.length > 0) ||
    (c.popular && c.popular.length > 0) ||
    (c.top_rated && c.top_rated.length > 0) ||
    (c.by_year && c.by_year.some(y => y.movies.length > 0)) ||
    (c.by_genre && c.by_genre.some(g => g.movies.length > 0)) ||
    !!c.hero
  )
})

// ── Load movies ───────────────────────────────────────────────────────────────
async function loadHome(silent = false) {
  if (!silent && !collections.value) {
    loading.value = true
    error.value = null
  }
  try {
    const data = await apiClient.getHomeCollections()
    collections.value = data
    
    // We update the baseline from the checkLatest response later, but let's initialize if empty
    if (knownTotal.value === null && data.newest) {
      // It's hard to get true "total" from home collections alone, so we'll rely on checkLatest
      checkForNewMovies(true) // init baseline silently
    }
  } catch (err: any) {
    if (!silent && !collections.value) {
      error.value = err?.message ?? 'Не удалось загрузить каталог'
    }
  } finally {
    loading.value = false
  }
}

// ── Smart refresh (latest-check) ──────────────────────────────────────────────
async function checkForNewMovies(initOnly = false) {
  if (document.hidden && !initOnly) return
  try {
    const check = await apiClient.checkLatest()
    if (initOnly) {
      knownTotal.value = check.total
      knownLatest.value = check.latest_created_at
      return
    }

    if (knownTotal.value !== null) {
      const diff = check.total - knownTotal.value
      if (diff > 0) {
        newMovieCount.value = diff
        showNewBanner.value = true
      }
    } else {
      knownTotal.value = check.total
    }
    
    // Update latest timestamp
    knownLatest.value = check.latest_created_at
  } catch {
    // Silent
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

function startRefresh() {
  if (refreshInterval) return
  refreshInterval = setInterval(() => checkForNewMovies(), 60_000)
}

function stopRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function handleVisibilityChange() {
  if (!document.hidden) {
    checkForNewMovies()
    startRefresh()
  } else {
    stopRefresh()
  }
}

// ── Show new movies ───────────────────────────────────────────────────────────
async function showNewMovies() {
  showNewBanner.value = false
  knownTotal.value = knownTotal.value! + newMovieCount.value
  newMovieCount.value = 0
  await loadHome(true) // silently reload the page to get newest movies
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function dismissBanner() {
  showNewBanner.value = false
  knownTotal.value = knownTotal.value! + newMovieCount.value
  newMovieCount.value = 0
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadHome()
  startRefresh()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="catalog-page">
    <!-- New-movie notification banner -->
    <Transition name="slide-down">
      <div v-if="showNewBanner" class="new-movie-banner" role="alert">
        <span class="banner-icon">🎬</span>
        <span class="banner-text">
          {{ newMovieCount === 1 ? 'Добавлен новый фильм' : `Добавлено новых фильмов: ${newMovieCount}` }}
        </span>
        <button class="banner-show-btn" @click="showNewMovies">Показать</button>
        <button class="banner-close-btn" aria-label="Закрыть" @click="dismissBanner">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </Transition>

    <!-- Header -->
    <div class="catalog-header">
      <h1 class="catalog-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Главная
      </h1>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="home-loading">
      <div v-for="j in 3" :key="j" class="skeleton-rail">
        <div class="rail-skeleton-title"></div>
        <div class="rail-skeleton-cards">
          <div v-for="i in 5" :key="i" class="skeleton-card">
            <div class="skeleton-poster"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="state-panel error-panel">
      <div class="state-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <h2 class="state-title">Не удалось загрузить каталог</h2>
      <p class="state-desc">{{ error }}</p>
      <button class="retry-btn" @click="loadHome(false)">Повторить</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="collections && !hasAnyMovies" class="state-panel empty-panel">
      <div class="state-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
      </div>
      <h2 class="state-title">Каталог пуст</h2>
      <p class="state-desc">Контент ещё не добавлен. Запустите ingest pipeline.</p>
    </div>

    <!-- Rails -->
    <div v-else-if="collections" class="home-content">
      <MovieRail
        title="Новинки"
        :movies="collections.newest"
        view-all-link="/movies?sort=newest"
        eager
      />

      <template v-if="collections.by_genre && collections.by_genre.length">
        <MovieRail
          v-for="genreItem in collections.by_genre"
          :key="genreItem.genre.id"
          :title="genreItem.genre.name"
          :movies="genreItem.movies"
          :view-all-link="`/genres?genre=${genreItem.genre.slug}`"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ── Page Layout ───────────────────────────────────────────────────────────── */
.catalog-page {
  width: 100%;
  min-height: 100vh;
  padding: 32px 24px 64px;
  max-width: 1600px;
  margin: 0 auto;
  box-sizing: border-box;
}

/* ── New movie banner ──────────────────────────────────────────────────────── */
.new-movie-banner {
  position: sticky;
  top: 72px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #1a3a2a 0%, #14532d 100%);
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(52, 211, 153, 0.15);
}

.banner-icon { font-size: 1.2rem; flex-shrink: 0; }
.banner-text { color: #6ee7b7; font-size: 0.95rem; font-weight: 500; flex: 1; }

.banner-show-btn {
  background: rgba(52, 211, 153, 0.2);
  border: 1px solid rgba(52, 211, 153, 0.5);
  color: #6ee7b7;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.banner-show-btn:hover {
  background: rgba(52, 211, 153, 0.3);
}

.banner-close-btn {
  background: none;
  border: none;
  color: #6ee7b7;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.banner-close-btn:hover { opacity: 1; }

/* ── Banner animation ──────────────────────────────────────────────────────── */
.slide-down-enter-active { animation: slideDown 0.3s ease; }
.slide-down-leave-active { animation: slideDown 0.2s ease reverse; }

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Catalog header ────────────────────────────────────────────────────────── */
.catalog-header { margin-bottom: 28px; }

.catalog-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: #f3f4f6;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon { color: #3b82f6; flex-shrink: 0; }

/* ── Skeleton Loading ──────────────────────────────────────────────────────── */
.home-loading {
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.rail-skeleton-title {
  height: 24px;
  width: 180px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 16px;
  animation: shimmer 1.6s infinite;
}

.rail-skeleton-cards {
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.skeleton-card {
  flex: 0 0 calc((100% - 64px) / 5);
  max-width: calc((100% - 64px) / 5);
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.skeleton-poster {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #1f2028 25%, #26293a 50%, #1f2028 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── State panels ──────────────────────────────────────────────────────────── */
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: 16px;
  text-align: center;
  padding: 40px 20px;
}

.state-icon { color: #374151; }
.state-title { font-size: 1.4rem; font-weight: 600; color: #e5e7eb; margin: 0; }
.state-desc  { color: #6b7280; font-size: 1rem; margin: 0; max-width: 400px; }

.retry-btn {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 8px;
}
.retry-btn:hover { background: #2563eb; }
</style>
