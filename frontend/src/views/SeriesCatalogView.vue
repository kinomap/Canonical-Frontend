<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '@/api/client'
import type { Genre, MovieFilters, MovieSummary, SeriesSummary } from '@/types/movie'
import MovieCard from '@/components/MovieCard.vue'
import PlayNoticeModal from '@/components/PlayNoticeModal.vue'
import { AlertCircle, SearchX } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const seriesList = ref<MovieSummary[]>([])
const genres = ref<Genre[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const selectedGenre = ref<string>((route.query.genre as string) || '')
const selectedYear = ref<string>((route.query.year as string) || '')
const selectedMinRating = ref<string>((route.query.min_rating as string) || '')
const selectedSort = ref<string>((route.query.sort as string) || 'newest')
const searchQuery = ref<string>((route.query.q as string) || '')

const loading = ref(true)
const error = ref<string | null>(null)
const showPlayNotice = ref(false)

const totalPages = computed(() => {
  return Math.ceil(total.value / pageSize.value) || 1
})

async function fetchGenres() {
  try {
    genres.value = await apiClient.listGenres()
  } catch (err) {
    console.error('Failed to load genres', err)
  }
}

let abortController: AbortController | null = null

async function loadSeries() {
  if (abortController) {
    abortController.abort()
  }
  abortController = new AbortController()
  const signal = abortController.signal

  loading.value = true
  error.value = null
  try {
    if (searchQuery.value.trim().length > 0) {
      const items = await apiClient.searchSeries(searchQuery.value.trim(), pageSize.value, signal)
      seriesList.value = items.map((s: SeriesSummary) => ({
        id: s.id,
        type: 'series',
        title: s.title,
        original_title: s.original_title || '',
        year: s.year,
        poster: s.poster_url,
        rating: s.rating,
        runtime: null,
        quality: null,
        status: 'available',
        genres: s.genres || [],
      }))
      total.value = items.length
    } else {
      const filters: MovieFilters = {
        page: page.value,
        page_size: pageSize.value,
        genre: selectedGenre.value || undefined,
        year: selectedYear.value ? parseInt(selectedYear.value, 10) : undefined,
        min_rating: selectedMinRating.value ? parseFloat(selectedMinRating.value) : undefined,
        sort: selectedSort.value || undefined,
      }
      const res = await apiClient.listSeries(filters, signal)
      seriesList.value = res.items.map((s: SeriesSummary) => ({
        id: s.id,
        type: 'series',
        title: s.title,
        original_title: s.original_title || '',
        year: s.year,
        poster: s.poster_url,
        rating: s.rating,
        runtime: null,
        quality: null,
        status: 'available',
        genres: s.genres || [],
      }))
      total.value = res.total
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return
    console.error('Series Catalog API Error:', err)
    error.value = 'Не удалось загрузить каталог сериалов'
  } finally {
    if (!abortController?.signal.aborted) {
      loading.value = false
    }
  }
}

function updateQueryParams() {
  const query: Record<string, string> = {}
  if (searchQuery.value) query.q = searchQuery.value
  if (selectedGenre.value) query.genre = selectedGenre.value
  if (selectedYear.value) query.year = selectedYear.value
  if (selectedMinRating.value) query.min_rating = selectedMinRating.value
  if (selectedSort.value && selectedSort.value !== 'newest') query.sort = selectedSort.value
  if (page.value > 1) query.page = page.value.toString()

  router.replace({ query })
}

function clearAllFilters() {
  selectedGenre.value = ''
  selectedYear.value = ''
  selectedMinRating.value = ''
  selectedSort.value = 'newest'
  searchQuery.value = ''
  page.value = 1
  router.replace({ query: {} })
  loadSeries()
}

function changePage(newPage: number) {
  if (newPage >= 1 && newPage <= totalPages.value) {
    page.value = newPage
    updateQueryParams()
    loadSeries()
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {}
  }
}

function handlePlayNotice() {
  showPlayNotice.value = true
}

watch(
  () => route.query,
  (newQuery) => {
    selectedGenre.value = (newQuery.genre as string) || ''
    selectedYear.value = (newQuery.year as string) || ''
    selectedMinRating.value = (newQuery.min_rating as string) || ''
    selectedSort.value = (newQuery.sort as string) || 'newest'
    searchQuery.value = (newQuery.q as string) || ''
    if (newQuery.page) page.value = parseInt(newQuery.page as string, 10) || 1
    loadSeries()
  }
)

onMounted(() => {
  fetchGenres()
  loadSeries()
})
</script>

<template>
  <div class="catalog-page">
    <div class="catalog-title-bar">
      <h1 class="page-title">
        <span v-if="searchQuery">{{ t("Поиск по сериалам \"") }}{{ searchQuery }}"</span>
        <span v-else-if="selectedGenre">{{ t("Сериалы:") }} {{ selectedGenre }}</span>
        <span v-else>{{ t("Каталог сериалов") }}</span>
      </h1>
      <span class="catalog-count">{{ total }} {{ t("доступно") }}</span>
    </div>

    <!-- Main Content -->
    <main class="catalog-content">
      <!-- Loading Skeletons -->
      <div v-if="loading" class="movie-grid skeleton-grid">
        <div v-for="i in 8" :key="i" class="skeleton-card">
          <div class="skeleton-poster"></div>
          <div class="skeleton-text line-1"></div>
          <div class="skeleton-text line-2"></div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="state-container error-state">
        <div class="state-icon text-red">
          <AlertCircle :size="48" stroke-width="2" />
        </div>
        <h2>{{ t("Не удалось загрузить каталог сериалов") }}</h2>
        <p>{{ t("Пожалуйста, проверьте подключение к сети и попробуйте снова.") }}</p>
        <button class="retry-btn" @click="loadSeries">{{ t("Повторить попытку") }}</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="seriesList.length === 0" class="state-container empty-state">
        <div class="state-icon">
          <SearchX :size="48" stroke-width="1.5" />
        </div>
        <h2>{{ t("Сериалы не найдены") }}</h2>
        <p v-if="searchQuery">{{ t("По запросу \"") }}{{ searchQuery }}{{ t("\" сериалов не найдено.") }}</p>
        <p v-else>{{ t("Нет сериалов, соответствующих выбранным фильтрам.") }}</p>
        <button class="retry-btn" @click="clearAllFilters">{{ t("Сбросить фильтры") }}</button>
      </div>

      <!-- Series Grid -->
      <div v-else class="movie-grid">
        <MovieCard
          v-for="series in seriesList"
          :key="series.id"
          :movie="series"
          @play="handlePlayNotice"
        />
      </div>

      <!-- Pagination Controls -->
      <div v-if="!loading && !error && seriesList.length > 0 && totalPages > 1" class="pagination">
        <button
          class="page-btn"
          :disabled="page <= 1"
          @click="changePage(page - 1)"
        > {{ t("Назад") }} </button>
        <span class="page-info">{{ t("Страница") }} {{ page }} {{ t("из") }} {{ totalPages }}</span>
        <button
          class="page-btn"
          :disabled="page >= totalPages"
          @click="changePage(page + 1)"
        > {{ t("Вперёд") }} </button>
      </div>
    </main>

    <!-- Play Notice Modal -->
    <PlayNoticeModal :show="showPlayNotice" @close="showPlayNotice = false" />
  </div>
</template>

<style scoped>
.catalog-page {
  max-width: var(--page-frame-max);
  margin: 0 auto;
  padding: var(--page-frame-top) var(--page-frame-gutter) 64px;
  width: 100%;
  box-sizing: border-box;
}

.catalog-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}

.page-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--ui-text);
  margin: 0;
  letter-spacing: -0.5px;
}

