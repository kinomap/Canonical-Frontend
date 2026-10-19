<script setup lang="ts">
import ContentAccessSwitch from '../components/ContentAccessSwitch.vue'
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const route = useRoute()

const isAvailableMode = computed(() => route.path === '/series')

const series = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const total = ref(0)

const page = ref(1)
const limit = ref(20)
const search = ref('')
const statusFilter = ref('all')
const withoutPoster = ref(false)
const withoutTmdb = ref(false)

let abortController: AbortController | null = null

const fetchSeries = async () => {
  if (abortController) {
    abortController.abort()
  }
  abortController = new AbortController()
  const signal = abortController.signal

  loading.value = true
  error.value = ''
  
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }
  
  try {
    const params = new URLSearchParams()
    params.append('page', page.value.toString())
    params.append('limit', limit.value.toString())
    
    if (search.value.trim()) {
      params.append('search', search.value.trim())
    }
    
    if (isAvailableMode.value) {
      params.append('status', 'available')
      params.append('include_unavailable', 'false')
    } else {
      if (statusFilter.value && statusFilter.value !== 'all') {
        params.append('status', statusFilter.value)
      }
      params.append('include_unavailable', 'true')
    }

    if (withoutPoster.value) {
      params.append('without_poster', 'true')
    }
    if (withoutTmdb.value) {
      params.append('without_tmdb', 'true')
    }

    const res = await axios.get(`/api/v1/admin/series?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal
    })
    
    series.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (axios.isCancel(err)) return
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      error.value = 'Failed to load series.'
    }
  } finally {
    if (!abortController?.signal.aborted) {
      loading.value = false
    }
  }
}

watch([page, limit, statusFilter, withoutPoster, withoutTmdb], () => {
  fetchSeries()
})

let searchTimer: any = null

const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchSeries()
  }, 250)
}

const handleSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  page.value = 1
  fetchSeries()
}

const resetFilters = () => {
  search.value = ''
  statusFilter.value = 'all'
  withoutPoster.value = false
  withoutTmdb.value = false
  page.value = 1
  fetchSeries()
}

const goToDetail = (id: string) => {
  router.push(`/series/${id}`)
}


onMounted(() => {
  fetchSeries()
})
</script>

<template>
  <div class="series-page">
    <header class="page-header">
      <h1>{{ isAvailableMode ? 'Available Series' : 'Canonical Series Metadata' }}</h1>
    </header>

    <div class="filters-bar">
      <div class="search-box">
        <input 
          type="text" 
          v-model="search" 
          @input="onSearchInput"
          @keyup.enter="handleSearch" 
          placeholder="Search by title, original title or year..." 
        />
        <button @click="handleSearch">Search</button>
      </div>

      <div class="filter-controls">
        <select v-model="statusFilter" v-if="!isAvailableMode">
          <option value="all">All Statuses</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>

        <label class="checkbox-label">
          <input type="checkbox" v-model="withoutPoster" />
          Without Poster
        </label>
        
        <label class="checkbox-label">
          <input type="checkbox" v-model="withoutTmdb" />
          Without TMDB
        </label>
        
        <button @click="resetFilters" class="btn-secondary">Reset</button>
      </div>
    </div>

    <div v-if="error" class="error-msg">
      {{ error }}
    </div>

    <div class="table-container">
      <table class="series-table">
        <thead>
          <tr>
            <th class="poster-col">Poster</th>
            <th class="title-col">Title</th>
            <th class="year-col">Year</th>
            <th class="rating-col">Rating</th>
            <th class="tmdb-col">TMDB ID</th>
            <th class="sources-col">Sources</th>
            <th class="poster-status-col">Poster Status</th>
            <th class="status-col">Status</th>
            <th>Доступ</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && series.length === 0">
            <td colspan="10" class="loading-cell">Loading...</td>
          </tr>
          <tr v-else-if="series.length === 0">
            <td colspan="10" class="empty-cell">No series found matching criteria.</td>
          </tr>
          <tr v-else v-for="s in series" :key="s.id" @click="goToDetail(s.id)" class="series-row">
            <td class="poster-col">
              <img v-if="s.poster || s.poster_url" :src="s.poster_url || s.poster" class="mini-real-poster" />
              <div v-else class="mini-poster-fallback">
                <div class="fallback-title">{{ s.title }}</div>
                <div class="fallback-year">{{ s.year || 'N/A' }}</div>
              </div>
            </td>
            <td class="title-col">
              <div class="title-main" :title="s.title">{{ s.title }}</div>
              <div class="title-sub" :title="s.original_title">{{ s.original_title }}</div>
            </td>
            <td class="year-col">{{ s.year || '-' }}</td>
            <td class="rating-col">{{ s.rating || '-' }}</td>
            <td class="tmdb-col">{{ s.tmdb_id || '-' }}</td>
            <td class="sources-col">{{ s.telegram_sources_count }}</td>
            <td class="compact-col">
              <span class="badge" :class="{'badge-green': s.poster_status === 'Available', 'badge-yellow': s.poster_status === 'Missing'}">
                {{ s.poster_status === 'Available' ? '✓ Present' : '⚠ Missing' }}
              </span>
            </td>
            <td class="status-col">
              <span class="badge" :class="(s.status === 'available' || s.is_available) ? 'badge-green' : 'badge-red'">
                {{ (s.status === 'available' || s.is_available) ? 'available' : 'unavailable' }}
              </span>
            </td>
            <td @click.stop><ContentAccessSwitch kind="series" :content-id="s.id" /></td>
            <td class="actions-col">
              <div class="actions-cell">
                <a 
                  v-if="(s.poster || s.poster_url)"
                  :href="s.poster_url || s.poster"
                  target="_blank"
                  class="btn-action btn-poster"
                  title="View Poster"
                  @click.stop
                >👁 Poster</a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button :disabled="page <= 1" @click="page--">Previous</button>
      <span>Page {{ page }} (Total: {{ total }})</span>
      <button :disabled="page * limit >= total" @click="page++">Next</button>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.8rem;
  color: #f8fafc;
}

.filters-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #1e293b;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #334155;
  margin-bottom: 24px;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  flex: 1;
  padding: 10px 16px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  outline: none;
}

.search-box input:focus {
  border-color: #38bdf8;
}

button {
  padding: 8px 16px;
  background: #38bdf8;
  color: #0f172a;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #7dd3fc;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #475569;
  color: #f1f5f9;
}
.btn-secondary:hover:not(:disabled) {
  background: #64748b;
}

.filter-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

select {
  padding: 8px 12px;
  background: #0f172a;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #cbd5e1;
  cursor: pointer;
}

.table-container {
  background: #1e293b;
  border-radius: 8px;
  border: 1px solid #334155;
  overflow: hidden;
}

.series-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.series-table th, .series-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #334155;
  vertical-align: middle;
}

.poster-col {
  width: 50px;
}

.title-col {
  width: auto;
  min-width: 0;
}

.year-col {
  width: 60px;
}

.rating-col {
  width: 70px;
}

.tmdb-col {
  width: 90px;
}

.sources-col {
  width: 80px;
}

.poster-status-col {
  width: 120px;
}

.status-col {
  width: 100px;
}

.actions-col {
  width: 120px;
}

.series-table th {
  background: #0f172a;
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
}

.series-row {
  cursor: pointer;
  transition: background 0.2s;
}

.series-row:hover {
  background: #334155;
}

.title-main {
  font-weight: 600;
  color: #f8fafc;
  font-size: 0.95rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-sub {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loading-cell, .empty-cell {
  text-align: center;
  padding: 32px !important;
  color: #94a3b8;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #334155;
  color: #cbd5e1;
}

.badge-green { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
.badge-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.badge-yellow { background: rgba(250, 204, 21, 0.2); color: #facc15; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  color: #94a3b8;
}

/* Mini Real Poster */
.mini-real-poster {
  width: 40px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

/* Mini Branded Poster Fallback */
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
  border: 1px solid #475569;
  position: relative;
  overflow: hidden;
}

.fallback-title {
  font-size: 0.5rem;
  font-weight: 800;
  color: #e2e8f0;
  text-transform: uppercase;
  line-height: 1.1;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fallback-year {
  font-size: 0.45rem;
  color: #94a3b8;
  margin-top: 4px;
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-poster {
  background-color: rgba(74, 222, 128, 0.1);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.btn-poster:hover {
  background-color: rgba(74, 222, 128, 0.2);
}

.actions-cell {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
</style>
