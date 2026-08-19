<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'

const router = useRouter()
const comments = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const limit = 25
const loading = ref(true)

// Filters
const filterMovie = ref('')
const filterUser = ref('')
const filterText = ref('')
const filterStatus = ref('all') // 'all', 'visible', 'hidden'

// Edit state
const editingId = ref<string | null>(null)
const editingText = ref('')
const saving = ref(false)

// Delete confirm
const confirmDeleteId = ref<string | null>(null)

// Menu state
const openMenuId = ref<string | null>(null)
const toggleMenu = (id: string) => { openMenuId.value = openMenuId.value === id ? null : id }

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchComments = async () => {
  loading.value = true
  try {
    const params: any = { page: page.value, limit }
    if (filterMovie.value.trim()) params.movie_title = filterMovie.value.trim()
    if (filterUser.value.trim()) params.username = filterUser.value.trim()
    if (filterText.value.trim()) params.text = filterText.value.trim()
    if (filterStatus.value === 'hidden') params.hidden_only = true
    if (filterStatus.value === 'visible') params.visible_only = true

    const res = await axios.get('/api/v1/admin/comments', { ...auth(), params })
    comments.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load comments', 'error')
    }
  } finally {
    loading.value = false
  }
}

const startEdit = (comment: any) => {
  editingId.value = comment.id
  editingText.value = comment.text
}

const saveEdit = async (comment: any) => {
  if (!editingText.value.trim()) return addToast('Comment text cannot be empty', 'error')
  saving.value = true
  try {
    await axios.put(`/api/v1/admin/comments/${comment.id}`, { text: editingText.value.trim() }, auth())
    comment.text = editingText.value.trim()
    editingId.value = null
    addToast('Comment updated', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update comment', 'error')
  } finally {
    saving.value = false
  }
}

const toggleHide = async (comment: any) => {
  const action = comment.is_hidden ? 'restore' : 'hide'
  try {
    await axios.post(`/api/v1/admin/comments/${comment.id}/${action}`, {}, auth())
    comment.is_hidden = !comment.is_hidden
    addToast(comment.is_hidden ? 'Comment hidden' : 'Comment restored', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed', 'error')
  }
}

const deleteComment = async (id: string) => {
  try {
    await axios.delete(`/api/v1/admin/comments/${id}`, auth())
    comments.value = comments.value.filter(c => c.id !== id)
    total.value = Math.max(0, total.value - 1)
    confirmDeleteId.value = null
    addToast('Comment deleted', 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete', 'error')
  }
}

const totalPages = () => Math.max(1, Math.ceil(total.value / limit))
const changePage = (p: number) => { page.value = p; fetchComments() }

let filterTimer: ReturnType<typeof setTimeout>
const onFilterChange = () => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => { page.value = 1; fetchComments() }, 350)
}

const formatDate = (d: string) => new Date(d).toLocaleString()

onMounted(() => {
  fetchComments()
  document.addEventListener('click', () => { openMenuId.value = null })
})
</script>

<template>
  <div class="comments-page">
    <div class="page-header">
      <div>
        <h1>Comments</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} comment{{ total !== 1 ? 's' : '' }}</p>
      </div>
    </div>

    <div class="filters-bar">
      <div class="filter-item">
        <input v-model="filterMovie" @input="onFilterChange" class="filter-input" placeholder="Filter by movie..." />
      </div>
      <div class="filter-item">
        <input v-model="filterUser" @input="onFilterChange" class="filter-input" placeholder="Filter by user..." />
      </div>
      <div class="filter-item">
        <input v-model="filterText" @input="onFilterChange" class="filter-input" placeholder="Filter by text..." />
      </div>
      <div class="filter-pills">
        <button class="pill" :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'; onFilterChange()">All</button>
        <button class="pill" :class="{ active: filterStatus === 'visible' }" @click="filterStatus = 'visible'; onFilterChange()">Visible</button>
        <button class="pill" :class="{ active: filterStatus === 'hidden' }" @click="filterStatus = 'hidden'; onFilterChange()">Hidden</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading comments...</span>
    </div>

    <div v-else-if="comments.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <h3>No comments found</h3>
      <p>Try adjusting your filters.</p>
    </div>

    <div v-else>
      <div class="comments-list">
        <div
          v-for="comment in comments"
          :key="comment.id"
          class="comment-card"
          :class="{ 'card-hidden': comment.is_hidden }"
        >
          <div class="comment-header">
            <div class="comment-meta">
              <span class="comment-user">{{ comment.username }}</span>
              <span class="comment-date">{{ formatDate(comment.created_at) }}</span>
              <span class="status-pill" :class="comment.is_hidden ? 'hidden-pill' : 'visible-pill'">
                {{ comment.is_hidden ? 'Hidden' : 'Visible' }}
              </span>
            </div>
            <div class="comment-movie-title">
              🎬 <button class="movie-link" @click="router.push(`/movies/${comment.movie_id}`)">{{ comment.movie_title }}</button>
            </div>
          </div>
          
          <div class="comment-body">
            <div v-if="editingId !== comment.id">
              <p class="comment-text" :class="{ 'text-hidden': comment.is_hidden }">{{ comment.text }}</p>
            </div>
            <div v-else class="edit-inline">
              <textarea
                v-model="editingText"
                class="edit-textarea"
                rows="3"
                @keydown.escape="editingId = null"
              ></textarea>
              <div class="edit-actions">
                <button class="btn-save-sm" @click="saveEdit(comment)" :disabled="saving">
                  {{ saving ? '...' : 'Save' }}
                </button>
                <button class="btn-cancel-sm" @click="editingId = null">Cancel</button>
              </div>
            </div>
          </div>

          <div class="comment-actions-menu" @click.stop>
            <button class="menu-trigger-btn" @click="toggleMenu(comment.id)">⋮</button>
            <div v-if="openMenuId === comment.id" class="menu-dropdown">
              <button v-if="editingId !== comment.id" class="menu-item" @click="startEdit(comment); openMenuId = null">Edit</button>
              <button class="menu-item" @click="toggleHide(comment); openMenuId = null">
                {{ comment.is_hidden ? 'Show' : 'Hide' }}
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item text-danger" @click="confirmDeleteId = comment.id; openMenuId = null">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="totalPages() > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="changePage(page - 1)">← Prev</button>
        <span class="page-info">Page {{ page }} of {{ totalPages() }}</span>
        <button class="page-btn" :disabled="page >= totalPages()" @click="changePage(page + 1)">Next →</button>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-if="confirmDeleteId" class="modal-overlay" @click.self="confirmDeleteId = null">
      <div class="modal-confirm">
        <h3>Delete Comment?</h3>
        <p>This action cannot be undone.</p>
        <div class="confirm-actions">
          <button class="btn-cancel-confirm" @click="confirmDeleteId = null">Cancel</button>
          <button class="btn-delete-confirm" @click="deleteComment(confirmDeleteId!)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comments-page { max-width: 1400px; }

