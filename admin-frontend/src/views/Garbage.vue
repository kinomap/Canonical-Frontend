<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'

const router = useRouter()
const sources = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(true)
const search = ref('')

const adminToken = computed(() => localStorage.getItem('admin_token') || '')

// Single Delete modal
const showDeleteModal = ref(false)
const activeSourceId = ref<string | null>(null)
const deleting = ref(false)

// Bulk Delete state
const selectedIds = ref<string[]>([])
const showBulkDeleteModal = ref(false)
const showDeleteAllModal = ref(false)
const bulkDeleting = ref(false)

// Inspect view
const inspectingSource = ref<any | null>(null)
const streamToken = ref('')
const mediaUrl = ref('')
const identifyTitle = ref('')
const identifyYear = ref<number | null>(null)
const identifyTmdbId = ref<number | null>(null)
const identifying = ref(false)

const isAllSelected = computed(() => {
  return sources.value.length > 0 && selectedIds.value.length === sources.value.length
})

const toggleSelectAll = (e: Event) => {
  if ((e.target as HTMLInputElement).checked) {
    selectedIds.value = sources.value.map(s => s.id)
  } else {
    selectedIds.value = []
  }
}

const auth = () => ({ headers: { Authorization: `Bearer ${adminToken.value}` } })

let abortController: AbortController | null = null

const fetchGarbage = async () => {
  if (abortController) {
    abortController.abort()
  }
  abortController = new AbortController()
  const signal = abortController.signal

  loading.value = true
  selectedIds.value = []
  try {
    const params: any = { page: page.value, limit }
    if (search.value.trim()) {
      params.search = search.value.trim()
    }
    const res = await axios.get('/api/v1/admin/garbage', {
      ...auth(),
      params,
      signal
    })
    sources.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (axios.isCancel(err)) return
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load garbage sources', 'error')
    }
  } finally {
    if (!abortController?.signal.aborted) {
      loading.value = false
    }
  }
}

let searchTimer: any = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchGarbage()
  }, 250)
}

const handleSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  page.value = 1
  fetchGarbage()
}

const openDeleteModal = (sourceId: string) => {
  activeSourceId.value = sourceId
  showDeleteModal.value = true
}

const submitDelete = async () => {
  if (!activeSourceId.value) return
  deleting.value = true
  try {
    await axios.delete(`/api/v1/admin/garbage/${activeSourceId.value}`, auth())
    addToast('Garbage source deleted', 'success')
    showDeleteModal.value = false
    sources.value = sources.value.filter(s => s.id !== activeSourceId.value)
    total.value = Math.max(0, total.value - 1)
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete source', 'error')
  } finally {
    deleting.value = false
  }
}

const openInspect = async (source: any) => {
  inspectingSource.value = source
  identifyTitle.value = source.identification_title || ''
  identifyYear.value = source.identification_year || null
  identifyTmdbId.value = null
  streamToken.value = ''
  mediaUrl.value = ''
  
  try {
    const res = await axios.get(`/api/v1/admin/garbage/${source.id}/stream-token`, auth())
    streamToken.value = res.data.stream_token
    mediaUrl.value = res.data.media_url || ''
  } catch (err: any) {
    addToast('Failed to get video stream token', 'error')
  }
}

const closeInspect = () => {
  inspectingSource.value = null
}

const submitIdentify = async () => {
  if (!inspectingSource.value) return
  const tmdbId = identifyTmdbId.value ? Number(identifyTmdbId.value) : null
  if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
    addToast('TMDB ID must be a positive integer', 'error')
    return
  }
  if (!identifyTitle.value.trim() && tmdbId === null) {
    addToast('Title or TMDB ID is required for identification', 'error')
    return
  }
  
  identifying.value = true
  try {
    const res = await axios.put(`/api/v1/admin/garbage/${inspectingSource.value.id}/identify`, {
      identification_title: identifyTitle.value,
      identification_year: identifyYear.value || null,
      tmdb_id: tmdbId
    }, auth())
    
    if (res.data.status === 'garbage') {
      addToast('Provider did not confirm. Still Garbage.', 'info')
    } else {
      addToast(`Success: movie ${res.data.status}`, 'success')
    }
    inspectingSource.value = null
    fetchGarbage() // refresh list
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to identify source', 'error')
  } finally {
    identifying.value = false
  }
}

const submitBulkDelete = async () => {
  if (selectedIds.value.length === 0) return
  bulkDeleting.value = true
  try {
    const res = await axios.post('/api/v1/admin/garbage/bulk', { source_ids: selectedIds.value }, auth())
    addToast(`${res.data.deleted} sources deleted`, 'success')
    showBulkDeleteModal.value = false
    fetchGarbage()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete sources', 'error')
  } finally {
    bulkDeleting.value = false
  }
}

const submitDeleteAll = async () => {
  bulkDeleting.value = true
  try {
    const res = await axios.post('/api/v1/admin/garbage/delete-all', null, auth())
    addToast(`${res.data.deleted} sources deleted`, 'success')
    showDeleteAllModal.value = false
    fetchGarbage()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete all sources', 'error')
  } finally {
    bulkDeleting.value = false
  }
}

