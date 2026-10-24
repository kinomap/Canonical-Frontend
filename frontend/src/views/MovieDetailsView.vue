<script setup lang="ts">
import { t } from '@/i18n'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { listingHistoryBack, returnToListing } from '@/router/catalogNavigation'
import { apiClient, ApiError } from '@/api/client'
import type { AudioTrack, MovieDetail } from '@/types/movie'
import type { Comment, MovieReaction } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import AudioTracksList from '@/components/AudioTracksList.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import ReactionsBlock from '@/components/ReactionsBlock.vue'
import CommentsBlock from '@/components/CommentsBlock.vue'
import { Play } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const backTarget = computed(() => {
  void route.fullPath
  return listingHistoryBack(window.history.state?.back) || '/movies'
})
const { user: currentUser, isAuthenticated, token, fetchCurrentUser } = useAuthStore()

const movieId = computed(() => route.params.id as string)

const movie = ref<MovieDetail | null>(null)
const audioTracks = ref<AudioTrack[] | null>(null)
const streamUrl = ref<string | null>(null)
const trafficId = ref('')
const shouldPlay = ref(false)
const playbackStarting = ref(false)

const loading = ref(true)
const error = ref<string | null>(null)
const isNotFound = ref(false)
const descriptionExpanded = ref(false)
const playError = ref<string | null>(null)   // inline error under the player
const commentError = ref<string | null>(null) // inline error in comments section


