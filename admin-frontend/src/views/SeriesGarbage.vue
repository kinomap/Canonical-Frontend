<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'

const router = useRouter()

const sources = ref<any[]>([])
const total = ref(0)
const pages = ref(1)
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
const identifySeason = ref<number | null>(null)
const identifyEpisode = ref<number | null>(null)
const inspectItems = ref<any[]>([])
const identifying = ref(false)
const providerMatch = ref<any | null>(null)

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
    const res = await axios.get('/api/v1/admin/series/garbage', {
      ...auth(),
      params,
      signal
    })
    sources.value = res.data.items
    total.value = res.data.total
    pages.value = res.data.pages || Math.max(1, Math.ceil(res.data.total / limit))
  } catch (err: any) {
    if (axios.isCancel(err)) return
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load series garbage candidates', 'error')
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
    await axios.delete(`/api/v1/admin/series/garbage/${activeSourceId.value}`, auth())
    addToast('Series garbage source deleted', 'success')
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
  identifySeason.value = source.identification_season || 1
  identifyEpisode.value = source.identification_episode || 1
  providerMatch.value = null
  streamToken.value = ''
  
  inspectItems.value = (source.items || []).map((item: any) => ({
    id: item.id,
    channel_id: item.channel_id,
    message_id: item.message_id,
    season_number: item.season_number || source.identification_season || 1,
    episode_number: item.episode_number,
    review_reason: item.review_reason,
    file_size: item.file_size,
    mime_type: item.mime_type,
    raw_caption: item.raw_caption
  }))
  
  try {
    const res = await axios.get(`/api/v1/admin/series/garbage/${source.id}/stream-token`, auth())
    streamToken.value = res.data.stream_token
    mediaUrl.value = res.data.media_url || ''
  } catch (err: any) {
    // Stream token fails gracefully if no media file
  }
}

const closeInspect = () => {
  inspectingSource.value = null
  providerMatch.value = null
}

const submitIdentify = async () => {
  if (!inspectingSource.value) return
  if (!identifyTitle.value.trim()) {
    addToast('Series title is required for identification', 'error')
    return
  }
  
  identifying.value = true
  providerMatch.value = null
  try {
    const payload = {
      identification_title: identifyTitle.value.trim(),
      identification_year: identifyYear.value || null,
      identification_season: identifySeason.value || 1,
      identification_episode: identifyEpisode.value || 1,
      items: inspectItems.value.map(it => ({
        id: it.id,
        season_number: it.season_number,
        episode_number: it.episode_number
      }))
    }

    const res = await axios.put(`/api/v1/admin/series/garbage/${inspectingSource.value.id}/identify`, payload, auth())
    
    if (res.data.ingest_status === 'garbage' || !res.data.series_id) {
      addToast('Provider did not confirm. Series remains in Garbage.', 'info')
      providerMatch.value = {
        found: false,
        message: res.data.error || 'Identity not found via providers.'
      }
    } else {
      addToast(`Success: series ${res.data.ingest_status}`, 'success')
      providerMatch.value = {
        found: true,
        series_id: res.data.series_id,
        title: res.data.series_title || identifyTitle.value,
        year: res.data.series_year || identifyYear.value,
        poster_url: res.data.poster_url,
        overview: res.data.overview,
        provider: res.data.provider || 'Provider',
        provider_id: res.data.provider_id
      }
      setTimeout(() => {
        closeInspect()
        fetchGarbage()
      }, 1800)
    }
  } catch (err: any) {
    addToast(err.response?.data?.detail || err.response?.data?.error || 'Failed to identify series', 'error')
  } finally {
    identifying.value = false
  }
}

const submitBulkDelete = async () => {
  if (selectedIds.value.length === 0) return
  bulkDeleting.value = true
  try {
    const res = await axios.post('/api/v1/admin/series/garbage/bulk', { garbage_ids: selectedIds.value }, auth())
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
    const res = await axios.post('/api/v1/admin/series/garbage/delete-all', null, auth())
    addToast(`${res.data.deleted} sources deleted`, 'success')
    showDeleteAllModal.value = false
    fetchGarbage()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete all sources', 'error')
  } finally {
    bulkDeleting.value = false
  }
}