const totalPages = () => Math.max(1, Math.ceil(total.value / limit))

const changePage = (p: number) => {
  page.value = p
  fetchGarbage()
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(fetchGarbage)
</script>

<template>
  <div class="garbage-page">
    <div class="page-header" v-if="!inspectingSource">
      <div>
        <h1>Garbage</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} unresolved Telegram videos</p>
      </div>
      <div class="search-box">
        <input 
          type="text" 
          v-model="search" 
          @input="onSearchInput"
          @keyup.enter="handleSearch" 
          placeholder="Search by caption, title or year..." 
        />
        <button @click="handleSearch">Search</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- INSPECT VIEW -->
    <div v-else-if="inspectingSource" class="inspect-view">
      <div class="inspect-header">
        <button class="btn-cancel-modal" @click="closeInspect">← Back to List</button>
        <h2>Garbage #{{ inspectingSource.message_id }}</h2>
      </div>

      <div class="inspect-content">
        <div class="video-container">
          <div class="admin-watermark">ADMIN VIDEO PLAYER</div>
          <video 
            controls 
            preload="metadata"
            :src="mediaUrl"
            class="admin-video-player"
          ></video>
        </div>

        <div class="inspect-sidebar">
          <div class="card info-card">
            <h3>Metadata</h3>
            <ul class="meta-list">
              <li><strong>Channel:</strong> {{ inspectingSource.channel_id }}</li>
              <li><strong>Message ID:</strong> {{ inspectingSource.message_id }}</li>
              <li><strong>File Size:</strong> {{ formatBytes(inspectingSource.file_size) }}</li>
              <li><strong>MIME:</strong> {{ inspectingSource.mime_type }}</li>
              <li><strong>Resolution:</strong> {{ inspectingSource.resolution_height ? inspectingSource.resolution_height + 'p' : 'Unknown' }}</li>
              <li><strong>Date:</strong> {{ new Date(inspectingSource.created_at).toLocaleString() }}</li>
            </ul>
          </div>

          <div class="card edit-card">
            <h3>Identify Source</h3>
            <p class="sub-text">Watch the physical video and correct the identity details.</p>
            
            <div class="form-group readonly-group">
              <label>Original Telegram Caption</label>
              <div class="readonly-text">{{ inspectingSource.raw_caption || 'No Telegram caption' }}</div>
            </div>

            <div class="form-group">
              <label>Identification Title</label>
              <input type="text" v-model="identifyTitle" class="form-input" placeholder="Movie title" />
            </div>

            <div class="form-group">
              <label>Identification Year</label>
              <input type="number" v-model="identifyYear" class="form-input" placeholder="e.g. 2011" />
            </div>

            <div class="form-group">
              <label>TMDB ID (optional)</label>
              <input type="number" min="1" v-model="identifyTmdbId" class="form-input" placeholder="e.g. 62" />
            </div>

            <button class="btn-submit" style="width: 100%; margin-top: 10px;" @click="submitIdentify" :disabled="identifying">
              {{ identifying ? 'Processing...' : 'Save & Re-identify' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- EMPTY STATE -->
    <div v-else-if="sources.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
      <h3>No Garbage Sources</h3>
      <p>Clean database state.</p>
    </div>

    <!-- LIST VIEW -->
    <div v-else>
      <div class="bulk-actions" v-if="sources.length > 0">
        <span class="selected-count">Selected: {{ selectedIds.length }}</span>
        <button class="btn-bulk-delete" :disabled="selectedIds.length === 0" @click="showBulkDeleteModal = true">Delete Selected</button>
        <button class="btn-delete-all" @click="showDeleteAllModal = true">Delete All Garbage</button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="cell-checkbox">
                <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
              </th>
              <th>Frame</th>
              <th>Channel</th>
              <th>Message ID</th>
              <th>Original Caption</th>
              <th>Identification Title</th>
              <th>Year</th>
              <th>File Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="source in sources" :key="source.id" class="table-row clickable-row" @click="openInspect(source)">
              <td class="cell-checkbox" @click.stop>
                <input type="checkbox" :value="source.id" v-model="selectedIds" />
              </td>
              <td>
                <img v-if="source.poster_url" :src="source.poster_url" class="mini-garbage-frame" />
                <span v-else class="empty-val">-</span>
              </td>
              <td class="channel-col">{{ source.channel_id }}</td>
              <td class="cell-narrow">
                <a :href="'https://t.me/' + source.channel_id + '/' + source.message_id" target="_blank" class="tg-link" @click.stop>
                  {{ source.message_id }}
                </a>
              </td>
              <td class="cell-narrow">{{ source.raw_caption || 'No Telegram caption' }}</td>
              <td class="cell-narrow">{{ source.identification_title || '-' }}</td>
              <td class="cell-narrow">{{ source.identification_year || '-' }}</td>
              <td class="cell-narrow">{{ formatBytes(source.file_size) }}</td>
              <td class="cell-actions" @click.stop>
                <button class="btn-primary" @click="openInspect(source)" style="margin-right: 8px;">Inspect</button>
                <button class="btn-poster" @click="openDeleteModal(source.id)">Delete</button>
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
          <h3>Delete Garbage Source</h3>
          <button class="modal-close" @click="showDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">Are you sure you want to permanently delete this garbage source?</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-modal" @click="showDeleteModal = false">Cancel</button>
          <button class="btn-submit delete-btn" @click="submitDelete" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Confirm Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bulk Delete modal -->
    <div v-if="showBulkDeleteModal" class="modal-overlay" @click.self="showBulkDeleteModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Delete {{ selectedIds.length }} Sources?</h3>
          <button class="modal-close" @click="showBulkDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">These sources will be permanently removed.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-modal" @click="showBulkDeleteModal = false">Cancel</button>
          <button class="btn-submit delete-btn" @click="submitBulkDelete" :disabled="bulkDeleting">
            {{ bulkDeleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete All modal -->
    <div v-if="showDeleteAllModal" class="modal-overlay" @click.self="showDeleteAllModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Delete ALL {{ total }} Garbage Sources?</h3>
          <button class="modal-close" @click="showDeleteAllModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text" style="color: #ef4444; font-weight: bold;">Warning: This is a highly destructive action.</p>
          <p class="sub-text">This will permanently delete all unresolved sources.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-modal" @click="showDeleteAllModal = false">Cancel</button>
          <button class="btn-submit delete-btn" @click="submitDeleteAll" :disabled="bulkDeleting">
            {{ bulkDeleting ? 'Deleting...' : 'Delete All' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.garbage-page { max-width: 1200px; margin: 0 auto; }

.page-header { margin-bottom: 24px; }
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: #f8fafc; }
.page-subtitle { margin: 0; color: #64748b; font-size: 0.875rem; }

.search-box {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.search-box input {
  flex: 1;
  padding: 10px 16px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  outline: none;
}

.search-box input:focus {
  border-color: #38bdf8;
}

.search-box button {
  padding: 8px 16px;
  background: #38bdf8;
  color: #0f172a;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.search-box button:hover:not(:disabled) {
  background: #7dd3fc;
}

/* INSPECT VIEW STYLES */
.inspect-view {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.inspect-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.inspect-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #f8fafc;
}

.inspect-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.video-container {
  flex: 1;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 10px 25px rgba(0,0,0,0.5);
}

.admin-watermark {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(220, 38, 38, 0.8);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  letter-spacing: 1px;
  z-index: 10;
  pointer-events: none;
}

.admin-video-player {
  width: 100%;
  aspect-ratio: 16/9;
  display: block;
}

.inspect-sidebar {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 20px;
}

.card h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #f8fafc;
}

.meta-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-list li {
  font-size: 0.9rem;
  color: #cbd5e1;
}

.meta-list strong {
  color: #94a3b8;
  width: 90px;
  display: inline-block;
}

.readonly-group {
  background: rgba(0,0,0,0.2);
  padding: 10px;
  border-radius: 6px;
  border: 1px dashed rgba(255,255,255,0.1);
  margin-bottom: 12px;
}

.readonly-text {
  color: #cbd5e1;
  font-family: monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
}

/* TABLE STYLES */
.clickable-row {
  cursor: pointer;
}

.bulk-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
}
.selected-count { color: #f8fafc; font-weight: 600; font-size: 0.9rem; margin-right: auto; }
.btn-bulk-delete {
  background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s;
}
.btn-bulk-delete:hover:not(:disabled) { background: #dc2626; }
.btn-bulk-delete:disabled { background: #475569; color: #94a3b8; cursor: not-allowed; }

.btn-delete-all {
  background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-delete-all:hover { background: rgba(239, 68, 68, 0.1); }

.cell-checkbox { width: 40px; text-align: center; }
.cell-checkbox input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; accent-color: #38bdf8; }

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
.cell-narrow { color: #94a3b8; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }
.channel-col {
  white-space: nowrap;
  color: #94a3b8;
  font-size: 0.85rem;
}
.cell-actions { white-space: nowrap; }

.mini-garbage-frame {
  width: 90px;
  height: 50px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1);
}

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
.btn-cancel-modal:hover {
  background: #334155;
  color: white;
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

.btn-primary {
  padding: 6px 14px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-primary:hover:not(:disabled) { background: rgba(56, 189, 248, 0.25); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.form-group label { font-size: 0.85rem; font-weight: 600; color: #94a3b8; }
.form-input {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.1);
  color: #f8fafc;
  padding: 10px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.95rem;
}
.form-input:focus { outline: none; border-color: #38bdf8; }

.warning-text {
  color: #e2e8f0;
  font-weight: 600;
  margin: 0;
}

.sub-text {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0 0 12px 0;
}

.tg-link { color: #38bdf8; text-decoration: none; }
.tg-link:hover { text-decoration: underline; }
</style>
