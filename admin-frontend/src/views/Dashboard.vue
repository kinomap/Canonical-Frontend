<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'
import MasterSession from '../components/MasterSession.vue'

const router = useRouter()
const catalogStats = ref<any>(null)
const healthStats = ref<any>(null)
const seriesStats = ref<any>(null)
const mediaStats = ref<any>(null)

const loadingCatalog = ref(true)
const errorCatalog = ref('')

const loadingHealth = ref(true)
const errorHealth = ref('')

const fetchDashboardData = () => {
  fetchCatalogData()
  fetchHealthData()
  fetchSeriesStats()
  fetchMediaStats()
}

const fetchMediaStats = async () => {
  const token = localStorage.getItem('admin_token')
  if (!token) return
  try {
    const res = await axios.get('/api/v1/admin/telemetry/observability', { headers: { Authorization: `Bearer ${token}` } })
    mediaStats.value = res.data
  } catch (err: any) {
    console.error('Failed to load media stats', err)
  }
}

const fetchSeriesStats = async () => {
  const token = localStorage.getItem('admin_token')
  if (!token) return
  try {
    const res = await axios.get('/api/v1/admin/series/stats', { headers: { Authorization: `Bearer ${token}` } })
    seriesStats.value = res.data
  } catch (err: any) {
    console.error('Failed to load series stats', err)
  }
}

const fetchCatalogData = async () => {
  loadingCatalog.value = true
  errorCatalog.value = ''
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const res = await axios.get('/api/v1/admin/dashboard/catalog', { headers: { Authorization: `Bearer ${token}` } })
    catalogStats.value = res.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      errorCatalog.value = err.response?.data?.detail || 'Failed to load catalog data.'
    }
  } finally {
    loadingCatalog.value = false
  }
}

const fetchHealthData = async () => {
  loadingHealth.value = true
  errorHealth.value = ''
  const token = localStorage.getItem('admin_token')
  if (!token) return

  try {
    const res = await axios.get('/api/v1/admin/dashboard/health', { headers: { Authorization: `Bearer ${token}` } })
    healthStats.value = res.data
  } catch (err: any) {
    errorHealth.value = err.response?.data?.detail || 'Failed to load system health.'
  } finally {
    loadingHealth.value = false
  }
}

const formatDate = (d: string | null) => {
  if (!d) return 'Never'
  return new Date(d).toLocaleString()
}

const isResetting = ref(false)

const resetTotal = async () => {
  if (!confirm('Reset the Total (Unique Physical Resources) counter? Existing Telegram Sources will not be deleted or modified.')) return

  isResetting.value = true
  const token = localStorage.getItem('admin_token')
  try {
    const res = await axios.post('/api/v1/admin/telegram-sources/metrics/reset', {}, { headers: { Authorization: `Bearer ${token}` } })
    if (catalogStats.value) {
      catalogStats.value.telegram_sources_total = res.data.total_unique_physical_resources
    }
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to reset metric.', 'error')
  } finally {
    isResetting.value = false
  }
}

const statusClass = (s: string) => {
  if (!s) return 'badge-unknown'
  if (s === 'ok' || s === 'running') return 'badge-ok'
  if (s.startsWith('error')) return 'badge-error'
  if (s === 'not configured' || s === 'not available') return 'badge-warn'
  return 'badge-unknown'
}

onMounted(() => { fetchDashboardData() })
</script>