const changePage = (p: number) => {
  page.value = p
  fetchGarbage()
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B'
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
        <h1>Series Garbage</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} unresolved Series TV candidates requiring manual resolution</p>
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
        <h2>Series Garbage #{{ inspectingSource.message_id }}</h2>
      </div>

      <div class="inspect-content">
        <div class="main-inspect-column">
          <div class="video-container" v-if="streamToken">
            <div class="admin-watermark">ADMIN SERIES PLAYER</div>
            <video 
              controls 
              preload="metadata"
              :src="mediaUrl"
              class="admin-video-player"
            ></video>
          </div>
          <div class="no-stream-placeholder" v-else>
            <div class="placeholder-icon">📺</div>
            <p>No direct video stream active for candidate header</p>
          </div>

          <!-- PHYSICAL RESOURCES CARD -->
          <div class="card resources-card" v-if="inspectItems.length > 0">
            <h3>Physical Resources ({{ inspectItems.length }})</h3>
            <p class="sub-text">Physical Telegram messages attached to this Series Garbage candidate.</p>
            
            <div class="resources-table-wrapper">
              <table class="responsive-data record-table resources-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Message ID</th>
                    <th>Season</th>
                    <th>Episode</th>
                    <th>Size</th>
                    <th>Raw Caption</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in inspectItems" :key="item.id">
                    <td class="code-val" data-label="Channel" role="cell">{{ item.channel_id }}</td>
                    <td data-label="Message ID" role="cell">
                      <a :href="'https://t.me/' + item.channel_id + '/' + item.message_id" target="_blank" class="tg-link">
                        {{ item.message_id }}
                      </a>
                    </td>
                    <td class="input-cell" data-label="Season" role="cell">
                      <input type="number" v-model.number="item.season_number" min="1" class="small-num-input" />
                    </td>
                    <td class="input-cell" data-label="Episode" role="cell">
                      <span v-if="item.episode_number == null">Сборник: отдельные серии не поддерживаются</span>
                      <input v-else type="number" v-model.number="item.episode_number" min="1" class="small-num-input" />
                      <p v-if="item.review_reason" class="sub-text">{{ item.review_reason }}</p>
                    </td>
                    <td class="code-val" data-label="Size" role="cell">{{ formatBytes(item.file_size) }}</td>
                    <td class="caption-cell" :title="item.raw_caption" data-label="Raw Caption" role="cell">{{ item.raw_caption || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="inspect-sidebar">
          <div class="card info-card">
            <h3>Metadata</h3>
            <ul class="meta-list">
              <li><strong>Channel:</strong> {{ inspectingSource.channel_id }}</li>
              <li><strong>Message ID:</strong> {{ inspectingSource.message_id }}</li>
              <li><strong>Resources:</strong> {{ inspectItems.length || 1 }} file(s)</li>
              <li><strong>File Size:</strong> {{ formatBytes(inspectingSource.file_size) }}</li>
              <li><strong>MIME:</strong> {{ inspectingSource.mime_type || 'video/mp4' }}</li>
              <li><strong>Date:</strong> {{ new Date(inspectingSource.created_at).toLocaleString() }}</li>
            </ul>
          </div>

          <div class="card edit-card">
            <h3>Identify Series</h3>
            <p class="sub-text">Watch physical media and correct identification data.</p>
            
            <div class="form-group readonly-group">
              <label>Original Telegram Caption</label>
              <div class="readonly-text">{{ inspectingSource.raw_caption || 'No Telegram caption' }}</div>
            </div>

            <div class="form-group">
              <label>Series Title <span style="color:#ef4444">*</span></label>
              <input type="text" v-model="identifyTitle" class="form-input" placeholder="Series title (e.g. 1899)" />
            </div>

            <div class="form-group">
              <label>Year</label>
              <input type="number" v-model.number="identifyYear" class="form-input" placeholder="e.g. 2022" />
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label>Season</label>
                <input type="number" v-model.number="identifySeason" class="form-input" min="1" placeholder="1" />
              </div>
              <div class="form-group flex-1">
                <label>Episode</label>
                <input type="number" v-model.number="identifyEpisode" class="form-input" min="1" placeholder="1" />
              </div>
            </div>

            <button class="btn-submit" style="width: 100%; margin-top: 14px;" @click="submitIdentify" :disabled="identifying">
              {{ identifying ? 'Processing...' : 'Save & Resolve Identity' }}
            </button>
          </div>

          <!-- PROVIDER MATCH CARD -->
          <div v-if="providerMatch" class="card provider-match-card" :class="{ 'match-found': providerMatch.found, 'match-failed': !providerMatch.found }">
            <h3 v-if="providerMatch.found">Found Series</h3>
            <h3 v-else>Provider Match Failed</h3>

            <div v-if="providerMatch.found" class="match-details">
              <img v-if="providerMatch.poster_url" :src="providerMatch.poster_url" class="match-poster" />
              <div class="match-info">
                <div class="match-title">{{ providerMatch.title }} ({{ providerMatch.year || 'N/A' }})</div>
                <div class="match-provider">
                  <span class="provider-badge">{{ providerMatch.provider }}</span>
                  <span class="provider-id" v-if="providerMatch.provider_id">ID: {{ providerMatch.provider_id }}</span>
                </div>
                <p class="match-overview" v-if="providerMatch.overview">{{ providerMatch.overview }}</p>
              </div>
            </div>
            <div v-else class="match-error">
              <p>{{ providerMatch.message }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- EMPTY STATE -->
    <div v-else-if="sources.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
      <h3>No Series Garbage Candidates</h3>
      <p>Clean database state. All Series TV content identified.</p>
    </div>

    <!-- LIST VIEW -->
    <div v-else>
      <div class="bulk-actions" v-if="sources.length > 0">
        <span class="selected-count">Selected: {{ selectedIds.length }}</span>
        <button class="btn-bulk-delete" :disabled="selectedIds.length === 0" @click="showBulkDeleteModal = true">Delete Selected</button>
        <button class="btn-delete-all" @click="showDeleteAllModal = true">Delete All Garbage</button>
      </div>

      <div class="table-container">
        <table class="responsive-data selectable-data record-table data-table">
          <thead>
            <tr>
              <th class="cell-checkbox">
                <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
              </th>
              <th>Channel</th>
              <th>Message ID</th>
              <th>Original Caption</th>
              <th>Identification Title</th>
              <th>Year</th>
              <th>Episodes</th>
              <th>Resources</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="source in sources" :key="source.id" class="table-row clickable-row" @click="openInspect(source)">
              <td class="cell-checkbox" @click.stop data-label="Выбрать" role="cell">
                <input type="checkbox" :value="source.id" v-model="selectedIds" />
              </td>
              <td class="channel-col" data-label="Channel" role="cell">{{ source.channel_id }}</td>
              <td class="cell-narrow" data-label="Message ID" role="cell">
                <a :href="'https://t.me/' + source.channel_id + '/' + source.message_id" target="_blank" class="tg-link" @click.stop>
                  {{ source.message_id }}
                </a>
              </td>
              <td class="cell-narrow" data-label="Original Caption" role="cell">{{ source.raw_caption || 'No Telegram caption' }}</td>
              <td class="cell-narrow font-semibold" data-label="Identification Title" role="cell">{{ source.identification_title || '-' }}<p v-if="source.review_reason" class="sub-text">{{ source.review_reason }}</p></td>
              <td class="cell-narrow" data-label="Year" role="cell">{{ source.identification_year || '-' }}</td>
              <td class="cell-narrow" data-label="Episodes" role="cell">
                <span class="resources-badge">{{ source.episode_count === 0 ? "Не определены" : (source.episode_count ?? source.episodes_count ?? 1) }}</span>
              </td>
              <td class="cell-narrow" data-label="Resources" role="cell">
                <span class="resources-badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">{{ source.resource_count || (source.items ? source.items.length : 1) }}</span>
              </td>
              <td class="cell-actions" @click.stop data-label="Actions" role="cell">
                <button class="btn-primary" @click="openInspect(source)" style="margin-right: 8px;">Inspect</button>
                <button class="btn-poster" @click="openDeleteModal(source.id)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pages > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="changePage(page - 1)">← Prev</button>
        <span class="page-info">Page {{ page }} of {{ pages }} (Total: {{ total }})</span>
        <button class="page-btn" :disabled="page >= pages" @click="changePage(page + 1)">Next →</button>
      </div>
    </div>

    <!-- Delete modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Delete Series Garbage Source</h3>
          <button class="modal-close" @click="showDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">Are you sure you want to permanently delete this unresolved series candidate?</p>
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
          <h3>Delete {{ selectedIds.length }} Series Sources?</h3>
          <button class="modal-close" @click="showBulkDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">These series garbage candidates will be permanently removed.</p>
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
          <h3>Delete ALL {{ total }} Series Garbage Candidates?</h3>
          <button class="modal-close" @click="showDeleteAllModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-text" style="color: #ef4444; font-weight: bold;">Warning: This is a highly destructive action.</p>
          <p class="sub-text">This will permanently delete all unresolved series candidates.</p>
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
.garbage-page { max-width: 1240px; margin: 0 auto; }

.page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: var(--ui-text); }
.page-subtitle { margin: 0; color: var(--ui-link); font-size: 0.875rem; }

.search-box {
  display: flex;
  gap: 8px;
  min-width: 320px;
}

.search-box input {
  flex: 1;
  padding: 10px 16px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: white;
  outline: none;
}

.search-box input:focus {
  border-color: var(--ui-control);
}

.search-box button {
  padding: 8px 16px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  border-radius: var(--ui-radius);
  font-weight: 600;
  cursor: pointer;
}

.search-box button:hover:not(:disabled) {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
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
  color: var(--ui-text);
}

.inspect-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.main-inspect-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.video-container {
  background: var(--ui-bg);
  border-radius: var(--ui-radius);
  overflow: hidden;
  position: relative;
  border: 1px solid var(--ui-border);
  box-shadow: none;
}

.no-stream-placeholder {
  background: var(--ui-raised);
  border: 1px dashed var(--ui-control);
  border-radius: var(--ui-radius);
  padding: 40px 20px;
  text-align: center;
  color: var(--ui-link);
}

.placeholder-icon {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.admin-watermark {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(220, 38, 38, 0.8);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
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
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 20px;
}

.card h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: var(--ui-text);
}

.sub-text {
  font-size: 0.85rem;
  color: var(--ui-link);
  margin-bottom: 14px;
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
  color: var(--ui-secondary);
}

.meta-list strong {
  color: var(--ui-link);
  width: 100px;
  display: inline-block;
}

.readonly-group {
  background: rgba(0,0,0,0.2);
  padding: 12px;
  border-radius: var(--ui-radius);
  border: 1px dashed var(--ui-border);
  margin-bottom: 14px;
}

.readonly-group label {
  font-size: 0.8rem;
  color: var(--ui-link);
  display: block;
  margin-bottom: 4px;
}

.readonly-text {
  color: var(--ui-secondary);
  font-family:var(--ui-font);
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group label {
  font-size: 0.85rem;
  color: var(--ui-secondary);
  font-weight: 500;
}

.form-input {
  padding: 8px 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: white;
  outline: none;
  font-size: 0.9rem;
}

.form-input:focus {
  border-color: var(--ui-control);
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 { flex: 1; }

/* Provider Match Card */
.provider-match-card {
  border-left: 4px solid var(--ui-control);
}

.match-found {
  border-left-color: var(--ui-success);
}

.match-failed {
  border-left-color: var(--ui-warning);
}

.match-details {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.match-poster {
  width: 70px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-border);
}

.match-info {
  flex: 1;
}

.match-title {
  font-weight: 700;
  color: var(--ui-text);
  font-size: 1rem;
  margin-bottom: 4px;
}

.match-provider {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.provider-badge {
  background: var(--ui-raised);
  color: var(--ui-link);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}

.provider-id {
  color: var(--ui-link);
  font-size: 12px;
  font-family:var(--ui-font);
}

.match-overview {
  font-size: 0.8rem;
  color: var(--ui-link);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.match-error {
  color: var(--ui-warning);
  font-size: 0.875rem;
}

/* RESOURCES TABLE */
.resources-card {
  overflow: hidden;
}

.resources-table-wrapper {
  overflow-x: auto;
}

.resources-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}

.resources-table th {
  padding: 8px 12px;
  text-align: left;
  font-size: 12px;
  color: var(--ui-link);
  text-transform: uppercase;
  border-bottom: 1px solid var(--ui-border);
}

.resources-table td {
  padding: 10px 12px;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--ui-border);
}

.code-val {
  font-family:var(--ui-font);
  color: var(--ui-secondary);
}

.tg-link {
  color: var(--ui-link);
  text-decoration: none;
  font-weight: 600;
}

.tg-link:hover { text-decoration: underline; }

.small-num-input {
  width: 60px;
  padding: 4px 8px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  border-radius: 4px;
  color: white;
  text-align: center;
}

.caption-cell {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-link);
  font-size: 0.8rem;
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
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}
.selected-count { color: var(--ui-text); font-weight: 600; font-size: 0.9rem; margin-right: auto; }
.btn-bulk-delete {
  background: var(--ui-danger-bg); color: white; border: none; padding: 8px 16px; border-radius: var(--ui-radius); font-weight: 600; cursor: pointer; transition: background 0.2s;
}
.btn-bulk-delete:hover:not(:disabled) { background: var(--ui-danger-bg); }
.btn-bulk-delete:disabled { background: var(--ui-raised); color: var(--ui-text); cursor: not-allowed; }

.btn-delete-all {
  background: transparent; color: var(--ui-danger); border: 1px solid var(--ui-danger); padding: 8px 16px; border-radius: var(--ui-radius); font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-delete-all:hover { background: var(--ui-danger-bg); }

.cell-checkbox { width: 40px; text-align: center; }
.cell-checkbox input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; accent-color: var(--ui-link); }

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

.data-table { width: 100%; border-collapse: collapse; }

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

.table-row { border-bottom: 1px solid var(--ui-border); transition: background 0.1s; }
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--ui-raised); }

.data-table td { padding: 14px 16px; }
.cell-narrow { color: var(--ui-link); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }
.font-semibold { font-weight: 600; color: var(--ui-text); }
.channel-col {
  white-space: nowrap;
  color: var(--ui-link);
  font-size: 0.85rem;
}
.cell-actions { white-space: nowrap; }

.resources-badge {
  background: var(--ui-raised);
  color: var(--ui-link);
  padding: 3px 8px;
  border-radius: var(--ui-radius);
  font-size: 0.8rem;
  font-weight: 700;
}

.btn-primary {
  padding: 6px 14px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}
.btn-primary:hover { background: var(--ui-primary); color: var(--ui-on-primary); }

.btn-poster {
  padding: 6px 14px;
  background: var(--ui-danger-bg);
  border: 1px solid var(--ui-danger-bg);
  color: var(--ui-danger);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-poster:hover { background: var(--ui-danger-bg); }

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

.modal-header h3 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--ui-text); }

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

.warning-text { color: var(--ui-text); font-size: 0.95rem; margin: 0; }

.btn-cancel-modal {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-cancel-modal:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--ui-border);
}

.btn-submit {
  padding: 8px 20px;
  background: var(--ui-primary);
  border: none;
  border-radius: var(--ui-radius);
  color: var(--ui-on-primary);
  font-weight: 700;
  cursor: pointer;
}
.btn-submit:hover:not(:disabled) { background: var(--ui-primary); color: var(--ui-on-primary); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.delete-btn {
  background: var(--ui-danger-bg);
  color: white;
}
.delete-btn:hover:not(:disabled) { background: var(--ui-danger-bg); }
</style>
