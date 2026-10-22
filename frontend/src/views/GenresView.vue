<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient, ApiError } from '@/api/client'
import type { Genre, MovieSummary } from '@/types/movie'
import MovieCard from '@/components/MovieCard.vue'
import PlayNoticeModal from '@/components/PlayNoticeModal.vue'
import { ArrowRight, ArrowLeft, AlertCircle, SearchX } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const genres = ref<Genre[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Genre content state
const selectedGenreSlug = ref<string>((route.query.genre as string) || '')
const genreItems = ref<MovieSummary[]>([])
const total = ref(0)
const page = ref(parseInt((route.query.page as string) || '1', 10) || 1)
const pageSize = ref(20)
const contentLoading = ref(false)
const contentError = ref<string | null>(null)
const showPlayNotice = ref(false)

const totalPages = computed(() => {
  return Math.ceil(total.value / pageSize.value) || 1
})

const activeGenreName = computed(() => {
  if (!selectedGenreSlug.value) return ''
  const g = genres.value.find(item => item.slug === selectedGenreSlug.value)
  if (g) return g.name
  return selectedGenreSlug.value.charAt(0).toUpperCase() + selectedGenreSlug.value.slice(1)
})

async function loadGenres() {
  error.value = null
  loading.value = true
  try {
    genres.value = await apiClient.listGenres()
  } catch (err: any) {
    error.value = err?.message || 'Failed to load genres'
  } finally {
    loading.value = false
  }
}

// Only the latest request may update the grid (fast genre/page switching).
let contentRequestSeq = 0

async function loadGenreContent() {
  if (!selectedGenreSlug.value) return
  const seq = ++contentRequestSeq
  contentLoading.value = true
  contentError.value = null
  try {
    const res = await apiClient.getGenreContent(selectedGenreSlug.value, page.value, pageSize.value)
    if (seq !== contentRequestSeq) return
    genreItems.value = res.items
    total.value = res.total
  } catch (err: any) {
    if (seq !== contentRequestSeq) return
    console.error('Genre Content API Error:', err)
    genreItems.value = []
    total.value = 0
    contentError.value = err instanceof ApiError && err.status === 404
      ? 'Жанр не найден'
      : 'Не удалось загрузить контент жанра'
  } finally {
    if (seq === contentRequestSeq) contentLoading.value = false
  }
}

// Navigation only updates the URL; the route.query watcher performs the single load.
function selectGenre(slug: string) {
  router.push({ query: { genre: slug } })
}

function clearGenreSelection() {
  selectedGenreSlug.value = ''
  genreItems.value = []
  page.value = 1
  router.push({ query: {} })
}

function changePage(newPage: number) {
  if (newPage >= 1 && newPage <= totalPages.value) {
    router.push({ query: { genre: selectedGenreSlug.value, page: newPage.toString() } })
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {}
  }
}

const artworkAliases:Record<string,string>={mystery:'detektiv','televizionnyj-fil-m':'televizionnyj-film',fentezi:'fjentezi'}
function genreArtwork(slug:string){return '/genres/'+(artworkAliases[slug]||slug)+'.jpg'}

function onImageError(e: Event) {
  const target = e.target as HTMLElement;
  target.style.backgroundImage = 'linear-gradient(135deg, #1f2028 0%, #26293a 100%)';
}

watch(
  () => route.query,
  (newQuery) => {
    selectedGenreSlug.value = (newQuery.genre as string) || ''
    page.value = parseInt((newQuery.page as string) || '1', 10) || 1
    if (selectedGenreSlug.value) {
      loadGenreContent()
    }
  }
)

onMounted(async () => {
  await loadGenres()
  if (selectedGenreSlug.value) {
    loadGenreContent()
  }
})
</script>

<template>
  <div class="genres-page">
    <!-- View Mode A: Genre Selected -> Mixed Movies + Series Grid -->
    <div v-if="selectedGenreSlug" class="genre-detail-mode">
      <div class="page-header detail-header">
        <button class="back-btn" @click="clearGenreSelection">
          <ArrowLeft :size="20" /> {{ t("Все жанры") }} </button>
        <div class="title-with-count">
          <h1 class="page-title">{{ activeGenreName }}</h1>
          <span class="genre-count">{{ total }} {{ t("фильма и сериала") }}</span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="contentLoading" class="movie-grid skeleton-grid">
        <div v-for="i in 8" :key="i" class="skeleton-card">
          <div class="skeleton-poster"></div>
          <div class="skeleton-text line-1"></div>
          <div class="skeleton-text line-2"></div>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="contentError" class="state-container error-state">
        <div class="state-icon text-red">
          <AlertCircle :size="48" stroke-width="2" />
        </div>
        <h2>{{ t("Не удалось загрузить контент") }}</h2>
        <p>{{ contentError }}</p>
        <button class="retry-btn" @click="loadGenreContent">{{ t("Повторить") }}</button>
      </div>

      <!-- Empty -->
      <div v-else-if="genreItems.length === 0" class="state-container empty-state">
        <div class="state-icon">
          <SearchX :size="48" stroke-width="1.5" />
        </div>
        <h2>{{ t("В жанре \"") }}{{ activeGenreName }}{{ t("\" контент пока отсутствует") }}</h2>
        <button class="retry-btn" @click="clearGenreSelection">{{ t("Вернуться к жанрам") }}</button>
      </div>

      <!-- Mixed Movies + Series Grid -->
      <div v-else class="movie-grid">
        <MovieCard
          v-for="item in genreItems"
          :key="item.id"
          :movie="item"
          @play="showPlayNotice = true"
        />
      </div>

      <!-- Pagination -->
      <div v-if="!contentLoading && !contentError && genreItems.length > 0 && totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="changePage(page - 1)">{{ t("Назад") }}</button>
        <span class="page-info">{{ t("Страница") }} {{ page }} {{ t("из") }} {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="changePage(page + 1)">{{ t("Вперёд") }}</button>
      </div>
    </div>

    <!-- View Mode B: All Genres Overview Cards Grid -->
    <div v-else class="genres-overview-mode">
      <div class="page-header">
        <h1 class="page-title">{{ t("Жанры") }}</h1>
        <p class="page-subtitle">{{ t("Выберите настроение на вечер (Фильмы и Сериалы)") }}</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="genres-loading">
        <div v-for="i in 12" :key="i" class="genre-card-skeleton"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="genres-error">
        <h2>{{ t("Failed to load genres") }}</h2>
        <p>{{ error }}</p>
        <button class="retry-btn" @click="loadGenres">{{ t("Retry") }}</button>
      </div>

      <!-- Genres Cards Grid -->
      <div v-else-if="genres.length > 0" class="genres-grid">
        <div
          v-for="genre in genres"
          :key="genre.id"
          class="genre-card"
          tabindex="0"
          @click="selectGenre(genre.slug)"
          @keyup.enter="selectGenre(genre.slug)"
        >
          <div 
            class="genre-card-bg"
            :style="{ backgroundImage: `url('${genreArtwork(genre.slug)}')` }"
            @error="onImageError"
          ></div>
          <div class="genre-card-overlay"></div>
          <div class="genre-card-content">
            <h3 class="genre-name">{{ genre.name }}</h3>
            <span class="genre-action"> {{ t("Смотреть") }} <ArrowRight :size="16" stroke-width="2.5" />
            </span>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="genres-empty">
        <p>{{ t("Жанры пока недоступны.") }}</p>
      </div>
    </div>

    <!-- Play Notice Modal -->
    <PlayNoticeModal :show="showPlayNotice" @close="showPlayNotice = false" />
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

.detail-header {
  margin-bottom: 24px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 16px;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.title-with-count {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.genre-count {
  font-size: 0.95rem;
  color: #9ca3af;
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

.movie-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 20px;
}

@media (min-width: 640px) {
  .movie-grid {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  }
}

@media (min-width: 1024px) {
  .movie-grid {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  }
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
  cursor: pointer;
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

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 16px;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin: 24px 0;
}

.state-icon {
  color: #6b7280;
  margin-bottom: 16px;
}

.text-red {
  color: #ef4444;
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

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 40px;
}

.page-btn {
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f3f4f6;
  border-radius: 8px;
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
  color: #9ca3af;
}
</style>