<template>
  <div class="dashboard-page">
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="page-subtitle">Platform overview and system health</p>
      </div>
      <button class="refresh-btn" @click="fetchDashboardData" :disabled="loadingCatalog || loadingHealth">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"
          :class="{ spinning: loadingCatalog || loadingHealth }">
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Refresh
      </button>
    </div>

    <div class="dashboard-content">
      <!-- MASTER TELEGRAM SESSION -->
      <MasterSession />

      <!-- CONTENT SECTION -->
      <section class="dashboard-section">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/>
            <line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          Content
        </h2>
        
        <div v-if="loadingCatalog && !catalogStats" class="loading-state-sm">
          <div class="loading-spinner"></div>
        </div>
        <div v-else-if="errorCatalog" class="error-state-sm">
          <p>{{ errorCatalog }}</p>
          <button class="retry-btn-sm" @click="fetchCatalogData">Try Again</button>
        </div>
        <div v-else-if="catalogStats" class="stats-grid-content">
          <!-- ROW 1 — MOVIES -->
          <div class="stat-card clickable" @click="$router.push('/movies')">
            <div class="stat-icon total">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
            </div>
            <div>
              <div class="stat-value">{{ catalogStats.movies_total.toLocaleString() }}</div>
              <div class="stat-label">Canonical Movies / Metadata</div>
            </div>
          </div>

          <div class="stat-card clickable" @click="$router.push('/movies')">
            <div class="stat-icon available">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-green">{{ catalogStats.movies_available.toLocaleString() }}</div>
              <div class="stat-label">Available Movies</div>
            </div>
          </div>

          <div class="stat-card clickable" @click="$router.push('/garbage')">
            <div class="stat-icon blocked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              </svg>
            </div>
            <div>
              <div class="stat-value text-red">{{ catalogStats.sources_garbage?.toLocaleString() || '0' }}</div>
              <div class="stat-label">Garbage</div>
            </div>
          </div>

          <!-- SECTION TILE 1 — MOVIES -->
          <div class="stat-card section-tile">
            <div class="section-tile-icon movies">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/>
                <line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
              </svg>
            </div>
            <div class="section-tile-title">MOVIES</div>
          </div>

          <!-- ROW 2 — SERIES -->
          <div class="stat-card clickable" @click="$router.push('/series-management')">
            <div class="stat-icon series" style="background-color: rgba(139, 92, 246, 0.2); color: #8b5cf6;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                <polyline points="17 2 12 7 7 2"></polyline>
              </svg>
            </div>
            <div>
              <div class="stat-value" style="color: #8b5cf6;">{{ seriesStats?.total_series?.toLocaleString() || '0' }}</div>
              <div class="stat-label">Canonical Series</div>
            </div>
          </div>

          <div class="stat-card clickable" @click="$router.push('/series')">
            <div class="stat-icon available" style="background-color: rgba(16, 185, 129, 0.2); color: #10b981;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-green">{{ seriesStats?.available_series?.toLocaleString() || '0' }}</div>
              <div class="stat-label">Available Series</div>
            </div>
          </div>

          <div class="stat-card clickable" @click="$router.push('/series-garbage')">
            <div class="stat-icon blocked" style="background-color: rgba(239, 68, 68, 0.2); color: #ef4444;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              </svg>
            </div>
            <div>
              <div class="stat-value text-red">{{ seriesStats?.garbage_series?.toLocaleString() || '0' }}</div>
              <div class="stat-label">Series Garbage</div>
            </div>
          </div>

          <!-- SECTION TILE 2 — SERIES -->
          <div class="stat-card section-tile">
            <div class="section-tile-icon series">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
                <polyline points="17 2 12 7 7 2"/>
              </svg>
            </div>
            <div class="section-tile-title">SERIES</div>
          </div>

          <!-- ROW 3 — GENERAL METRICS -->
          <div class="stat-card clickable" @click="$router.push('/without-poster')">
            <div class="stat-icon poster">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-yellow">{{ catalogStats.movies_without_poster.toLocaleString() }}</div>
              <div class="stat-label">Without Poster</div>
            </div>
          </div>

          <div class="stat-card clickable" @click="$router.push('/blocked')">
            <div class="stat-icon blocked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-red">{{ catalogStats.movies_blocked.toLocaleString() }}</div>
              <div class="stat-label">Blocked</div>
            </div>
          </div>

          <!-- DECORATIVE TILE (Row 3, position 3) -->
          <div class="stat-card decorative-tile">
            <div class="decorative-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div class="decorative-tile-title">KINOSOTA</div>
          </div>

          <!-- SECTION TILE 3 — GENERAL -->
          <div class="stat-card section-tile">
            <div class="section-tile-icon general">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div class="section-tile-title">GENERAL</div>
          </div>
        </div>
      </section>

      <!-- TELEGRAM SECTION -->
      <section class="dashboard-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 class="section-title" style="margin-bottom: 0;">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
            </svg>
            Telegram Sources
          </h2>
          <button 
            class="reset-action-btn" 
            @click="resetTotal" 
            :disabled="isResetting"
            title="Reset metric to zero for new resources"
          >
            Reset Total
          </button>
        </div>
        
        <div v-if="loadingCatalog && !catalogStats" class="loading-state-sm">
          <div class="loading-spinner"></div>
        </div>
        <div v-else-if="errorCatalog" class="error-state-sm">
          <p>{{ errorCatalog }}</p>
          <button class="retry-btn-sm" @click="fetchCatalogData">Try Again</button>
        </div>
        <div v-else-if="catalogStats" class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon available">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-green">{{ catalogStats.telegram_sources_active }}</div>
              <div class="stat-label">Active (Unique Movies)</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="color: #6366f1; background: #e0e7ff;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <div>
              <div class="stat-value text-blue">{{ catalogStats.recurring_telegram_sources }}</div>
              <div class="stat-label">Recurring (Additional Sources)</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </div>
            <div>
              <div class="stat-value">{{ catalogStats.telegram_sources_total }}</div>
              <div class="stat-label" title="Counts unique Telegram resources registered after the last reset.">Total (Unique Physical Resources)</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon tmdb">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div class="stat-value-sm">{{ formatDate(catalogStats.telegram_last_sync) }}</div>
              <div class="stat-label">Last Sync</div>
            </div>
          </div>

        </div>
      </section>

      <!-- SYSTEM HEALTH + WORKERS -->
      <div class="bottom-grid">
        <section class="dashboard-section">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            System Health
          </h2>
          
          <div v-if="loadingHealth && !healthStats" class="loading-state-sm">
            <div class="loading-spinner"></div>
          </div>
          <div v-else-if="errorHealth" class="error-state-sm">
            <p>{{ errorHealth }}</p>
            <button class="retry-btn-sm" @click="fetchHealthData">Try Again</button>
          </div>
          <div v-else-if="healthStats" class="health-list">
            <div class="health-row">
              <span class="health-name">Database</span>
              <span class="badge" :class="statusClass(healthStats.database)">{{ healthStats.database }}</span>
            </div>
            <div class="health-row">
              <span class="health-name">Telegram</span>
              <span class="badge" :class="statusClass(healthStats.telegram_status)">{{ healthStats.telegram_status }}</span>
            </div>
            <div class="health-row">
              <span class="health-name">TMDB</span>
              <span class="badge" :class="statusClass(healthStats.tmdb_status)">{{ healthStats.tmdb_status }}</span>
            </div>
            <div class="health-row">
              <span class="health-name">Fanart</span>
              <span class="badge" :class="statusClass(healthStats.fanart_status)">{{ healthStats.fanart_status }}</span>
            </div>
            <div class="health-row">
              <span class="health-name">OMDb</span>
              <span class="badge" :class="statusClass(healthStats.omdb_status)">{{ healthStats.omdb_status }}</span>
            </div>
          </div>
        </section>

        <section class="dashboard-section">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Workers
          </h2>
          
          <div v-if="loadingHealth && !healthStats" class="loading-state-sm">
            <div class="loading-spinner"></div>
          </div>
          <div v-else-if="errorHealth" class="error-state-sm">
            <p>{{ errorHealth }}</p>
            <button class="retry-btn-sm" @click="fetchHealthData">Try Again</button>
          </div>
          <div v-else-if="healthStats" class="health-list">
            <div class="health-row">
              <span class="health-name">Channel Sync</span>
              <span class="badge" :class="statusClass(healthStats.channel_sync_worker)">
                {{ healthStats.channel_sync_worker }}
              </span>
            </div>
            <div class="health-row">
              <span class="health-name">Reconciliation</span>
              <span class="badge" :class="statusClass(healthStats.reconciliation_worker)">
                {{ healthStats.reconciliation_worker }}
              </span>
            </div>
          </div>
        </section>
      </div>

      <!-- MEDIA INFRASTRUCTURE -->
      <section class="dashboard-section" v-if="mediaStats">
        <h2 class="section-title" style="margin-bottom: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          Media Infrastructure
        </h2>
        <div class="stats-grid" style="margin-top: 16px;">
          <div class="stat-card clickable" @click="$router.push('/media-nodes')">
            <div class="stat-icon" style="background: rgba(99,102,241,0.15); color: #818cf8;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div>
              <div class="stat-value" style="color: #818cf8;">{{ mediaStats.overview?.healthy_nodes || 0 }} / {{ mediaStats.overview?.total_nodes || 0 }}</div>
              <div class="stat-label">Nodes (healthy / total)</div>
            </div>
          </div>
          <div class="stat-card clickable" @click="$router.push('/media-sessions')">
            <div class="stat-icon" :style="{
              background: mediaStats.media_sessions_additional > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.15)',
              color: mediaStats.media_sessions_additional > 0 ? '#fbbf24' : '#10b981'
            }">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
              </svg>
            </div>
            <div>
              <div class="stat-value" :style="{ color: mediaStats.media_sessions_additional > 0 ? '#fbbf24' : '#10b981' }">
                {{ mediaStats.media_sessions_connected }} / {{ mediaStats.media_sessions_required }}
              </div>
              <div class="stat-label">Sessions (connected / required)</div>
            </div>
          </div>
          <div class="stat-card clickable" @click="$router.push('/media-infrastructure')">
            <div class="stat-icon" style="background: rgba(56,189,248,0.15); color: #38bdf8;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div>
              <div class="stat-value" style="color: #38bdf8;">{{ mediaStats.overview?.total_streams || 0 }}</div>
              <div class="stat-label">Active Streams</div>
            </div>
          </div>
          <div class="stat-card" v-if="mediaStats.media_sessions_additional > 0">
            <div class="stat-icon" style="background: rgba(249,115,22,0.15); color: #f97316;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <div class="stat-value" style="color: #f97316;">+{{ mediaStats.media_sessions_additional }}</div>
              <div class="stat-label">Sessions Needed</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  max-width: 1400px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0 0 4px 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: #f8fafc;
}

