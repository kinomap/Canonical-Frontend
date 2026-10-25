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
const search = ref('')
const loading = ref(true)
const unblocking = ref<string | null>(null)

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchBlocked = async () => {
  loading.value = true
  try {
    const params: any = { status: 'blocked', page: page.value, limit }
    if (search.value.trim()) params.search = search.value.trim()
    const res = await axios.get('/api/v1/admin/movies', { ...auth(), params })
    movies.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load blocked movies', 'error')
    }
  } finally {
    loading.value = false
  }
}

const unblock = async (movie: any) => {
  unblocking.value = movie.id
  try {
    await axios.post(`/api/v1/admin/movies/${movie.id}/unblock`, {}, auth())
    movies.value = movies.value.filter(m => m.id !== movie.id)
    total.value = Math.max(0, total.value - 1)
    addToast(`"${movie.title}" unblocked`, 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to unblock', 'error')
  } finally {
    unblocking.value = null
  }
}

const totalPages = () => Math.max(1, Math.ceil(total.value / limit))

const changePage = (p: number) => {
  page.value = p
  fetchBlocked()
}

let searchTimer: ReturnType<typeof setTimeout>
const onSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; fetchBlocked() }, 350)
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : 'Unknown'

onMounted(fetchBlocked)
</script>

<template>
  <div class="blocked-page">
    <div class="page-header">
      <div>
        <h1>Blocked Movies</h1>
        <p class="page-subtitle">{{ total.toLocaleString() }} blocked movie{{ total !== 1 ? 's' : '' }}</p>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input v-model="search" @input="onSearch" class="search-input" placeholder="Search blocked movies..." />
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading...</span>
    </div>

    <div v-else-if="movies.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      <h3>No blocked movies</h3>
      <p>All movies are currently accessible.</p>
    </div>

    <div v-else>
      <div class="table-container">
        <table class="responsive-data record-table data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Year</th>
              <th>Block Reason</th>
              <th>Blocked At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movie in movies" :key="movie.id" class="table-row">
              <td class="cell-title" data-label="Title" role="cell">
                <span class="title-text">{{ movie.title }}</span>
                <span v-if="movie.original_title !== movie.title" class="title-orig">{{ movie.original_title }}</span>
              </td>
              <td class="cell-narrow" data-label="Year" role="cell">{{ movie.year || '—' }}</td>
              <td class="cell-reason" data-label="Block Reason" role="cell">{{ movie.block_reason || '—' }}</td>
              <td class="cell-narrow" data-label="Blocked At" role="cell">{{ formatDate(movie.blocked_at) }}</td>
              <td class="cell-actions" data-label="Actions" role="cell">
                <button
                  class="btn-unblock"
                  @click="unblock(movie)"
                  :disabled="unblocking === movie.id"
                >
                  {{ unblocking === movie.id ? 'Unblocking...' : 'Unblock' }}
                </button>
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
  </div>
</template>

<style scoped>
.blocked-page { max-width: 1200px; }

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 4px;
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--ui-text);
}

.page-subtitle { margin: 0; color: var(--ui-link); font-size: 0.875rem; }

.toolbar {
  margin-bottom: 20px;
}

.search-wrap {
  position: relative;
  max-width: 340px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ui-link);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus { border-color: var(--ui-control); }

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

.data-table {
  width: 100%;
  border-collapse: collapse;
}

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

.table-row {
  border-bottom: 1px solid var(--ui-border);
  transition: background 0.1s;
}

.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--ui-raised); }

.data-table td { padding: 14px 16px; }

.cell-title { max-width: 300px; }
.title-text { font-weight: 600; color: var(--ui-text); display: block; }
.title-orig { font-size: 0.8rem; color: var(--ui-link); }

.cell-narrow { color: var(--ui-link); font-size: 0.85rem; white-space: nowrap; }
.cell-reason { color: var(--ui-danger); font-size: 0.85rem; max-width: 240px; }

.cell-actions { white-space: nowrap; }

.btn-unblock {
  padding: 6px 14px;
  background: var(--ui-success-bg);
  border: 1px solid var(--ui-success-bg);
  color: var(--ui-success);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
  margin-right: 6px;
}

.btn-unblock:hover:not(:disabled) {
  background: var(--ui-success-bg);
}

.btn-unblock:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-view {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
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
</style>
