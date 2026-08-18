<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

const movie = ref<any>(null)
const loading = ref(true)
const error = ref('')

const fetchMovieDetail = async () => {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const res = await axios.get(`/api/v1/admin/movies/${route.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    movie.value = res.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else if (err.response?.status === 404) {
      error.value = 'Movie not found.'
    } else {
      error.value = 'Failed to load movie details.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMovieDetail()
})
</script>

<template>
  <div class="movie-detail-page">
    <div class="header-actions">
      <button @click="router.push('/movies')" class="back-btn">← Back to Movies</button>
    </div>

    <div v-if="loading" class="loading-state">Loading details...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>
    
    <div v-else-if="movie" class="detail-container">
      <div class="main-info">
        <div class="poster-section">
          <!-- Branded Fallback if no valid poster -->
          <div class="poster-fallback">
            <div class="fallback-title">{{ movie.title }}</div>
            <div class="fallback-year">{{ movie.year || 'N/A' }}</div>
          </div>
          <div class="poster-status-badge" :class="{'badge-green': movie.poster_status === 'Available', 'badge-yellow': movie.poster_status === 'Missing'}">
            Poster: {{ movie.poster_status }}
          </div>
          <div class="provider-info" v-if="movie.artwork_provider">
            Provider: {{ movie.artwork_provider }}
          </div>
        </div>

        <div class="info-section">
          <h1 class="movie-title">{{ movie.title }}</h1>
          <h2 class="movie-original-title">{{ movie.original_title }}</h2>
          
          <div class="metadata-grid">
            <div class="meta-item">
              <span class="meta-label">ID</span>
              <span class="meta-value">{{ movie.id }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Year</span>
              <span class="meta-value">{{ movie.year || '-' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">TMDB ID</span>
              <span class="meta-value">{{ movie.tmdb_id || '-' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Rating</span>
              <span class="meta-value">{{ movie.rating || '-' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Status</span>
              <span class="badge" :class="movie.status === 'available' ? 'badge-green' : 'badge-red'">
                {{ movie.status }}
              </span>
            </div>
          </div>

          <div class="overview-section">
            <h3>Overview</h3>
            <p>{{ movie.overview || 'No overview available.' }}</p>
          </div>
        </div>
      </div>

      <div class="sources-section">
        <h3>Telegram Sources ({{ movie.telegram_sources_count }})</h3>
        <table class="sources-table" v-if="movie.telegram_sources_count > 0">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Message ID</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="source in movie.telegram_sources" :key="source.channel_id + source.message_id">
              <td>{{ source.channel_id }}</td>
              <td>{{ source.message_id }}</td>
              <td>
                <span class="badge" :class="source.status === 'ACTIVE' ? 'badge-blue' : 'badge-red'">
                  {{ source.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="no-sources">
          No telegram sources attached to this movie.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.movie-detail-page {
  max-width: 1200px;
}

.header-actions {
  margin-bottom: 24px;
}

.back-btn {
  background: transparent;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #334155;
  color: #f1f5f9;
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.main-info {
  display: flex;
  gap: 32px;
  background: #1e293b;
  padding: 32px;
  border-radius: 12px;
  border: 1px solid #334155;
}

.poster-section {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.poster-fallback {
  width: 100%;
  aspect-ratio: 2/3;
  background: radial-gradient(circle at top left, #334155, #0f172a);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 16px;
  border: 1px solid #475569;
}

.fallback-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #e2e8f0;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.fallback-year {
  font-size: 1rem;
  color: #94a3b8;
}

.poster-status-badge {
  text-align: center;
  padding: 8px;
  border-radius: 6px;
  font-weight: bold;
  background: #334155;
}

.provider-info {
  text-align: center;
  font-size: 0.85rem;
  color: #94a3b8;
}

.info-section {
  flex: 1;
}

.movie-title {
  margin: 0 0 8px 0;
  font-size: 2.5rem;
  color: #f8fafc;
}

.movie-original-title {
  margin: 0 0 24px 0;
  font-size: 1.2rem;
  color: #94a3b8;
  font-weight: 400;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 0.85rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #f1f5f9;
}

.overview-section h3 {
  color: #f8fafc;
  margin-bottom: 12px;
}

.overview-section p {
  color: #cbd5e1;
  line-height: 1.6;
}

.sources-section {
  background: #1e293b;
  padding: 32px;
  border-radius: 12px;
  border: 1px solid #334155;
}

.sources-section h3 {
  margin: 0 0 24px 0;
  color: #f8fafc;
}

.sources-table {
  width: 100%;
  border-collapse: collapse;
}

.sources-table th, .sources-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #334155;
}

.sources-table th {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
}

.no-sources {
  color: #94a3b8;
  padding: 16px 0;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}
.badge-green { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
.badge-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.badge-yellow { background: rgba(250, 204, 21, 0.2); color: #facc15; }
.badge-blue { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.error-msg { color: #ef4444; }
.loading-state { color: #94a3b8; }
</style>