.page-subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.875rem;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  background: #334155;
  color: #f1f5f9;
}

.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 0.8s linear infinite; }

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #334155;
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  color: #64748b;
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid #334155;
}

.retry-btn {
  padding: 8px 20px;
  background: #38bdf8;
  border: none;
  border-radius: 6px;
  color: #0f172a;
  font-weight: 700;
  cursor: pointer;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.dashboard-section {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 24px;
}

.reset-action-btn {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-action-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

.reset-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 20px 0;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
}

.stats-grid-content {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
}

.stat-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 10px;
  padding: 14px 16px;
  width: 100%;
  min-height: 84px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.15s;
}

.stat-card.section-tile {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  justify-content: flex-start;
  padding-left: 20px;
  cursor: default;
}

.section-tile-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.section-tile-icon.movies { color: #38bdf8; background: rgba(56, 189, 248, 0.15); }
.section-tile-icon.series { color: #8b5cf6; background: rgba(139, 92, 246, 0.15); }
.section-tile-icon.general { color: #94a3b8; background: rgba(148, 163, 184, 0.15); }

.section-tile-title {
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #cbd5e1;
  text-transform: uppercase;
}

.stat-card.decorative-tile {
  background: rgba(30, 41, 59, 0.3);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  justify-content: flex-start;
  padding-left: 20px;
  cursor: default;
}

.decorative-tile-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #475569;
  background: rgba(255, 255, 255, 0.03);
}

.decorative-tile-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #475569;
  text-transform: uppercase;
}

.stat-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:hover {
  border-color: rgba(56, 189, 248, 0.2);
  background: rgba(56, 189, 248, 0.04);
  transform: translateY(-1px);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.total { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
.stat-icon.available { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.stat-icon.blocked { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.stat-icon.poster { background: rgba(250, 204, 21, 0.15); color: #facc15; }
.stat-icon.tmdb { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }

.stat-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-value-sm {
  font-size: 0.85rem;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
  line-height: 1.25;
}

.text-green { color: #4ade80; }
.text-red { color: #ef4444; }
.text-yellow { color: #facc15; }
.text-blue { color: #38bdf8; }

.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .stats-grid-content { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .bottom-grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .stats-grid-content { grid-template-columns: 1fr; }
}

.health-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.health-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.1s;
}

.health-row:hover {
  background: rgba(255,255,255,0.03);
}

.health-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #cbd5e1;
}

.badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-ok { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.badge-error { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.badge-warn { background: rgba(250, 204, 21, 0.15); color: #facc15; }
.badge-unknown { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
</style>

.loading-state-sm {
  display: flex; justify-content: center; padding: 40px; color: #64748b;
}

.error-state-sm {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 40px; color: #f87171; background: rgba(248, 113, 113, 0.05);
  border-radius: 8px; border: 1px solid rgba(248, 113, 113, 0.2);
}

.retry-btn-sm {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid #f87171;
  border-radius: 6px;
  color: #f87171;
  font-size: 0.85rem;
  cursor: pointer;
}
.retry-btn-sm:hover { background: rgba(248, 113, 113, 0.1); }
