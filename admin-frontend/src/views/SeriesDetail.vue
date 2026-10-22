<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

const series = ref<any>(null)
const loading = ref(true)
const error = ref('')

const goBack = () => {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/series')
  }
}

const fetchSeriesDetail = async () => {
  loading.value = true
  error.value = ''
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const res = await axios.get(`/api/v1/admin/series/${route.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    series.value = res.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      error.value = err.response?.data?.detail || 'Failed to load series details'
    }
  } finally {
    loading.value = false
  }
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}


onMounted(() => { fetchSeriesDetail() })
</script>

<template>
  <div class="series-detail-page">
    <div class="page-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        Back to Series
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading series detail...</p>
    </div>

    <div v-else-if="error" class="error-msg">
      {{ error }}
    </div>
    
    <template v-else-if="series">
      <div class="detail-header">
        <div class="poster-container">
          <img v-if="series.poster || series.poster_url" :src="series.poster_url || series.poster" class="item-poster" />
          <div v-else class="item-poster-placeholder">
            <span>No poster</span>
          </div>
        </div>
        <div class="info-container">
          <div class="title-bar">
            <h1 class="title">{{ series.title }}</h1>
            <span class="badge" :class="series.is_available ? 'badge-green' : 'badge-red'">
              {{ series.is_available ? 'Available' : 'Unavailable' }}
            </span>
          </div>
          <div class="meta">
            <span v-if="series.year">{{ series.year }}</span>
            <span class="meta-dot" v-if="series.year && series.original_title">•</span>
            <span v-if="series.original_title" class="original-title">{{ series.original_title }}</span>
          </div>
          
          <div class="ids">
            <span class="id-badge">Identity Verified: <span :class="series.identity_verified ? 'text-success' : 'text-warning'">{{ series.identity_verified ? 'YES' : 'NO' }}</span></span>
            <span class="id-badge">Provider: {{ series.tmdb_id ? 'TMDB' : series.kinopoisk_id ? 'Kinopoisk' : series.imdb_id ? 'IMDb' : '—' }}</span>
            <span class="id-badge">TMDB: {{ series.tmdb_id || '—' }}</span>
            <span class="id-badge">Kinopoisk: {{ series.kinopoisk_id || '—' }}</span>
            <span class="id-badge">IMDb: {{ series.imdb_id || '—' }}</span>
          </div>

          <div class="metadata-block">
            <div class="meta-row" v-if="series.rating">
              <span class="meta-label">Rating:</span> {{ series.rating }}
            </div>
            <div class="meta-row" v-if="series.genres && series.genres.length">
              <span class="meta-label">Genres:</span> {{ series.genres.join(', ') }}
            </div>
          </div>

          <p class="overview"><span class="meta-label">Overview:</span><br/>{{ series.overview || 'No overview available.' }}</p>
        </div>
      </div>

      <div class="seasons-section">
        <h2>Seasons & Episodes</h2>
        
        <div v-if="!series.seasons || series.seasons.length === 0" class="empty-state">
          <p>No seasons found.</p>
        </div>
        
        <div v-for="season in series.seasons" :key="season.id" class="season-block">
          <h3>Season {{ season.season_number }}</h3>
          
          <div class="episodes-list">
            <div v-for="episode in season.episodes" :key="episode.id" class="episode-item">
              <div class="episode-header">
                <span class="episode-number">E{{ episode.episode_number }}</span>
                <span class="episode-title" v-if="episode.title">{{ episode.title }}</span>
              </div>
              
              <div class="sources-list" v-if="episode.sources && episode.sources.length > 0">
                <div v-for="source in episode.sources" :key="source.id" class="source-item">
                  <span class="source-channel" title="Channel ID">Channel: {{ source.channel_id }}</span>
                  <span class="source-msg" title="Message ID">Msg #{{ source.message_id }}</span>
                  <span class="source-size">{{ formatBytes(source.file_size) }}</span>
                  <span class="source-status" :class="source.status">{{ source.status }}</span>
                </div>
              </div>
              <div v-else class="no-sources">
                No sources available
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 1.5rem;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.back-btn:hover {
  color: var(--ui-text);
  background: var(--ui-raised);
  border-color: var(--ui-control);
}

.detail-header {
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
  background: var(--ui-raised);
  padding: 2rem;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
}

.poster-container {
  width: 220px;
  flex-shrink: 0;
  aspect-ratio: 2/3;
  background: var(--ui-surface);
  border-radius: var(--ui-radius);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-control);
}

.item-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-poster-placeholder {
  color: var(--ui-link);
  font-size: 0.95rem;
  font-weight: 500;
}

.info-container {
  flex-grow: 1;
}

.title-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.title {
  font-size: 1.8rem;
  margin: 0;
  color: var(--ui-text);
  font-weight: 700;
}

.meta {
  color: var(--ui-link);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.meta-dot {
  margin: 0 0.5rem;
  color: var(--ui-link);
}

.original-title {
  font-style: italic;
}

.ids {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.id-badge {
  background: var(--ui-surface);
  padding: 0.25rem 0.75rem;
  border-radius: var(--ui-radius);
  font-size: 0.8rem;
  color: var(--ui-link);
  border: 1px solid var(--ui-control);
}

.overview {
  line-height: 1.6;
  color: var(--ui-secondary);
  margin-top: 1rem;
}

.metadata-block {
  margin-bottom: 1rem;
}

.meta-row {
  margin-bottom: 0.25rem;
}

.meta-label {
  font-weight: 600;
  color: var(--ui-text);
}

.text-success {
  color: var(--ui-success);
  font-weight: 600;
}

.text-warning {
  color: var(--ui-warning);
  font-weight: 600;
}

.seasons-section {
  background: var(--ui-raised);
  padding: 1.5rem;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
}

.seasons-section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ui-control);
  color: var(--ui-text);
  font-size: 1.3rem;
}

.season-block {
  margin-bottom: 2rem;
}

.season-block h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: var(--ui-link);
  font-size: 1.1rem;
}

.episodes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.episode-item {
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  padding: 1rem;
}

.episode-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.episode-number {
  font-weight: bold;
  background: var(--ui-raised);
  color: var(--ui-link);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.episode-title {
  font-weight: 500;
  color: var(--ui-text);
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
}

.source-channel {
  color: var(--ui-link);
  font-family: monospace;
}

.source-msg {
  color: var(--ui-link);
  font-family: monospace;
}

.source-size {
  color: var(--ui-secondary);
}

.source-status {
  margin-left: auto;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.source-status.available, .source-status.ACTIVE {
  background: rgba(74, 222, 128, 0.2);
  color: var(--ui-success);
}

.no-sources {
  color: var(--ui-link);
  font-size: 0.85rem;
  font-style: italic;
  margin-top: 0.25rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-green { background: rgba(74, 222, 128, 0.2); color: var(--ui-success); }
.badge-red { background: rgba(239, 68, 68, 0.2); color: var(--ui-danger); }

.loading-state {
  text-align: center;
  padding: 3rem;
  color: var(--ui-link);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ui-control);
  border-top-color: var(--ui-control);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: var(--ui-danger);
  padding: 12px;
  border-radius: var(--ui-radius);
  border: 1px solid rgba(239, 68, 68, 0.2);
}
</style>
