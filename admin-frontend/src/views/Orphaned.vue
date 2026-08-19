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

// Delete modal
const showDeleteModal = ref(false)
const activeMovieId = ref<string | null>(null)
const deleting = ref(false)

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchOrphaned = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/v1/admin/movies', {
      ...auth(),
      params: { orphaned: true, page: page.value, limit }
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

const openDeleteModal = (movieId: string) => {
  activeMovieId.value = movieId
  showDeleteModal.value = true
}

const submitDelete = async () => {
  if (!activeMovieId.value) return
  deleting.value = true
  try {
    await axios.delete(`/api/v1/admin/movies/${activeMovieId.value}`, auth())
    addToast('Movie safely deleted', 'success')
    showDeleteModal.value = false
    movies.value = movies.value.filter(m => m.id !== activeMovieId.value)
    total.value = Math.max(0, total.value - 1)
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete movie', 'error')
  } finally {
    deleting.value = false
  }
}

const totalPages = () => Math.max(1, Math.ceil(total.value / limit))

const changePage = (p: number) => {
  page.value = p
  fetchOrphaned()
}

onMounted(fetchOrphaned)
</script>

<template>
  <div class="orphaned-page">
    <div class="page-header">
      <div>
        <h1>Orphaned Movies</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} movie{{ total !== 1 ? 's' : '' }} with missing data and inactive sources</p>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading...</span>
    </div>

    <div v-else-if="movies.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
      <h3>No Orphaned Movies</h3>
      <p>Clean database state.</p>
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
                <button class="btn-poster" @click="openDeleteModal(movie.id)">Delete</button>
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

    <!-- Delete modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Delete Orphaned Movie</h3>
          <button class="modal-close" @click="showDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">Are you sure you want to permanently delete this movie?</p>
          <p class="sub-text">This will fail if there are associated user comments, reactions, or play sessions.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-modal" @click="showDeleteModal = false">Cancel</button>
          <button class="btn-submit delete-btn" @click="submitDelete" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Confirm Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orphaned-page { max-width: 1200px; }

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

.btn-cancel-modal {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
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

.delete-btn {
  background: #ef4444;
  color: #fff;
}
.delete-btn:hover:not(:disabled) {
  background: #dc2626;
}

.btn-submit:hover:not(:disabled) { background: #7dd3fc; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.warning-text {
  color: #e2e8f0;
  font-weight: 600;
  margin: 0;
}

.sub-text {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
}
</style>
