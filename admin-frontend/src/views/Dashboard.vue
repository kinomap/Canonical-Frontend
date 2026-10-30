<script setup lang="ts">
import ChangePassword from '../components/ChangePassword.vue'
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import MasterSession from '../components/MasterSession.vue'

const router = useRouter()
const snapshotBusy = ref(false)
const snapshotError = ref('')
const downloadCatalogSnapshot = async () => {
  if (snapshotBusy.value) return
  snapshotBusy.value = true
  snapshotError.value = ''
  try {
    const response = await axios.get('/api/v1/admin/catalog/snapshot', {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      responseType: 'blob', timeout: 250000,
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url; link.download = 'db-catalog-snapshot.sql.gz'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch {
    snapshotError.value = 'Не удалось скачать снимок. Каталог и настройки не изменены. Проверьте подключение и повторите.'
  } finally { snapshotBusy.value = false }
}

const fullBackupBusy = ref(false)
const fullBackupError = ref('')
const downloadFullBackup = async () => {
  if (fullBackupBusy.value) return
  fullBackupBusy.value = true; fullBackupError.value = ''
  try {
    const response = await axios.get('/api/v1/admin/database/backup', {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      responseType: 'blob', timeout: 330000,
    })
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a'); a.href = url; a.download = 'kinosota-full-database.dump'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch { fullBackupError.value = 'Полный бэкап не создан. БД не изменена; проверьте доступ и свободное место.' }
  finally { fullBackupBusy.value = false }
}

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
    const [res, canonical] = await Promise.all([
      axios.get('/api/v1/admin/dashboard/catalog', { headers: { Authorization: `Bearer ${token}` } }),
      axios.get('/api/v1/admin/catalog', { params: { limit: 1 }, headers: { Authorization: `Bearer ${token}` } }),
    ])
    // The mixed canonical card must count the exact same index it opens.
    catalogStats.value = { ...res.data, catalog_total: canonical.data.total }
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
        <h1>Обзор</h1>
        <p class="page-subtitle">Каталог, сервисы и состояние системы</p>
      </div>
      <button class="refresh-btn" @click="fetchDashboardData" :disabled="loadingCatalog || loadingHealth">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"
          :class="{ spinning: loadingCatalog || loadingHealth }">
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Обновить
      </button>
    </div>

    <div class="dashboard-content">
      <!-- MASTER TELEGRAM SESSION -->
      <details class="snapshot-card">
      <summary>Резервные копии каталога и базы данных</summary>
      <p>Фильмы, сериалы, метаданные, источники Telegram и имеющиеся изображения. Без пользователей, паролей, сессий и настроек серверов. Снимок можно загрузить в Центре развёртывания при переезде.</p>
      <button class="refresh-btn" :disabled="fullBackupBusy" @click="downloadFullBackup">{{ fullBackupBusy ? 'Создаём полный бэкап…' : 'Создать и скачать полный бэкап БД' }}</button>
      <p v-if="fullBackupError" role="alert">{{ fullBackupError }}</p>
      <p>Полный .dump: все таблицы PostgreSQL и ключи восстановления. Храните приватно. Telegram .session и media-файлы сохраняются отдельно.</p>
      <button class="refresh-btn" :disabled="snapshotBusy" @click="downloadCatalogSnapshot">{{ snapshotBusy ? 'Создаём снимок…' : 'Скачать резервную копию каталога .sql.gz' }}</button>
      <p v-if="snapshotError" role="alert">{{ snapshotError }}</p>
    </details>
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
              <div class="stat-value">{{ catalogStats.catalog_total.toLocaleString() }}</div>
              <div class="stat-label">Canonical Metadata · Фильмы и сериалы</div>
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
              <div class="stat-value text-yellow">{{ (catalogStats.catalog_without_poster ?? catalogStats.movies_without_poster).toLocaleString() }}</div>
              <div class="stat-label">Без постера · фильмы и сериалы</div>
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
              <div class="stat-label">Активные произведения</div>
              <div class="stat-label">{{ catalogStats.telegram_active_movies }} фильмов + {{ catalogStats.telegram_active_series }} сериалов</div>
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
              <div class="stat-label">Дополнительные копии фильмов / эпизодов</div>
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
              <div class="stat-value">{{ catalogStats.telegram_physical_resources_active }}</div>
              <div class="stat-label" title="Уникальные сообщения с активными файлами в активных каналах. Эпизоды не считаются отдельными сериалами.">Файлы активных источников</div>
              <div class="stat-label">{{ catalogStats.telegram_active_episodes }} эпизодов · не число произведений</div>
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
  <ChangePassword />
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
  color: var(--ui-text);
}

.page-subtitle {
  margin: 0;
  color: var(--ui-link);
  font-size: 0.875rem;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  color: var(--ui-link);
  border-radius: var(--ui-radius);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 0.8s linear infinite; }

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ui-control);
  border-top-color: var(--ui-control);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  color: var(--ui-link);
  background: var(--ui-raised);
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
}

.retry-btn {
  padding: 8px 20px;
  background: var(--ui-primary);
  border: none;
  border-radius: var(--ui-radius);
  color: var(--ui-on-primary);
  font-weight: 700;
  cursor: pointer;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.dashboard-section {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 24px;
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
  color: var(--ui-link);
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
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
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
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  justify-content: flex-start;
  padding-left: 20px;
  cursor: default;
}

.section-tile-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.section-tile-icon.movies { color: var(--ui-link); background: var(--ui-raised); }
.section-tile-icon.series { color: var(--ui-link); background: var(--ui-raised); }
.section-tile-icon.general { color: var(--ui-link); background: var(--ui-raised); }

.section-tile-title {
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--ui-secondary);
  text-transform: uppercase;
}

.stat-card.decorative-tile {
  background: var(--ui-surface);
  border: 1px dashed var(--ui-border);
  justify-content: flex-start;
  padding-left: 20px;
  cursor: default;
}

.decorative-tile-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ui-link);
  background: var(--ui-raised);
}

