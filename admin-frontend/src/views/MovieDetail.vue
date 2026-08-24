<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

const goBack = () => {
  if (window.history.length > 2) {
    router.back()
  } else {
    router.push('/movies')
  }
}

const movie = ref<any>(null)
const loading = ref(true)
const error = ref('')

import { addToast } from '../toast'

// Edit states
const editingDescription = ref(false)
const editDescriptionText = ref('')
const savingDescription = ref(false)

// Title edit
const editingTitle = ref(false)
const editTitleText = ref('')
const savingTitle = ref(false)

const showBlockModal = ref(false)
const blockReason = ref('')
const blocking = ref(false)

// Admin delete
const showAdminDeleteModal = ref(false)
const adminDeleting = ref(false)

const showPosterModal = ref(false)
const posterUrl = ref('')
const posterFile = ref<File | null>(null)
const uploadingPoster = ref(false)

// Lightbox
const showLightbox = ref(false)

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

const handleUpdateDescription = async () => {
  savingDescription.value = true
  try {
    await axios.put(`/api/v1/admin/movies/${movie.value.id}/description`, {
      description: editDescriptionText.value
    }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    movie.value.overview = editDescriptionText.value
    movie.value.overview_is_manual_override = true
    editingDescription.value = false
    addToast('Description updated successfully', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update description', 'error')
  } finally {
    savingDescription.value = false
  }
}

const handleBlockMovie = async () => {
  if (!blockReason.value) return addToast('Reason is required', 'error')
  blocking.value = true
  try {
    await axios.post(`/api/v1/admin/movies/${movie.value.id}/block`, {
      reason: blockReason.value
    }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    movie.value.status = 'blocked'
    movie.value.block_reason = blockReason.value
    showBlockModal.value = false
    addToast('Movie blocked', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to block movie', 'error')
  } finally {
    blocking.value = false
  }
}

const handleUnblockMovie = async () => {
  try {
    await axios.post(`/api/v1/admin/movies/${movie.value.id}/unblock`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    await fetchMovieDetail()
    addToast('Movie unblocked', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to unblock movie', 'error')
  }
}

const handlePosterUpload = async () => {
  if (!posterUrl.value && !posterFile.value) {
    return addToast('Please provide a URL or select a file', 'error')
  }
  uploadingPoster.value = true
  try {
    const formData = new FormData()
    if (posterFile.value) {
      formData.append('file', posterFile.value)
    } else if (posterUrl.value) {
      formData.append('url', posterUrl.value)
    }
    
    await axios.post(`/api/v1/admin/movies/${movie.value.id}/poster`, formData, {
      headers: { 
        Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
        'Content-Type': 'multipart/form-data'
      }
    })
    
    addToast('Poster updated successfully', 'success')
    showPosterModal.value = false
    posterUrl.value = ''
    posterFile.value = null
    await fetchMovieDetail()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update poster', 'error')
  } finally {
    uploadingPoster.value = false
  }
}

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    posterFile.value = target.files[0]
  }
}

const startEditTitle = () => {
  editTitleText.value = movie.value?.title || ''
  editingTitle.value = true
}

const handleUpdateTitle = async () => {
  if (!editTitleText.value.trim()) return addToast('Title cannot be empty', 'error')
  savingTitle.value = true
  try {
    await axios.put(`/api/v1/admin/movies/${movie.value.id}/title`, {
      title: editTitleText.value.trim()
    }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    movie.value.title = editTitleText.value.trim()
    movie.value.title_is_manual_override = true
    editingTitle.value = false
    addToast('Title updated successfully', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update title', 'error')
  } finally {
    savingTitle.value = false
  }
}

const handleRestorePoster = async () => {
  try {
    await axios.delete(`/api/v1/admin/movies/${movie.value.id}/poster`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    movie.value.artwork_provider = null
    addToast('Poster manual override removed. Artwork pipeline will re-resolve.', 'success')
    await fetchMovieDetail()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to restore automatic poster', 'error')
  }
}

const handleAdminDelete = async () => {
  adminDeleting.value = true
  try {
    await axios.post(`/api/v1/admin/movies/${movie.value.id}/admin-delete`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    })
    addToast('Movie deactivated. Metadata preserved. It may reappear if re-published on Telegram.', 'success')
    showAdminDeleteModal.value = false
    router.push('/movies')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to deactivate movie', 'error')
  } finally {
    adminDeleting.value = false
  }
}
</script>

<template>
  <div class="movie-detail-page">
    <div class="header-actions">
      <button @click="goBack" class="back-btn">← Back</button>
    </div>

    <div v-if="loading" class="loading-state">Loading details...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>
    
    <div v-else-if="movie" class="detail-container">
      <div class="main-info">
        
        <!-- LEFT COLUMN: POSTER -->
        <div class="poster-section">
          <img v-if="movie.poster_url" :src="movie.poster_url" alt="Poster" class="real-poster" />
          <div v-else class="poster-fallback">
            <div class="fallback-title">{{ movie.title }}</div>
            <div class="fallback-year">{{ movie.year || 'N/A' }}</div>
          </div>
          <div v-if="movie.artwork_type === 'frame'" class="poster-status-badge badge-purple">
            🖼️ Artwork: Frame
          </div>
          <div v-else class="poster-status-badge" :class="{'badge-green': movie.poster_status === 'Available', 'badge-yellow': movie.poster_status === 'Missing'}">
            Poster: {{ movie.poster_status === 'Available' ? 'Present' : 'Missing' }}
          </div>
          <div class="provider-info" v-if="movie.artwork_provider">
            Provider: <span :class="{'manual-badge': movie.artwork_provider === 'Manual'}">{{ movie.artwork_provider }}</span>
          </div>

          <div class="poster-actions-group">
            <button 
              v-if="movie.poster_url" 
              class="action-btn view-poster-btn" 
              @click="showLightbox = true"
            >View Poster</button>
            <button class="action-btn" @click="showPosterModal = true">Change Poster</button>
            <button
              v-if="movie.artwork_provider === 'Manual'"
              class="action-btn restore-btn"
              @click="handleRestorePoster"
              title="Remove manual override and allow artwork pipeline to re-resolve"
            >Restore Automatic</button>
          </div>
        </div>

        <!-- RIGHT COLUMN: METADATA -->
        <div class="info-section">
          <div class="title-header-block">
            <div class="title-main">
              <!-- Title display/edit -->
              <div v-if="!editingTitle" class="title-display">
                <h1 class="movie-title">
                  {{ movie.title }}
                  <span v-if="movie.title_is_manual_override" class="override-badge" title="Manually set">✎</span>
                </h1>
                <h2 class="movie-original-title">{{ movie.original_title }}</h2>
                <button class="link-btn" @click="startEditTitle">Edit title</button>
              </div>
              <div v-else class="title-edit-row">
                <input
                  v-model="editTitleText"
                  class="title-input"
                  placeholder="Movie title..."
                  @keydown.enter="handleUpdateTitle"
                  @keydown.escape="editingTitle = false"
                />
                <button class="btn-save" @click="handleUpdateTitle" :disabled="savingTitle">
                  {{ savingTitle ? 'Saving...' : 'Save' }}
                </button>
                <button class="btn-cancel" @click="editingTitle = false">Cancel</button>
              </div>
            </div>
            
            <div class="movie-primary-actions">
              <a 
                v-if="movie.status === 'available' && movie.telegram_sources_count > 0 && movie.public_url" 
                :href="movie.public_url" 
                target="_blank" 
                class="action-btn view-movie-btn"
              >View Movie ↗</a>
              <div v-else class="unavailable-status-text">
                Movie unavailable — no active source
              </div>
            </div>
          </div>
          
          <div class="title-actions">
            <button v-if="movie.status !== 'blocked'" class="action-btn block-btn" @click="showBlockModal = true">Block Movie</button>
            <button v-else class="action-btn unblock-btn" @click="handleUnblockMovie">Unblock Movie</button>
            <button
              v-if="movie.status !== 'blocked'"
              class="action-btn admin-delete-btn"
              @click="showAdminDeleteModal = true"
              title="Soft-delete: deactivates sources, preserves metadata"
            >Delete / Deactivate</button>
          </div>
          
          <div class="metadata-grid">
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
              <span class="meta-label">Kinopoisk ID</span>
              <span class="meta-value">{{ movie.kinopoisk_id || 'N/A' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">IMDb ID</span>
              <span class="meta-value">{{ movie.imdb_id || 'N/A' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Genres</span>
              <span class="meta-value">{{ movie.genres || 'N/A' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Backdrop</span>
              <span class="meta-value">
                <a v-if="movie.backdrop" :href="movie.backdrop" target="_blank">View ↗</a>
                <span v-else>None</span>
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Status</span>
              <span class="badge meta-value-badge" :class="movie.status === 'available' ? 'badge-green' : 'badge-red'">
                {{ movie.status }}
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Sources</span>
              <span class="meta-value">{{ movie.telegram_sources_count }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Provider</span>
              <span class="meta-value">{{ movie.artwork_provider || 'N/A' }}</span>
            </div>
            <div class="meta-item" v-if="movie.status === 'blocked'" style="grid-column: 1 / -1;">
              <span class="meta-label">Block Reason</span>
              <span class="meta-value blocked-reason">{{ movie.block_reason }}</span>
            </div>
          </div>

          <div class="overview-section">
            <div class="overview-header">
              <h3>Overview <span v-if="movie.overview_is_manual_override" class="manual-badge">MANUAL</span></h3>
              <button v-if="!editingDescription" class="icon-btn" @click="editingDescription = true; editDescriptionText = movie.overview">Edit</button>
            </div>
            
            <div v-if="editingDescription" class="edit-overview-form">
              <textarea v-model="editDescriptionText" rows="5"></textarea>
              <div class="edit-actions">
                <button class="action-btn save-btn" @click="handleUpdateDescription" :disabled="savingDescription">Save</button>
                <button class="action-btn cancel-btn" @click="editingDescription = false">Cancel</button>
              </div>
            </div>
            <p v-else>{{ movie.overview || 'No overview available.' }}</p>
          </div>
        </div>
      </div>

      <div class="sources-section">
        <div class="sources-header">
          <h3>Telegram Sources ({{ movie.telegram_sources_count }})</h3>
        </div>
        <div class="sources-content" v-if="movie.telegram_sources_count > 0">
          <table class="sources-table">
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
        </div>
        <div v-else class="no-sources-box">
          No active Telegram sources.
        </div>
      </div>
    </div>

    <!-- Modals -->
    <div v-if="showPosterModal" class="modal-overlay" @click.self="showPosterModal = false">
      <div class="modal-content">
        <h3>Update Poster</h3>
        <p class="modal-desc">Provide a URL to download a new poster, or upload a local file.</p>
        
        <div class="form-group">
          <label>Poster URL</label>
          <input type="text" v-model="posterUrl" placeholder="https://..." :disabled="!!posterFile">
        </div>
        <div class="form-group">
          <label>Or Upload File</label>
          <input type="file" accept="image/*" @change="handleFileChange" :disabled="!!posterUrl">
        </div>

        <div class="modal-actions">
          <button class="action-btn save-btn" @click="handlePosterUpload" :disabled="uploadingPoster">Upload</button>
          <button class="action-btn cancel-btn" @click="showPosterModal = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showBlockModal" class="modal-overlay" @click.self="showBlockModal = false">
      <div class="modal-content block-modal">
        <h3>Block Movie</h3>
        <p class="modal-desc">This will immediately hide the movie from the public catalog.</p>
        
        <div class="form-group">
          <label>Reason for blocking</label>
          <textarea v-model="blockReason" rows="3" placeholder="e.g. DMCA, Duplicate, Broken..."></textarea>
        </div>

        <div class="modal-actions">
          <button class="action-btn block-btn-solid" @click="handleBlockMovie" :disabled="blocking">Confirm Block</button>
          <button class="action-btn cancel-btn" @click="showBlockModal = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Admin Delete Modal -->
    <div v-if="showAdminDeleteModal" class="modal-overlay" @click.self="showAdminDeleteModal = false">
      <div class="modal-content admin-delete-modal">
        <h3>Delete / Deactivate Movie</h3>
        <div class="admin-delete-info">
          <div class="admin-delete-icon">⚠️</div>
          <div>
            <p class="admin-delete-title">This is a soft delete — metadata is preserved.</p>
            <ul class="admin-delete-list">
              <li>All Telegram sources will be marked <strong>DELETED</strong></li>
              <li>Movie status → <strong>unavailable</strong> (hidden from public catalog)</li>
              <li>Title, TMDB ID, poster, overview, genres are <strong>NOT deleted</strong></li>
              <li>If the movie reappears on Telegram, it will be <strong>automatically resurrected</strong></li>
            </ul>
          </div>
        </div>
        <div class="modal-actions">
          <button class="action-btn admin-delete-btn-solid" @click="handleAdminDelete" :disabled="adminDeleting">
            {{ adminDeleting ? 'Deactivating...' : 'Confirm Deactivate' }}
          </button>
          <button class="action-btn cancel-btn" @click="showAdminDeleteModal = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Lightbox Modal for Poster -->
    <div v-if="showLightbox && movie?.poster_url" class="lightbox-overlay" @click.self="showLightbox = false">
      <div class="lightbox-container">
        <button class="lightbox-close" @click="showLightbox = false">✕</button>
        <img :src="movie.poster_url" alt="Full Poster" class="lightbox-image" />
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
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 32px;
  background: #1e293b;
  padding: 32px;
  border-radius: 12px;
  border: 1px solid #334155;
}

@media (max-width: 900px) {
  .main-info {
    grid-template-columns: 1fr;
  }
  .poster-section {
    max-width: 260px;
    margin: 0 auto;
  }
}

.poster-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.poster-actions-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.view-poster-btn {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: #38bdf8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px;
}

.view-poster-btn:hover {
  background: #38bdf8;
  color: #0f172a;
}

.poster-fallback {
  width: 100%;
  aspect-ratio: 2/3;
  background: radial-gradient(circle at top left, #334155, #0f172a);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 24px;
  border: 1px solid #475569;
}

.real-poster {
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
  object-fit: cover;
  display: block;
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
  padding: 6px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 0.8rem;
  background: #334155;
}

.provider-info {
  text-align: center;
  font-size: 0.8rem;
  color: #94a3b8;
}

.info-section {
  flex: 1;
  min-width: 0;
}

.title-header-block {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 24px;
}

.movie-primary-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.view-movie-btn {
  background: #3b82f6;
  color: #fff;
  font-size: 0.95rem;
  padding: 10px 20px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 700;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);
  transition: all 0.2s;
  text-align: center;
}

.view-movie-btn:hover {
  background: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 6px 10px -2px rgba(59, 130, 246, 0.5);
}

.unavailable-status-text {
  color: #ef4444;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  text-align: center;
}

.movie-title {
  margin: 0 0 6px 0;
  font-size: 1.8rem;
  color: #f8fafc;
  line-height: 1.2;
}

.movie-original-title {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #94a3b8;
  font-weight: 400;
}

.title-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f1f5f9;
}

.overview-section h3 {
  color: #f8fafc;
  font-size: 1.15rem;
  margin-bottom: 12px;
}

.overview-section p {
  color: #cbd5e1;
  line-height: 1.5;
  font-size: 0.95rem;
}

.sources-section {
  background: #1e293b;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #334155;
}

.sources-header h3 {
  margin: 0 0 16px 0;
  color: #f8fafc;
  font-size: 1.15rem;
}

.sources-table {
  width: 100%;
  border-collapse: collapse;
}

.sources-table th, .sources-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #334155;
  font-size: 0.9rem;
}

.sources-table th {
  color: #94a3b8;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.no-sources-box {
  color: #94a3b8;
  padding: 12px 16px;
  background: #0f172a;
  border-radius: 6px;
  font-size: 0.9rem;
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
.badge-purple { background: rgba(139, 92, 246, 0.15); color: #c4b5fd; }
.badge-blue { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.error-msg { color: #ef4444; }
.loading-state { color: #94a3b8; }

.action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  background: #334155;
  color: #f8fafc;
}

.action-btn:hover:not(:disabled) {
  background: #475569;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.block-btn {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
}
.block-btn:hover {
  background: #ef4444;
  color: white;
}

.unblock-btn {
  background: transparent;
  border: 1px solid #10b981;
  color: #10b981;
}
.unblock-btn:hover {
  background: #10b981;
  color: white;
}

.manual-badge {
  background: #f59e0b;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 800;
  margin-left: 8px;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.icon-btn {
  background: transparent;
  color: #38bdf8;
  border: 1px solid #38bdf8;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
}

.edit-overview-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.edit-overview-form textarea {
  background: #0f172a;
  border: 1px solid #475569;
  color: white;
  padding: 12px;
  border-radius: 6px;
  font-family: inherit;
  resize: vertical;
}

.save-btn {
  background: #38bdf8;
  color: #0f172a;
}
.save-btn:hover:not(:disabled) {
  background: #7dd3fc;
}

.cancel-btn {
  background: transparent;
}

.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #1e293b;
  padding: 32px;
  border-radius: 12px;
  width: 400px;
  border: 1px solid #334155;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.modal-desc {
  color: #94a3b8;
  font-size: 0.9rem;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: #cbd5e1;
  margin-bottom: 8px;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  background: #0f172a;
  border: 1px solid #475569;
  color: white;
  padding: 10px;
  border-radius: 6px;
}

.form-group input:disabled {
  opacity: 0.5;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: flex-end;
}

.block-btn-solid {
  background: #ef4444;
  color: white;
}
.block-btn-solid:hover:not(:disabled) {
  background: #dc2626;
}

.blocked-reason {
  color: #ef4444;
  font-style: italic;
}

/* Title editing */
.title-main { flex: 1; min-width: 0; }

.title-display { display: flex; flex-direction: column; gap: 4px; }

.override-badge {
  font-size: 0.75em;
  color: #facc15;
  margin-left: 6px;
  cursor: default;
}

.link-btn {
  background: none;
  border: none;
  color: #38bdf8;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  align-self: flex-start;
}

.title-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid #38bdf8;
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 1rem;
  font-weight: 600;
  outline: none;
}

.btn-save {
  padding: 8px 16px;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-cancel {
  padding: 8px 12px;
  background: transparent;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #64748b;
  font-size: 0.875rem;
  cursor: pointer;
}

/* Restore poster button */
.restore-btn {
  background: rgba(100, 116, 139, 0.15);
  border: 1px solid rgba(100, 116, 139, 0.3) !important;
  color: #94a3b8 !important;
}

.restore-btn:hover {
  background: rgba(100, 116, 139, 0.25) !important;
  color: #cbd5e1 !important;
}

/* Admin Delete button */
.admin-delete-btn {
  background: rgba(239, 68, 68, 0.1) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: #f87171 !important;
}

.admin-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2) !important;
  border-color: rgba(239, 68, 68, 0.5) !important;
  color: #ef4444 !important;
}

/* Admin Delete modal */
.admin-delete-modal {
  border-top: 3px solid #ef4444;
}

.admin-delete-info {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.admin-delete-icon {
  font-size: 1.8rem;
  flex-shrink: 0;
}

.admin-delete-title {
  margin: 0 0 10px;
  font-weight: 700;
  color: #f1f5f9;
  font-size: 0.95rem;
}

.admin-delete-list {
  margin: 0;
  padding-left: 18px;
  color: #94a3b8;
  font-size: 0.85rem;
  line-height: 1.8;
}

.admin-delete-list li strong {
  color: #f1f5f9;
}

.admin-delete-btn-solid {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.admin-delete-btn-solid:hover:not(:disabled) {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

.admin-delete-btn-solid:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  padding: 40px;
}

.lightbox-container {
  position: relative;
  max-width: 90%;
  max-height: 90vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.lightbox-close {
  position: absolute;
  top: -40px;
  right: -40px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 2rem;
  cursor: pointer;
  transition: transform 0.2s;
}

.lightbox-close:hover {
  transform: scale(1.1);
}

@media (max-width: 768px) {
  .lightbox-close {
    top: -30px;
    right: 0;
  }
}
</style>

