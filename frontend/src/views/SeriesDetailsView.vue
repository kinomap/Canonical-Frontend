<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient, ApiError } from '@/api/client'
import type { SeriesDetail, SeriesSeason, SeriesEpisode } from '@/types/movie'
import { useAuthStore } from '@/stores/auth'
import VideoPlayer from '@/components/VideoPlayer.vue'
import ReactionsBlock from '@/components/ReactionsBlock.vue'
import CommentsBlock from '@/components/CommentsBlock.vue'
import { Play } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { user: currentUser, isAuthenticated, token, fetchCurrentUser } = useAuthStore()

const seriesId = computed(() => route.params.id as string)

const series = ref<SeriesDetail | null>(null)
const selectedSeason = ref<SeriesSeason | null>(null)
const selectedEpisode = ref<SeriesEpisode | null>(null)
const streamUrl = ref<string | null>(null)
const trafficId = ref('')
const shouldPlay = ref(false)

const loading = ref(true)
const error = ref<string | null>(null)
const isNotFound = ref(false)
const descriptionExpanded = ref(false)
const playError = ref<string | null>(null)

const playingEpisodeTitle = computed(() => {
  if (!selectedSeason.value || !selectedEpisode.value) return ''
  const sNum = selectedSeason.value.season_number
  const epNum = selectedEpisode.value.episode_number
  const titleStr = selectedEpisode.value.title || `${epNum} серия`
  const sStr = sNum < 10 ? `0${sNum}` : `${sNum}`
  const epStr = epNum < 10 ? `0${epNum}` : `${epNum}`
  return `S${sStr}E${epStr} — ${titleStr}`
})

