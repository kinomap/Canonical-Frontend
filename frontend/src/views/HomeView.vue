<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted } from 'vue'
import { apiClient } from '@/api/client'
import type { HomeCollections, MovieSummary } from '@/types/movie'
import HeroBanner from '@/components/HeroBanner.vue'
import MovieRail from '@/components/MovieRail.vue'
import PlayNoticeModal from '@/components/PlayNoticeModal.vue'

const collections = ref<HomeCollections | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const showPlayNotice = ref(false)

async function loadHome() {
  loading.value = true
  error.value = null
  try {
    collections.value = await apiClient.getHomeCollections()
  } catch (err: any) {
    console.error('Home API Error:', err)
    error.value = 'Не удалось загрузить каталог'
  } finally {
    loading.value = false
  }
}

function handlePlayNotice() {
  showPlayNotice.value = true
}

onMounted(() => {
  loadHome()
})
</script>

<template>
  <div class="home-page">
    <!-- Loading State -->
    <div v-if="loading" class="home-loading">
      <div class="hero-skeleton"></div>
      <div class="rail-skeleton-title"></div>
      <div class="rail-skeleton-cards">
        <div v-for="i in 5" :key="i" class="card-skeleton"></div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="home-error">
      <div class="error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2>{{ t("Не удалось загрузить каталог") }}</h2>
      <p>{{ t("Пожалуйста, проверьте подключение и попробуйте снова.") }}</p>
      <button class="retry-btn" @click="loadHome">{{ t("Повторить попытку") }}</button>
    </div>

    <!-- Home Content -->
    <div v-else-if="collections" class="home-content">
      <!-- Hero Featured Movie -->
      <HeroBanner
        v-if="collections.hero"
        :movie="collections.hero"
        @play="handlePlayNotice"
      />

      <!-- Horizontal Rails -->
      <MovieRail
        :title="t('Популярное')"
        :movies="collections.popular"
        view-all-link="/movies?sort=popular"
        @play="handlePlayNotice"
      />

      <MovieRail
        :title="t('Новые фильмы')"
        :movies="collections.newest"
        view-all-link="/movies?sort=newest"
        @play="handlePlayNotice"
      />

      <MovieRail
        :title="t('Лучший рейтинг')"
        :movies="collections.top_rated"
        view-all-link="/movies?sort=rating_desc"
        @play="handlePlayNotice"
      />

      <!-- Year Collections -->
      <template v-if="collections.by_year && collections.by_year.length">
        <MovieRail
          v-for="yearItem in collections.by_year"
          :key="yearItem.year"
          :title="`Фильмы ${yearItem.year} года`"
          :movies="yearItem.movies"
          :view-all-link="`/movies?year=${yearItem.year}`"
          @play="handlePlayNotice"
        />
      </template>

      <!-- Genre Collections -->
      <template v-if="collections.by_genre && collections.by_genre.length">
        <MovieRail
          v-for="genreItem in collections.by_genre"
          :key="genreItem.genre.id"
          :title="genreItem.genre.name"
          :movies="genreItem.movies"
          :view-all-link="`/movies?genre=${genreItem.genre.slug}`"
          @play="handlePlayNotice"
        />
      </template>
    </div>

    <!-- Play Notice Modal -->
    <PlayNoticeModal :show="showPlayNotice" @close="showPlayNotice = false" />
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 64px 16px;
  width: 100%;
}

.home-loading {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero-skeleton {
  height: 380px;
  border-radius: var(--ui-radius-panel);
  background: var(--ui-raised);
}

.rail-skeleton-title {
  height: 24px;
  width: 180px;
  border-radius: var(--ui-radius);
  background: var(--ui-raised);
}

.rail-skeleton-cards {
  display: flex;
  gap: 16px;
}

.card-skeleton {
  flex: 0 0 180px;
  aspect-ratio: 2 / 3;
  border-radius: var(--ui-radius);
  background: var(--ui-raised);
}

.home-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  text-align: center;
  background: var(--ui-raised);
  border-radius: var(--ui-radius-panel);
  border: 1px solid var(--ui-border);
}

.error-icon {
  color: var(--ui-danger);
  margin-bottom: 16px;
}

.home-error h2 {
  font-size: 1.3rem;
  color: var(--ui-text);
  margin: 0 0 8px 0;
}

.home-error p {
  color: var(--ui-secondary);
  margin: 0 0 20px 0;
}

.retry-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 8px 24px;
  border-radius: var(--ui-radius);
  font-weight: 600;
  cursor: pointer;
}
</style>