.catalog-count {
  font-size: 0.9rem;
  color: var(--ui-secondary);
}

.movie-grid {
  display: grid;
  grid-template-columns: repeat(var(--poster-columns), minmax(0, 1fr));
  gap: var(--poster-gap);
}



.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 16px;
  text-align: center;
  background: var(--ui-raised);
  border-radius: var(--ui-radius-panel);
  border: 1px solid var(--ui-border);
  margin: 24px 0;
}

.state-icon {
  color: var(--ui-muted);
  margin-bottom: 16px;
}

.text-red {
  color: var(--ui-danger);
}

.state-container h2 {
  font-size: 1.25rem;
  color: var(--ui-text);
  margin: 0 0 8px 0;
}

.state-container p {
  color: var(--ui-secondary);
  font-size: 0.95rem;
  margin: 0 0 16px 0;
}

.retry-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 8px 20px;
  border-radius: var(--ui-radius);
  font-weight: 600;
  cursor: pointer;
}

.skeleton-card {
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-poster {
  aspect-ratio: 2 / 3;
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
}

.skeleton-text {
  height: 14px;
  background: var(--ui-raised);
  border-radius: 4px;
}

.skeleton-text.line-1 {
  width: 80%;
}

.skeleton-text.line-2 {
  width: 50%;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 40px;
}

.page-btn {
  padding: 8px 18px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
  border-radius: var(--ui-radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.9rem;
  color: var(--ui-secondary);
}
</style>
