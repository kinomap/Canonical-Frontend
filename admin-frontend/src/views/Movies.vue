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

const fetchMovies = async () => {
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

    const res = await axios.get(`/api/v1/admin/movies?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    movies.value = res.data.items
    total.value = res.data.total
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      error.value = 'Failed to load movies.'
    }
  } finally {
    loading.value = false
  }
}

watch([page, limit, statusFilter, withoutPoster, withoutTmdb], () => {
  fetchMovies()
})

const handleSearch = () => {
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
      <h1>Movies Management</h1>
    </header>

    <div class="filters-bar">
      <div class="search-box">
        <input 
          type="text" 
          v-model="search" 
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
            <th>Poster</th>
            <th>Title</th>
            <th>Year</th>
            <th>TMDB ID</th>
            <th>Sources</th>
            <th>Poster Status</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && movies.length === 0">
            <td colspan="7" class="loading-cell">Loading...</td>
          </tr>
          <tr v-else-if="movies.length === 0">
            <td colspan="7" class="empty-cell">No movies found matching criteria.</td>
          </tr>
          <tr v-else v-for="movie in movies" :key="movie.id" @click="goToDetail(movie.id)" class="movie-row">
            <td>
              <div class="mini-poster-fallback">
                <div class="fallback-title">{{ movie.title }}</div>
                <div class="fallback-year">{{ movie.year || 'N/A' }}</div>
              </div>
            </td>
            <td>
              <div class="title-main">{{ movie.title }}</div>
              <div class="title-sub">{{ movie.original_title }}</div>
            </td>
            <td>{{ movie.year || '-' }}</td>
            <td>{{ movie.tmdb_id || '-' }}</td>
            <td>{{ movie.telegram_sources_count }}</td>
            <td>
              <span class="badge" :class="{'badge-green': movie.poster_status === 'Available', 'badge-yellow': movie.poster_status === 'Missing'}">
                <span v-if="movie.poster_status === 'Available'">✓</span>
                <span v-else>⚠</span>
                {{ movie.poster_status }}
              </span>
            </td>
            <td>
              <span class="badge" :class="movie.status === 'available' ? 'badge-green' : 'badge-red'">
                {{ movie.status }}
              </span>
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
  overflow-x: auto;
  background: #1e293b;
  border-radius: 8px;
  border: 1px solid #334155;
}

.movies-table {
  width: 100%;
  border-collapse: collapse;
}

.movies-table th, .movies-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #334155;
}

.movies-table th {
  background: #0f172a;
  color: #94a3b8;
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
  background: #334155;
}

.title-main {
  font-weight: 600;
  color: #f8fafc;
}

.title-sub {
  font-size: 0.85rem;
  color: #94a3b8;
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
</style>
