<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { apiClient } from '@/api/client'
import type { HomeCollections } from '@/types/movie'
import MovieRail from '@/components/MovieRail.vue'
import ShowcaseHero from '@/components/ShowcaseHero.vue'
import QuickCategories from '@/components/QuickCategories.vue'

// ── State ─────────────────────────────────────────────────────────────────────
const collections = ref<HomeCollections | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Background catalog refresh: no notification or user confirmation.
const knownTotal = ref<number | null>(null)
const knownLatest = ref<string | null>(null)
let checking = false
let disposed = false
let initialReady = false

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
    const data = await apiClient.getHomeCollections(silent)
    if (disposed) return false
    collections.value = data
    return true
  } catch (err: any) {
    if (!disposed && !silent && !collections.value) {
      error.value = err?.message ?? 'Не удалось загрузить каталог'
    }
    return false
  } finally {
    if (!disposed) loading.value = false
  }
}

// ── Smart refresh (latest-check) ──────────────────────────────────────────────
async function checkForNewMovies(initOnly = false) {
  if (disposed || checking || (document.hidden && !initOnly)) return
  checking = true
  try {
    const check = await apiClient.checkLatest()
    if (disposed) return
    if (initOnly) {
      knownTotal.value = check.total
      knownLatest.value = check.latest_created_at
      return
    }
    if (document.hidden) return
    const changed = knownTotal.value === null || check.total !== knownTotal.value || check.latest_created_at !== knownLatest.value
    // Keep the current rails mounted, without a loader, scrolling or toasts.
    // Advance the baseline only after successful refresh, so failures retry.
    if (changed && !(await loadHome(true))) return
    if (!disposed) {
      knownTotal.value = check.total
      knownLatest.value = check.latest_created_at
    }
  } catch {
    // Background failures never interrupt the viewer or clear existing movies.
  } finally {
    checking = false
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

function startRefresh() {
  if (disposed || document.hidden || refreshInterval) return
  refreshInterval = setInterval(() => checkForNewMovies(), 60_000)
}

function stopRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function handleVisibilityChange() {
  if (!initialReady || disposed) return
  if (!document.hidden) {
    checkForNewMovies()
    startRefresh()
  } else {
    stopRefresh()
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const baseline = checkForNewMovies(true)
  await loadHome()
  await baseline
  if (disposed) return
  initialReady = true
  startRefresh()
})

onUnmounted(() => {
  disposed = true
  stopRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="catalog-page">
    <ShowcaseHero />
    <QuickCategories />

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
      <h2 class="state-title">{{ t("Не удалось загрузить каталог") }}</h2>
      <p class="state-desc">{{ error }}</p>
      <button class="retry-btn" @click="loadHome(false)">{{ t("Повторить") }}</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="collections && !hasAnyMovies" class="state-panel empty-panel">
      <div class="state-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
      </div>
      <h2 class="state-title">{{ t("Каталог пуст") }}</h2>
      <p class="state-desc">{{ t("Контент ещё не добавлен. Запустите ingest pipeline.") }}</p>
    </div>

    <!-- Rails -->
    <div v-else-if="collections" class="home-content">
      <MovieRail
        :title="t('Новинки')"
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
  padding: var(--page-frame-top) var(--page-frame-gutter) 64px;
  max-width: var(--page-frame-max);
  margin: 0 auto;
  box-sizing: border-box;
}

/* ── Catalog header ────────────────────────────────────────────────────────── */
.catalog-header { margin-bottom: 28px; }

.catalog-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon { color: var(--ui-link); flex-shrink: 0; }

/* ── Skeleton Loading ──────────────────────────────────────────────────────── */
.home-loading {
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.rail-skeleton-title {
  height: 24px;
  width: 180px;
  border-radius: var(--ui-radius);
  background: var(--ui-raised);
  margin-bottom: 16px;
  animation: shimmer 1.6s infinite;
}

.rail-skeleton-cards {
  display: flex;
  gap: var(--poster-gap);
  overflow: hidden;
}

.skeleton-card {
  flex: 0 0 var(--poster-width);
  max-width: var(--poster-width);
  aspect-ratio: 2 / 3;
  border-radius: var(--ui-radius);
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
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

.state-icon { color: var(--ui-on-primary); }
.state-title { font-size: 1.4rem; font-weight: 600; color: var(--ui-text); margin: 0; }
.state-desc  { color: var(--ui-muted); font-size: 1rem; margin: 0; max-width: 400px; }

.retry-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 10px 24px;
  border-radius: var(--ui-radius);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 8px;
}
.retry-btn:hover { background: var(--ui-primary); color: var(--ui-on-primary); }
</style>
