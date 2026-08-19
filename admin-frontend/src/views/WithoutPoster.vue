<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'

const router = useRouter()
const movies = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(true)

// Poster modal
const showPosterModal = ref(false)
const activeMovieId = ref<string | null>(null)
const posterUrl = ref('')
const posterFile = ref<File | null>(null)
const uploading = ref(false)

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchWithoutPoster = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/v1/admin/movies', {
      ...auth(),
      params: { without_poster: true, page: page.value, limit }
    })
    movies.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load movies', 'error')
    }
  } finally {
    loading.value = false
  }
}

const openPosterModal = (movieId: string) => {
  activeMovieId.value = movieId
  posterUrl.value = ''
  posterFile.value = null
  showPosterModal.value = true
}

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files?.length) posterFile.value = target.files[0]
}

const submitPoster = async () => {
  if (!activeMovieId.value) return
  if (!posterUrl.value && !posterFile.value) {
    return addToast('Provide a URL or upload a file', 'error')
  }
  uploading.value = true
  try {
    const formData = new FormData()
    if (posterFile.value) formData.append('file', posterFile.value)
    else formData.append('url', posterUrl.value)

    await axios.post(`/api/v1/admin/movies/${activeMovieId.value}/poster`, formData, {
      headers: {
        ...auth().headers,
        'Content-Type': 'multipart/form-data'
      }
    })
    addToast('Poster updated', 'success')
    showPosterModal.value = false
    // Remove from list since it now has a poster
    movies.value = movies.value.filter(m => m.id !== activeMovieId.value)
    total.value = Math.max(0, total.value - 1)
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update poster', 'error')
  } finally {
    uploading.value = false
  }
}

const totalPages = () => Math.max(1, Math.ceil(total.value / limit))

const changePage = (p: number) => {
  page.value = p
  fetchWithoutPoster()
}

onMounted(fetchWithoutPoster)
</script>

<template>
  <div class="wp-page">
    <div class="page-header">
      <div>
        <h1>Without Poster</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} movie{{ total !== 1 ? 's' : '' }} missing artwork</p>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading...</span>
    </div>

    <div v-else-if="movies.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <h3>All movies have posters</h3>
      <p>No missing artwork found.</p>
    </div>

    <div v-else>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Year</th>
              <th>TMDB</th>
              <th>Status</th>
              <th>Sources</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movie in movies" :key="movie.id" class="table-row">
              <td class="cell-title">
                <span class="title-text">{{ movie.title }}</span>
                <span v-if="movie.original_title !== movie.title" class="title-orig">{{ movie.original_title }}</span>
              </td>
              <td class="cell-narrow">{{ movie.year || '—' }}</td>
              <td class="cell-narrow">
                <span v-if="movie.tmdb_id" class="tmdb-badge">{{ movie.tmdb_id }}</span>
                <span v-else class="missing-badge">No TMDB</span>
              </td>
              <td class="cell-narrow">
                <span class="status-pill" :class="'status-' + movie.status">{{ movie.status }}</span>
              </td>
              <td class="cell-narrow">{{ movie.telegram_sources_count }}</td>
              <td class="cell-actions">
                <button class="btn-poster" @click="openPosterModal(movie.id)">Set Poster</button>
                <button class="btn-view" @click="router.push(`/movies/${movie.id}`)">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages() > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="changePage(page - 1)">← Prev</button>
        <span class="page-info">Page {{ page }} of {{ totalPages() }}</span>
        <button class="page-btn" :disabled="page >= totalPages()" @click="changePage(page + 1)">Next →</button>
      </div>
    </div>

    <!-- Poster modal -->
    <div v-if="showPosterModal" class="modal-overlay" @click.self="showPosterModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Set Poster</h3>
          <button class="modal-close" @click="showPosterModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field-group">
            <label>Poster URL</label>
            <input v-model="posterUrl" placeholder="https://..." class="field-input" :disabled="!!posterFile" />
          </div>
          <div class="divider-or">
            <span>or</span>
          </div>
          <div class="field-group">
            <label>Upload File</label>
            <input type="file" accept="image/*" @change="handleFileChange" class="field-file" :disabled="!!posterUrl" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-modal" @click="showPosterModal = false">Cancel</button>
          <button class="btn-submit" @click="submitPoster" :disabled="uploading">
            {{ uploading ? 'Uploading...' : 'Save Poster' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wp-page { max-width: 1200px; }

.page-header { margin-bottom: 24px; }
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: #f8fafc; }
.page-subtitle { margin: 0; color: #64748b; font-size: 0.875rem; }

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px;
  color: #64748b;
}

@keyframes spin { to { transform: rotate(360deg); } }
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #334155;
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  color: #64748b;
  text-align: center;
}

.empty-state h3 { margin: 0; font-size: 1.1rem; color: #94a3b8; }
.empty-state p { margin: 0; font-size: 0.875rem; }

.table-container {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}

.data-table { width: 100%; border-collapse: collapse; }

.data-table thead th {
  padding: 12px 16px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.table-row { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: rgba(255,255,255,0.03); }

.data-table td { padding: 14px 16px; }
.cell-title { max-width: 280px; }
.title-text { font-weight: 600; color: #f1f5f9; display: block; }
.title-orig { font-size: 0.8rem; color: #64748b; }
.cell-narrow { color: #94a3b8; font-size: 0.85rem; white-space: nowrap; }
.cell-actions { white-space: nowrap; }

.tmdb-badge {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.missing-badge {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-available { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.status-blocked { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.status-unavailable { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }

.btn-poster {
  padding: 6px 14px;
  background: rgba(250, 204, 21, 0.15);
  border: 1px solid rgba(250, 204, 21, 0.3);
  color: #facc15;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  margin-right: 6px;
  transition: all 0.15s;
}

.btn-poster:hover { background: rgba(250, 204, 21, 0.25); }

.btn-view {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-view:hover { background: #334155; color: #f1f5f9; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.page-btn {
  padding: 7px 16px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) { background: #334155; color: #f1f5f9; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { color: #64748b; font-size: 0.85rem; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.modal {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.modal-header h3 { margin: 0; font-size: 1rem; font-weight: 700; }

.modal-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-group label { font-size: 0.8rem; color: #94a3b8; font-weight: 600; }

.field-input {
  padding: 9px 12px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: #38bdf8; }
.field-input:disabled { opacity: 0.4; }

.field-file {
  font-size: 0.85rem;
  color: #94a3b8;
}

.divider-or {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 600;
}

.divider-or::before, .divider-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.06);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.btn-cancel-modal {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-submit {
  padding: 8px 20px;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-submit:hover:not(:disabled) { background: #7dd3fc; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