.page-header { margin-bottom: 24px; }
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: #f8fafc; }
.page-subtitle { margin: 0; color: #64748b; font-size: 0.875rem; }

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
}

.filter-item { flex: 1; min-width: 160px; max-width: 240px; }

.filter-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.filter-input:focus { border-color: #38bdf8; }

.filter-pills { display: flex; gap: 8px; }
.pill {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}
.pill:hover { border-color: #475569; color: #f1f5f9; }
.pill.active { background: #38bdf8; border-color: #38bdf8; color: #0f172a; font-weight: 600; }

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

.empty-state h3 { margin: 0; color: #94a3b8; font-size: 1.1rem; }
.empty-state p { margin: 0; font-size: 0.875rem; }

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-card {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  position: relative;
  gap: 12px;
  transition: all 0.2s;
}

.comment-card:hover {
  border-color: rgba(255,255,255,0.1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.card-hidden {
  opacity: 0.6;
}

.comment-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-user {
  font-weight: 700;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.comment-movie-title {
  font-size: 0.85rem;
  color: #94a3b8;
}

.movie-link {
  background: none;
  border: none;
  color: #38bdf8;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  padding: 0;
}
.movie-link:hover { text-decoration: underline; }

.cell-user { color: #94a3b8; font-size: 0.85rem; white-space: nowrap; }

.cell-comment { max-width: 340px; }
.comment-text {
  margin: 0;
  font-size: 0.875rem;
  color: #cbd5e1;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 4.5em;
  overflow: hidden;
}

.text-hidden { color: #64748b; font-style: italic; }

.edit-inline { display: flex; flex-direction: column; gap: 6px; }

.edit-textarea {
  width: 100%;
  padding: 8px;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 0.875rem;
  resize: vertical;
  outline: none;
  font-family: inherit;
}

.edit-actions { display: flex; gap: 6px; }

.btn-save-sm {
  padding: 4px 12px;
  background: #38bdf8;
  border: none;
  border-radius: 5px;
  color: #0f172a;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-cancel-sm {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid #334155;
  border-radius: 5px;
  color: #64748b;
  font-size: 0.8rem;
  cursor: pointer;
}

.comment-actions-menu {
  position: absolute;
  top: 16px;
  right: 16px;
}
.menu-trigger-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.menu-trigger-btn:hover {
  background: rgba(255,255,255,0.05);
  color: #e2e8f0;
}
.menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 4px;
  min-width: 120px;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
  z-index: 10;
}
.menu-item {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 0.85rem;
  border-radius: 4px;
  cursor: pointer;
}
.menu-item:hover { background: #334155; }
.menu-divider { height: 1px; background: #334155; margin: 4px 0; }
.text-danger { color: #f87171 !important; }
.text-danger:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.visible-pill { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.hidden-pill { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }

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

.modal-confirm {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

.modal-confirm h3 { margin: 0 0 8px; font-size: 1.05rem; }
.modal-confirm p { margin: 0 0 20px; color: #64748b; font-size: 0.875rem; }

.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }

.btn-cancel-confirm {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-delete-confirm {
  padding: 8px 20px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;
  transition: all 0.15s;
}

.btn-delete-confirm:hover { background: rgba(239, 68, 68, 0.25); }
</style>