.decorative-tile-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--ui-link);
  text-transform: uppercase;
}

.stat-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:hover {
  border-color: var(--ui-border);
  background: var(--ui-raised);
  transform: translateY(-1px);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.total { background: var(--ui-raised); color: var(--ui-link); }
.stat-icon.available { background: var(--ui-success-bg); color: var(--ui-success); }
.stat-icon.blocked { background: var(--ui-danger-bg); color: var(--ui-danger); }
.stat-icon.poster { background: var(--ui-warning-bg); color: var(--ui-warning); }
.stat-icon.tmdb { background: var(--ui-raised); color: var(--ui-link); }

.stat-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--ui-text);
  line-height: 1;
  margin-bottom: 4px;
}

.stat-value-sm {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-text);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--ui-link);
  font-weight: 500;
  line-height: 1.25;
}

.text-green { color: var(--ui-success); }
.text-red { color: var(--ui-danger); }
.text-yellow { color: var(--ui-warning); }
.text-blue { color: var(--ui-link); }

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
  border-radius: var(--ui-radius);
  transition: background 0.1s;
}

.health-row:hover {
  background: var(--ui-raised);
}

.health-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-secondary);
}

.badge {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--ui-radius-panel);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-ok { background: var(--ui-success-bg); color: var(--ui-success); }
.badge-error { background: var(--ui-danger-bg); color: var(--ui-danger); }
.badge-warn { background: var(--ui-warning-bg); color: var(--ui-warning); }
.badge-unknown { background: var(--ui-raised); color: var(--ui-link); }

.snapshot-card{margin:0 0 24px;padding:16px 20px;border:1px solid var(--ui-border);border-radius:var(--ui-radius-panel);background:var(--ui-surface)}
.snapshot-card summary{cursor:pointer;min-height:24px;font-weight:650}.snapshot-card[open] summary{margin-bottom:16px}.snapshot-card p{margin:12px 0;color:var(--ui-secondary);font-size:14px}.snapshot-card .refresh-btn{white-space:normal;text-align:left}
</style>

.loading-state-sm {
  display: flex; justify-content: center; padding: 40px; color: #64748b;
}

.error-state-sm {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 40px; color: #f87171; background: var(--ui-danger-bg);
  border-radius: 8px; border: 1px solid var(--ui-danger-bg);
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
.retry-btn-sm:hover { background: var(--ui-danger-bg); }