const formattedFileSize = computed(() => {
  if (!selectedEpisode.value?.file_size) return null
  const bytes = selectedEpisode.value.file_size
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(0)} KB`
})

function isEpisodePlayable(ep: SeriesEpisode): boolean {
  if (ep.is_playable !== undefined) return ep.is_playable
  return ep.file_size !== null && ep.file_size > 0
}

async function preparePlaybackToken(episodeId: string) {
  try {
    const res = await apiClient.startSeriesPlayback(episodeId)
      trafficId.value = res.traffic_id || ''
    if (res.media_url) {
      streamUrl.value = res.media_url
    } else {
      const base = res.media_endpoint || ''
      streamUrl.value = `${base}?token=${res.playback_token}`
    }
  } catch (err) {
    console.error('Prefetch series playback failed', err)
  }
}

async function fetchData() {
  loading.value = true
  error.value = null
  isNotFound.value = false

  try {
    const seriesData = await apiClient.getSeriesDetail(seriesId.value)
    series.value = seriesData

    if (seriesData.seasons && seriesData.seasons.length > 0) {
      // Determine initial season from query parameter or default to first season
      const qSeason = route.query.season ? Number(route.query.season) : null
      let initialSeason = seriesData.seasons.find((s) => s.season_number === qSeason)
      if (!initialSeason) {
        initialSeason = seriesData.seasons[0]
      }
      selectedSeason.value = initialSeason

      // Determine initial episode from query parameter or default to first episode
      const qEpisode = route.query.episode ? Number(route.query.episode) : null
      let initialEpisode = initialSeason.episodes.find((e) => e.episode_number === qEpisode)
      if (!initialEpisode) {
        initialEpisode = initialSeason.episodes[0] || null
      }
      selectedEpisode.value = initialEpisode

      syncQueryParams()

      if (isAuthenticated.value && initialEpisode && isEpisodePlayable(initialEpisode)) {
        preparePlaybackToken(initialEpisode.id)
      }
    }
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 404) {
      isNotFound.value = true
    } else {
      error.value = err?.message || 'Failed to load series details'
    }
  } finally {
    loading.value = false
  }
}

async function handlePlay() {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  if (!selectedEpisode.value) return
  if (!isEpisodePlayable(selectedEpisode.value)) {
    playError.value = 'Серия недоступна для воспроизведения'
    return
  }

  playError.value = null
  shouldPlay.value = true

  if (!streamUrl.value) {
    try {
      const res = await apiClient.startSeriesPlayback(selectedEpisode.value.id)
      trafficId.value = res.traffic_id || ''
      if (res.media_url) {
        streamUrl.value = res.media_url
      } else {
        throw new Error('No media_url returned from backend')
      }
    } catch (err: any) {
      if (err?.status !== 401) {
        playError.value = err?.message || 'Failed to start playback'
      }
      shouldPlay.value = false
    }
  }
}

async function startEpisodePlayback(episodeId: string) {
  playError.value = null
  try {
    const res = await apiClient.startSeriesPlayback(episodeId)
      trafficId.value = res.traffic_id || ''
    if (res.media_url) {
      streamUrl.value = res.media_url
    } else {
      throw new Error('No media_url returned from backend')
    }
  } catch (err: any) {
    if (err?.status !== 401) {
      playError.value = err?.message || 'Failed to start playback'
    }
  }
}

function selectSeason(season: SeriesSeason) {
  if (selectedSeason.value?.id === season.id) return
  selectedSeason.value = season

  const firstEp = season.episodes && season.episodes.length > 0 ? season.episodes[0] : null
  selectedEpisode.value = firstEp

  syncQueryParams()
  streamUrl.value = null

  if (firstEp && isEpisodePlayable(firstEp)) {
    if (shouldPlay.value) {
      startEpisodePlayback(firstEp.id)
    } else if (isAuthenticated.value) {
      preparePlaybackToken(firstEp.id)
    }
  }
}

function selectEpisode(episode: SeriesEpisode) {
  if (selectedEpisode.value?.id === episode.id) return
  if (!isEpisodePlayable(episode)) return

  selectedEpisode.value = episode
  syncQueryParams()
  streamUrl.value = null

  if (shouldPlay.value) {
    startEpisodePlayback(episode.id)
  } else if (isAuthenticated.value) {
    preparePlaybackToken(episode.id)
  }
}

function syncQueryParams() {
  if (selectedSeason.value && selectedEpisode.value) {
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        season: selectedSeason.value.season_number,
        episode: selectedEpisode.value.episode_number,
      },
    })
  }
}

onMounted(() => {
  if (!currentUser.value && token.value) {
    fetchCurrentUser()
  }
  fetchData()
})
</script>

<template>
  <div class="series-details-page">
    <nav class="details-nav">
      <router-link to="/series" class="back-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg> {{ t("Back to Series Catalog") }} </router-link>
    </nav>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="yt-layout skeleton-layout">
      <div class="player-container player-skeleton"></div>
      <div class="main-content">
        <div class="title-skeleton"></div>
        <div class="reactions-skeleton"></div>
        <div class="desc-skeleton"></div>
      </div>
    </div>

    <!-- 404 Not Found -->
    <div v-else-if="isNotFound" class="details-state not-found-state">
      <div class="state-icon text-amber">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m15 9-6 6"/>
          <path d="m9 9 6 6"/>
        </svg>
      </div>
      <h2>{{ t("Series Not Found") }}</h2>
      <p>{{ t("The requested series does not exist or has been removed.") }}</p>
      <router-link to="/series" class="nav-btn">{{ t("Return to Catalog") }}</router-link>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="details-state error-state">
      <div class="state-icon text-red">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2>{{ t("Error Loading Details") }}</h2>
      <p>{{ error }}</p>
      <button class="nav-btn" @click="fetchData">{{ t("Retry") }}</button>
    </div>

    <!-- Main Series View -->
    <div v-else-if="series" class="yt-layout">
      <!-- Player Section at Top -->
      <div class="player-wrapper">
        <div v-if="!shouldPlay" class="player-container" @click="handlePlay">
          <div class="player-splash" :style="{ backgroundImage: `url(${series.backdrop_url || series.poster_url})` }">
            <div class="player-overlay">
              <div class="splash-info" v-if="playingEpisodeTitle">
                <span class="playing-badge">{{ playingEpisodeTitle }}</span>
              </div>
              <div class="play-circle">
                <Play :size="48" fill="currentColor" class="play-icon" />
              </div>
            </div>
          </div>
        </div>

        <VideoPlayer :traffic-id="trafficId" :target-id="isAuthenticated?selectedEpisode?.id:undefined" target-type="episode"
          v-show="shouldPlay" :requested="shouldPlay"
          :src="streamUrl||''"
          :poster="series.backdrop_url || series.poster_url || undefined"
          :title="series.title + ' — ' + playingEpisodeTitle"
        />

        <div v-if="playError" class="inline-error" role="alert">
          <span>{{ playError }}</span>
          <button class="inline-error-close" @click="playError = null" :aria-label="t('Dismiss')">&times;</button>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Title & Reactions -->
        <div class="header-content">
          <h1 class="series-title">{{ series.title }}</h1>
          <ReactionsBlock :target-id="seriesId" target-type="series" />
        </div>

        <!-- Description Box -->
        <div
          class="description-box"
          :class="{ expanded: descriptionExpanded }"
          @click="descriptionExpanded = !descriptionExpanded"
        >
          <div class="desc-stats">
            <span class="stat-badge" v-if="series.rating">{{ series.rating.toFixed(1) }} ⭐</span>
            <span class="stat-text" v-if="series.year">{{ series.year }}</span>
            <span class="stat-text" v-if="selectedEpisode?.episode_number">
              {{ playingEpisodeTitle }}
            </span>
            <span class="stat-text" v-if="formattedFileSize">{{ formattedFileSize }}</span>
          </div>

          <div class="desc-genres" v-if="series.genres?.length">
            <span v-for="g in series.genres" :key="g.id" class="desc-genre">#{{ g.slug || g.name.toLowerCase() }}</span>
          </div>

          <div class="desc-text">
            {{ series.overview || 'No description provided.' }}
          </div>

          <button class="expand-btn" @click.stop="descriptionExpanded = !descriptionExpanded">
            {{ descriptionExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Compact Season & Episode Navigation -->
        <div class="navigation-section" v-if="series.seasons && series.seasons.length > 0">
          <!-- Season Selector -->
          <div class="selector-block">
            <div class="selector-label">{{ t("SEASONS") }}</div>
            <div class="seasons-row" role="tablist" :aria-label="t('Seasons')">
              <button
                v-for="s in series.seasons"
                :key="s.id"
                class="season-btn"
                :class="{ active: selectedSeason?.id === s.id }"
                role="tab"
                :aria-selected="selectedSeason?.id === s.id"
                @click="selectSeason(s)"
              > {{ t("Season") }} {{ s.season_number }}
              </button>
            </div>
          </div>

          <!-- Episode Selector -->
          <div class="selector-block" v-if="selectedSeason">
            <div class="selector-label">{{ t("EPISODES") }}</div>
            <div
              v-if="!selectedSeason.episodes || selectedSeason.episodes.length === 0"
              class="no-episodes-text"
            > {{ t("No episodes in this season.") }} </div>
            <div v-else class="episodes-row" role="tablist" :aria-label="t('Episodes')">
              <button
                v-for="ep in selectedSeason.episodes"
                :key="ep.id"
                class="episode-btn"
                :class="{
                  active: selectedEpisode?.id === ep.id,
                  disabled: !isEpisodePlayable(ep)
                }"
                :disabled="!isEpisodePlayable(ep)"
                role="tab"
                :aria-selected="selectedEpisode?.id === ep.id"
                @click="selectEpisode(ep)"
              >
                {{ ep.episode_number }} {{ t("серия") }} </button>
            </div>
          </div>
        </div>

        <!-- Comments Section -->
        <div class="comments-row">
          <CommentsBlock :target-id="seriesId" target-type="series" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.series-details-page {
  width: 100%;
  max-width: var(--page-frame-max);
  margin: 0 auto;
  padding: var(--page-frame-top) var(--page-frame-gutter) 64px;
  box-sizing: border-box;
}

.details-nav {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-secondary);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: color 0.15s ease;
}

.back-link:hover {
  color: var(--ui-text);
}

.yt-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
  margin: 0 auto;
}

/* Player */
.player-wrapper {
  width: 100%;
}

.player-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--ui-bg);
  border-radius: var(--ui-radius);
  overflow: hidden;
  cursor: pointer;
  position: relative;
  box-shadow: none;
}

.player-splash {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  transition: transform 0.3s ease;
}

.player-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background 0.3s ease;
  padding: 24px;
}

.player-container:hover .player-overlay {
  background: rgba(0, 0, 0, 0.2);
}

.player-container:hover .player-splash {
  transform: scale(1.02);
}

.splash-info {
  position: absolute;
  top: 16px;
  left: 16px;
}

.playing-badge {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: none;
  color: var(--ui-text);
  padding: 6px 12px;
  border-radius: var(--ui-radius);
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid var(--ui-border);
}

.play-circle {
  width: 80px;
  height: 80px;
  background: var(--ui-raised);
  backdrop-filter: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: transform 0.2s ease, background 0.2s ease;
}

.player-container:hover .play-circle {
  background: var(--ui-raised);
  transform: scale(1.1);
}

.play-icon {
  margin-left: 6px;
}

/* Main Content */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.series-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}

/* Description Box */
.description-box {
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  margin-bottom: 8px;
}

.description-box:hover {
  background: var(--ui-raised);
}

.desc-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ui-text);
  flex-wrap: wrap;
}

.stat-badge {
  color: var(--ui-warning);
}

.stat-text {
  color: var(--ui-text);
}

.desc-genres {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.desc-genre {
  color: var(--ui-link);
  font-size: 0.9rem;
}

.desc-text {
  color: var(--ui-secondary);
  line-height: 1.5;
  font-size: 0.95rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.description-box.expanded .desc-text {
  -webkit-line-clamp: unset;
}

.expand-btn {
  background: transparent;
  border: none;
  color: var(--ui-secondary);
  font-weight: 600;
  padding: 0;
  margin-top: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

.expand-btn:hover {
  color: var(--ui-text);
}

/* Compact Navigation Section */
.navigation-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-border);
  padding: 20px;
}

.selector-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selector-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ui-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.seasons-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.season-btn {
  padding: 8px 16px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-secondary);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.season-btn:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.season-btn.active {
  background: var(--ui-primary);
  border-color: var(--ui-control);
  color: var(--ui-on-primary);
  box-shadow: 0 4px 12px var(--ui-border);
}

.episodes-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.episode-btn {
  padding: 8px 14px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-weight: 500;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.episode-btn:hover:not(.disabled) {
  background: var(--ui-raised);
  color: var(--ui-text);
  border-color: var(--ui-border);
}

.episode-btn.active {
  background: var(--ui-primary);
  border-color: var(--ui-control);
  color: var(--ui-on-primary);
  font-weight: 600;
  box-shadow: 0 4px 12px var(--ui-border);
}

.episode-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--ui-raised);
  border-color: var(--ui-border);
  color: var(--ui-muted);
}

.no-episodes-text {
  color: var(--ui-secondary);
  font-size: 0.9rem;
  font-style: italic;
}

/* Comments */
.comments-row {
  margin-top: 16px;
  border-top: 1px solid var(--ui-border);
  padding-top: 24px;
}

/* Common states */
.details-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  text-align: center;
  background: var(--ui-raised);
  border-radius: var(--ui-radius-panel);
  border: 1px solid var(--ui-border);
  color: var(--ui-secondary);
}

.nav-btn {
  display: inline-block;
  padding: 8px 20px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  border-radius: var(--ui-radius);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  margin-top: 16px;
}

/* Skeleton */
.skeleton-layout {
  opacity: 0.85;
}

.player-skeleton {
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  cursor: default;
}

.title-skeleton {
  height: 32px;
  width: 60%;
  max-width: 450px;
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  margin-bottom: 16px;
}

.reactions-skeleton {
  height: 36px;
  width: 240px;
  border-radius: var(--ui-radius-panel);
  background: var(--ui-raised);
  margin-bottom: 20px;
}

.desc-skeleton {
  height: 100px;
  width: 100%;
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Inline error */
.inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--ui-danger);
  padding: 10px 14px;
  border-radius: var(--ui-radius);
  font-size: 0.9rem;
  margin-top: 10px;
  animation: fadeIn 0.2s ease;
}

.inline-error-close {
  background: transparent;
  border: none;
  color: var(--ui-danger);
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}

.inline-error-close:hover {
  color: var(--ui-text);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