const formattedFileSize = computed(() => {
  if (!movie.value?.file_size) return null
  const bytes = movie.value.file_size
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(0)} KB`
})

const formattedRuntime = computed(() => {
  if (!movie.value?.runtime) return null
  const hrs = Math.floor(movie.value.runtime / 60)
  const mins = movie.value.runtime % 60
  if (hrs > 0) {
    return `${hrs}h ${mins}m`
  }
  return `${mins} min`
})

async function fetchData() {
  loading.value = true
  error.value = null
  isNotFound.value = false

  try {
    const movieData = await apiClient.getMovie(movieId.value)
    movie.value = movieData

    // Fetch audio tracks
    try {
      audioTracks.value = await apiClient.getAudioTracks(movieId.value)
    } catch (e) {
      console.warn("Could not load audio tracks", e)
    }

    // NOTE: playback is deliberately NOT pre-started here.
    // POST /playback/start opens a session that holds Media Node capacity, so
    // starting it on page load created a live session for every visitor who
    // never pressed Play - sessions nobody could ever stop. The session is now
    // opened only in handlePlay(), when the user actually starts watching.

  } catch (err: any) {
    if (err instanceof ApiError && err.status === 404) {
      isNotFound.value = true
    } else {
      error.value = err?.message || 'Failed to load movie details'
    }
  } finally {
    loading.value = false
  }
}

async function handlePlay() {
  if (playbackStarting.value) return
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  playError.value = null
  if (streamUrl.value) {
    shouldPlay.value = true
    return
  }
  playbackStarting.value = true
  // Mount the ad player now; resolve the main stream in parallel.
  shouldPlay.value = true
  if (!streamUrl.value) {
    try {
      const res = await apiClient.startPlayback(movieId.value)
      trafficId.value = res.traffic_id || ''
      // Use media_url directly (points to Media Worker)
      if (!res.media_url) {
        throw new Error('No media_url returned from backend')
      }
      streamUrl.value = res.media_url
      beginSessionLease(res.session_id, res.heartbeat_interval_seconds)
      // Keep the splash mounted until a usable URL is ready: no empty player gap.
      shouldPlay.value = true
    } catch (err: any) {
      // 401 is handled globally by auth:expired → no duplicate message
      if (err?.status !== 401) {
        playError.value = err?.message || 'Failed to start playback'
      }
      shouldPlay.value = false
    } finally {
      playbackStarting.value = false
    }
  }
}

// ── Playback session lease ────────────────────────────────────────────
// A live session occupies Media Node capacity and blocks node removal, so the
// player must renew it while watching and release it the moment watching ends.
// Every exit path is covered: finished video, leaving the page, closing the
// tab. If all of them fail (crash, network loss) the backend lease simply
// lapses - the backend never depends on this goodbye message.

const playbackSessionId = ref<string | null>(null)
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function beginSessionLease(sessionId: string, intervalSeconds?: number) {
  endSessionLease()
  playbackSessionId.value = sessionId
  const periodMs = Math.max((intervalSeconds ?? 30), 5) * 1000
  heartbeatTimer = setInterval(() => {
    const id = playbackSessionId.value
    if (!id) return
    apiClient.heartbeatPlayback(id)
      .then(res => { if (!res.ok) endSessionLease() })
      .catch(() => { /* transient failure: the lease window absorbs it */ })
  }, periodMs)
}

function endSessionLease() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/** Release the session. Idempotent on the backend, so duplicates are safe. */
function releasePlaybackSession(opts: { keepalive?: boolean } = {}) {
  const id = playbackSessionId.value
  endSessionLease()
  if (!id) return
  playbackSessionId.value = null
  apiClient.stopPlayback(id, opts).catch(() => { /* lease expiry is the fallback */ })
}

function handlePlaybackEnded() {
  releasePlaybackSession()
}

// Tab closed, navigated away or backgrounded by a mobile OS. `pagehide` fires
// in cases where `beforeunload` does not (notably iOS Safari / bfcache).
function handlePageHide() {
  releasePlaybackSession({ keepalive: true })
}

onMounted(() => {
  window.addEventListener('pagehide', handlePageHide)
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', handlePageHide)
  releasePlaybackSession({ keepalive: true })
})

onBeforeRouteLeave(() => {
  releasePlaybackSession()
})

// Reactions and comments logic is now handled by components
onMounted(() => {
  if (!currentUser.value && token.value) {
    fetchCurrentUser()
  }
  fetchData()
})
</script>

<template>
  <div class="movie-details-page">
    <nav class="details-nav">
      <a :href="backTarget" class="back-link" @click="returnToListing(router, $event)">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg> {{ t("Back to Catalog") }} </a>
    </nav>

    <!-- Loading Skeleton (matches exact YouTube layout to avoid UI flash) -->
    <div v-if="loading" class="yt-layout skeleton-layout">
      <div class="player-container player-skeleton"></div>
      <div class="main-content">
        <div class="title-skeleton"></div>
        <div class="reactions-skeleton"></div>
        <div class="desc-skeleton"></div>
      </div>
    </div>

    <!-- 404 Not Found State -->
    <div v-else-if="isNotFound" class="details-state not-found-state">
      <div class="state-icon text-amber">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m15 9-6 6"/>
          <path d="m9 9 6 6"/>
        </svg>
      </div>
      <h2>{{ t("Movie Not Found") }}</h2>
      <p>{{ t("The requested movie does not exist or has been removed.") }}</p>
      <router-link to="/" class="nav-btn">{{ t("Return to Catalog") }}</router-link>
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

    <!-- Details View (YouTube-style) -->
    <div v-else-if="movie" class="yt-layout">
      <!-- Player Area -->
      <div v-if="!shouldPlay" class="player-container" :aria-busy="playbackStarting" @click="handlePlay">
        <div class="player-splash" :style="{ backgroundImage: `url(${movie.backdrop || movie.poster})` }">
          <div class="player-overlay">
            <div class="play-circle">
              <Play :size="48" fill="currentColor" class="play-icon" />
            </div>
          </div>
        </div>
      </div>
      <VideoPlayer :traffic-id="trafficId" :target-id="isAuthenticated?movie?.id:undefined" target-type="movie" v-show="shouldPlay" :requested="shouldPlay" :src="streamUrl||''" :poster="movie.backdrop || movie.poster || undefined" :title="movie.title" @ended="handlePlaybackEnded" />
      <!-- Inline player error (non-auth failures only) -->
      <div v-if="playError" class="inline-error" role="alert">
        <span>{{ playError }}</span>
        <button class="inline-error-close" @click="playError = null" :aria-label="t('Dismiss')">&times;</button>
      </div>

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Title & Reactions -->
        <div class="header-content">
          <h1 class="movie-title">{{ movie.title }}</h1>
          <ReactionsBlock :target-id="movieId" target-type="movie" />
        </div>

        <!-- Collapsible Description -->
        <div class="description-box" :class="{ expanded: descriptionExpanded }" @click="descriptionExpanded = !descriptionExpanded">
          <div class="desc-stats">
            <span class="stat-badge">{{ movie.rating?.toFixed(1) || 'N/A' }} ⭐</span>
            <span class="stat-text" v-if="movie.year">{{ movie.year }}</span>
            <span class="stat-text" v-if="formattedRuntime">{{ formattedRuntime }}</span>
            <span class="stat-text" v-if="formattedFileSize">{{ formattedFileSize }}</span>
            <span class="stat-text quality" v-if="movie.quality">{{ movie.quality }}</span>
          </div>
          
          <div class="desc-genres" v-if="movie.genres?.length">
            <span v-for="g in movie.genres" :key="g.id" class="desc-genre">#{{ g.slug }}</span>
          </div>

          <div class="desc-text">
            {{ movie.overview || 'No description provided.' }}
          </div>
          
          <AudioTracksList v-if="descriptionExpanded && audioTracks?.length" :tracks="audioTracks" class="audio-tracks-mt" />

          <button class="expand-btn" @click.stop="descriptionExpanded = !descriptionExpanded">
            {{ descriptionExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Comments Section -->
        <div class="content-row comments-row" v-if="movie">
          <div class="main-column">
            <CommentsBlock :target-id="movieId" target-type="movie" />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.movie-details-page {
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

/* Skeleton layout for seamless zero-flicker loading */
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

/* YouTube Layout */
.yt-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
  margin: 0 auto;
}

/* Player */
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
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s ease;
}

.player-container:hover .player-overlay {
  background: rgba(0, 0, 0, 0.1);
}

.player-container:hover .player-splash {
  transform: scale(1.02);
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
.header-content {
  margin-bottom: 12px;
}

.movie-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 12px 0;
}

.actions-row {
  display: flex;
  margin-bottom: 20px;
}

.reactions-bar {
  display: flex;
  background: transparent;
  border-radius: var(--ui-radius-panel);
  padding: 4px;
  gap: 4px;
}

.reaction-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 8px 14px;
  border-radius: var(--ui-radius-panel);
  cursor: pointer;
  transition: background 0.2s ease;
  color: var(--ui-secondary);
  font-weight: 500;
  font-size: 0.95rem;
}

.reaction-btn:hover {
  background: var(--ui-raised);
}

.reaction-btn.active {
  background: var(--ui-raised);
  color: var(--ui-link);
}

.reaction-emoji {
  font-size: 1.1rem;
}

/* Description Box */
.description-box {
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  margin-bottom: 24px;
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
}

.stat-badge {
  color: var(--ui-warning);
}

.stat-text {
  color: var(--ui-text);
}

.stat-text.quality {
  background: var(--ui-raised);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.desc-genres {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
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

.audio-tracks-mt {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border);
}

/* Comments */
.comments-section {
  margin-top: 24px;
}

.comments-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.login-prompt {
  background: var(--ui-raised);
  padding: 16px;
  border-radius: var(--ui-radius);
  text-align: center;
  color: var(--ui-secondary);
  margin-bottom: 24px;
}

.login-link {
  color: var(--ui-link);
  text-decoration: none;
  font-weight: 600;
}

.comment-input-area {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
}

.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.comment-avatar.me {
  background: var(--ui-danger-bg);
}

.comment-form {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.comment-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-control);
  color: var(--ui-text);
  font-size: 0.95rem;
  padding: 8px 0;
  outline: none;
  transition: border-color 0.2s ease;
}

.comment-input:focus {
  border-bottom-color: var(--ui-border);
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.post-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 8px 16px;
  border-radius: var(--ui-radius-panel);
  font-weight: 600;
  cursor: pointer;
}

.post-btn:hover {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

/* Comments List */
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.comment-item {
  display: flex;
  gap: 16px;
}

.comment-body {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-weight: 600;
  color: var(--ui-text);
  font-size: 0.9rem;
}

.comment-date {
  color: var(--ui-secondary);
  font-size: 0.8rem;
}

.comment-text {
  color: var(--ui-text);
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.comment-admin {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.comment-item:hover .comment-admin {
  opacity: 1;
}

.delete-btn {
  background: transparent;
  border: none;
  color: var(--ui-danger);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

.no-comments {
  text-align: center;
  padding: 40px;
  color: var(--ui-muted);
  font-style: italic;
}

.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-input {
  width: 100%;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  border-radius: 4px;
  padding: 8px;
  color: var(--ui-text);
  font-size: 0.95rem;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.edit-save-btn, .edit-cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.edit-save-btn {
  color: var(--ui-success);
}
.edit-save-btn:hover {
  background: rgba(52, 211, 153, 0.1);
}

.edit-cancel-btn {
  color: var(--ui-danger);
}
.edit-cancel-btn:hover {
  background: rgba(248, 113, 113, 0.1);
}

.edit-btn {
  background: transparent;
  border: none;
  color: var(--ui-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
}
.edit-btn:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

/* Inline error banner (replaces raw alert dialogs) */
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
