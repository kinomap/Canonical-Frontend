<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const movies = ref<any[]>([])
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

const fetchMovies = async () => {
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
    if (statusFilter.value && statusFilter.value !== 'all') {
      params.append('status', statusFilter.value)
    }
    if (withoutPoster.value) {
      params.append('without_poster', 'true')
    }
    if (withoutTmdb.value) {
      params.append('without_tmdb', 'true')
    }
    
    // Core difference: we want ALL canonical metadata regardless of sources
    params.append('include_unavailable', 'true')

    const res = await axios.get(`/api/v1/admin/movies?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal
    })
    
    movies.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (axios.isCancel(err)) return
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      error.value = 'Failed to load movies.'
    }
  } finally {
    if (!abortController?.signal.aborted) {
      loading.value = false
    }
  }
}

watch([page, limit, statusFilter, withoutPoster, withoutTmdb], () => {
  fetchMovies()
})

let searchTimer: any = null

const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchMovies()
  }, 250)
}

const handleSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  page.value = 1
  fetchMovies()
}

const resetFilters = () => {
  search.value = ''
  statusFilter.value = 'all'
  withoutPoster.value = false
  withoutTmdb.value = false
  page.value = 1
  fetchMovies()
}

const goToDetail = (id: string) => {
  router.push(`/movies/${id}`)
}

onMounted(() => {
  fetchMovies()
})
</script>

<template>
  <div class="movies-page">
    <header class="page-header">
      <h1>Canonical Movies / Metadata</h1>
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
        <select v-model="statusFilter">
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
      <table class="movies-table">
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
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && movies.length === 0">
            <td colspan="8" class="loading-cell">Loading...</td>
          </tr>
          <tr v-else-if="movies.length === 0">
            <td colspan="8" class="empty-cell">No movies found matching criteria.</td>
          </tr>
          <tr v-else v-for="movie in movies" :key="movie.id" @click="goToDetail(movie.id)" class="movie-row">
            <td class="poster-col">
              <img v-if="movie.poster_url" :src="movie.poster_url" class="mini-real-poster" />
              <div v-else class="mini-poster-fallback">
                <div class="fallback-title">{{ movie.title }}</div>
                <div class="fallback-year">{{ movie.year || 'N/A' }}</div>
              </div>
            </td>
            <td class="title-col">
              <div class="title-main" :title="movie.title">{{ movie.title }}</div>
              <div class="title-sub" :title="movie.original_title">{{ movie.original_title }}</div>
            </td>
            <td class="year-col">{{ movie.year || '-' }}</td>
            <td class="rating-col">{{ movie.rating || '-' }}</td>
            <td class="tmdb-col">{{ movie.tmdb_id || '-' }}</td>
            <td class="sources-col">{{ movie.telegram_sources_count }}</td>
            <td class="compact-col">
              <span class="badge" :class="{'badge-green': movie.poster_status === 'Available', 'badge-yellow': movie.poster_status === 'Missing'}">
                {{ movie.poster_status === 'Available' ? '✓ Present' : '⚠ Missing' }}
              </span>
            </td>
            <td class="status-col">
              <span class="badge" :class="movie.status === 'available' ? 'badge-green' : 'badge-red'">
                {{ movie.status }}
              </span>
            </td>
            <td class="actions-col">
              <div class="actions-cell">
                <a 
                  v-if="movie.poster_status === 'Available' && movie.poster_url"
                  :href="movie.poster_url"
                  target="_blank"
                  class="btn-action btn-poster"
                  title="View Poster"
                  @click.stop
                >👁 Poster</a>
                <a 
                  v-if="movie.status === 'available' && movie.telegram_sources_count > 0 && movie.public_url"
                  :href="movie.public_url"
                  target="_blank"
                  class="btn-action btn-movie"
                  title="View Movie"
                  @click.stop
                >🎬 Movie</a>
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
  color: var(--ui-text);
}

.filters-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--ui-raised);
  padding: 16px;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
  margin-bottom: 24px;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  flex: 1;
  padding: 10px 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: white;
  outline: none;
}

.search-box input:focus {
  border-color: var(--ui-control);
}

button {
  padding: 8px 16px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  border-radius: var(--ui-radius);
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--ui-raised);
  color: var(--ui-text);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.filter-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

select {
  padding: 8px 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control);
  color: white;
  border-radius: var(--ui-radius);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-secondary);
  cursor: pointer;
}

.table-container {
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
  overflow: hidden;
}

.movies-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.movies-table th, .movies-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--ui-control);
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
  width: 160px;
}

.movies-table th {
  background: var(--ui-surface);
  color: var(--ui-link);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
}

.movie-row {
  cursor: pointer;
  transition: background 0.2s;
}

.movie-row:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

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

.loading-cell, .empty-cell {
  text-align: center;
  padding: 32px !important;
  color: var(--ui-link);
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: var(--ui-danger);
  padding: 12px;
  border-radius: var(--ui-radius);
  margin-bottom: 16px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--ui-raised);
  color: var(--ui-text);
}

.badge-green { background: rgba(74, 222, 128, 0.2); color: var(--ui-success); }
.badge-red { background: rgba(239, 68, 68, 0.2); color: var(--ui-danger); }
.badge-yellow { background: rgba(250, 204, 21, 0.2); color: var(--ui-warning); }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  color: var(--ui-link);
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
  border: 1px solid var(--ui-control);
  position: relative;
  overflow: hidden;
}

.fallback-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--ui-text);
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
  color: var(--ui-link);
  margin-top: 4px;
}
.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--ui-radius);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: 6px;
}

.btn-action:last-child {
  margin-right: 0;
}

.btn-poster {
  background-color: rgba(74, 222, 128, 0.1);
  color: var(--ui-success);
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.btn-poster:hover {
  background-color: rgba(74, 222, 128, 0.2);
}

.btn-movie {
  background-color: var(--ui-raised);
  color: var(--ui-link);
  border: 1px solid var(--ui-border);
}

.btn-movie:hover {
  background-color: var(--ui-raised);
}

.actions-cell {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
</style>
