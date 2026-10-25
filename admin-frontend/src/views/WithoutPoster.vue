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
      params: { without_poster: true, include_unavailable: true, page: page.value, limit }
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
        <table class="data-table responsive-catalog" role="table">
          <thead>
            <tr>
              <th class="poster-col">Poster</th>
              <th class="title-col">Title</th>
              <th class="year-col">Year</th>
              <th class="tmdb-col">TMDB ID</th>
              <th class="status-col">Status</th>
              <th class="sources-col">Sources</th>
              <th class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movie in movies" :key="movie.id" class="table-row">
              <td class="poster-col" data-label="Постер" role="cell">
                <img v-if="movie.poster_url" :src="movie.poster_url" class="mini-real-poster" />
                <div v-else class="mini-poster-fallback">
                  <div class="fallback-title">NO</div>
                  <div class="fallback-title">POSTER</div>
                </div>
              </td>
              <td class="title-col" data-label="Название" role="cell">
                <div class="title-main" :title="movie.title">{{ movie.title }}</div>
                <div class="title-sub" :title="movie.original_title">{{ movie.original_title }}</div>
              </td>
              <td class="year-col" data-label="Год" role="cell">{{ movie.year || '—' }}</td>
              <td class="tmdb-col" data-label="TMDB ID" role="cell">
                <span v-if="movie.tmdb_id" class="tmdb-badge">{{ movie.tmdb_id }}</span>
                <span v-else class="missing-badge">No TMDB</span>
              </td>
              <td class="status-col" data-label="Статус" role="cell">
                <span class="status-pill" :class="'status-' + movie.status">{{ movie.status }}</span>
              </td>
              <td class="sources-col" data-label="Источники" role="cell">{{ movie.telegram_sources_count }}</td>
              <td class="actions-col" data-label="Действия" role="cell">
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
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: var(--ui-text); }
.page-subtitle { margin: 0; color: var(--ui-link); font-size: 0.875rem; }

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px;
  color: var(--ui-link);
}

@keyframes spin { to { transform: rotate(360deg); } }
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--ui-control);
  border-top-color: var(--ui-control);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-link);
  text-align: center;
}

.empty-state h3 { margin: 0; font-size: 1.1rem; color: var(--ui-link); }
.empty-state p { margin: 0; font-size: 0.875rem; }

.table-container {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  overflow: hidden;
}

.data-table { width: 100%; border-collapse: collapse; table-layout: fixed; }

.data-table thead th {
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ui-link);
  background: var(--ui-raised);
  border-bottom: 1px solid var(--ui-border);
}

.poster-col { width: 60px; }
.title-col { width: auto; min-width: 0; }
.year-col { width: 60px; }
.tmdb-col { width: 90px; }
.sources-col { width: 80px; }
.status-col { width: 100px; }
.actions-col { width: 160px; }

.table-row { border-bottom: 1px solid var(--ui-border); transition: background 0.1s; }
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--ui-raised); }

.data-table td { padding: 14px 16px; vertical-align: middle; }

.title-main {
  font-weight: 600;
  color: var(--ui-text);
  font-size: 0.95rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-sub {
  font-size: 0.8rem;
  color: var(--ui-link);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mini Branded Poster Fallback */
.mini-real-poster {
  width: 48px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
}

.mini-poster-fallback {
  width: 40px;
  height: 60px;
  background: radial-gradient(circle at top left, #334155, #0f172a);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 4px;
  border: 1px solid var(--ui-control);
  position: relative;
  overflow: hidden;
}
.fallback-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--ui-text);
  line-height: 1.1;
  word-break: break-word;
}

.tmdb-badge {
  background: var(--ui-raised);
  color: var(--ui-link);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.missing-badge {
  background: var(--ui-danger-bg);
  color: var(--ui-danger);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.status-available { background: var(--ui-success-bg); color: var(--ui-success); }
.status-blocked { background: var(--ui-danger-bg); color: var(--ui-danger); }
.status-unavailable { background: var(--ui-raised); color: var(--ui-link); }

.btn-poster {
  padding: 6px 14px;
  background: var(--ui-warning-bg);
  border: 1px solid var(--ui-warning-bg);
  color: var(--ui-warning);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  margin-right: 6px;
  transition: all 0.15s;
}

.btn-poster:hover { background: var(--ui-warning-bg); }

.btn-view {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-view:hover { background: var(--ui-raised); color: var(--ui-text); }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.page-btn {
  padding: 7px 16px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) { background: var(--ui-raised); color: var(--ui-text); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { color: var(--ui-link); font-size: 0.85rem; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: none;
}

.modal {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border);
}

.modal-header h3 { margin: 0; font-size: 1rem; font-weight: 700; }

.modal-close {
  background: none;
  border: none;
  color: var(--ui-link);
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-group label { font-size: 0.8rem; color: var(--ui-link); font-weight: 600; }

.field-input {
  padding: 9px 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--ui-control); }
.field-input:disabled { opacity: 0.4; }

.field-file {
  font-size: 0.85rem;
  color: var(--ui-link);
}

.divider-or {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ui-link);
  font-size: 12px;
  font-weight: 600;
}

.divider-or::before, .divider-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ui-raised);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--ui-border);
}

.btn-cancel-modal {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-submit {
  padding: 8px 20px;
  background: var(--ui-primary);
  border: none;
  border-radius: var(--ui-radius);
  color: var(--ui-on-primary);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-submit:hover:not(:disabled) { background: var(--ui-primary); color: var(--ui-on-primary); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
