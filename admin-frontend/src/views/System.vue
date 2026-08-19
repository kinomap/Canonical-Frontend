<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const healthData = ref<any>(null)
const workersData = ref<any>(null)
const loading = ref(true)
const error = ref('')
const lastRefreshed = ref<string | null>(null)

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const statusClass = (s: string) => {
  if (!s) return 'badge-unknown'
  if (s === 'ok' || s === 'running') return 'badge-ok'
  if (s.startsWith('error')) return 'badge-error'
  if (s === 'not configured' || s === 'not available') return 'badge-warn'
  return 'badge-unknown'
}

const statusDot = (s: string) => {
  if (!s) return 'dot-unknown'
  if (s === 'ok' || s === 'running') return 'dot-ok'
  if (s.startsWith('error')) return 'dot-error'
  return 'dot-warn'
}

const fetchSystemStatus = async () => {
  loading.value = true
  error.value = ''
  try {
    const [healthRes, workersRes] = await Promise.allSettled([
      axios.get('/api/v1/admin/health/advanced', auth()),
      axios.get('/api/v1/admin/system/workers', auth()),
    ])
    if (healthRes.status === 'fulfilled') {
      healthData.value = healthRes.value.data
    } else {
      healthData.value = null
    }
    if (workersRes.status === 'fulfilled') {
      workersData.value = workersRes.value.data
    } else {
      workersData.value = null
    }
    lastRefreshed.value = new Date().toLocaleTimeString()
  } catch (err: any) {
    error.value = 'Failed to load system status.'
  } finally {
    loading.value = false
  }
}

const formatTs = (ts: string | null) => ts ? new Date(ts).toLocaleString() : 'Not checked'

onMounted(() => { fetchSystemStatus() })
</script>

<template>
  <div class="system-page">
    <div class="page-header">
      <div>
        <h1>Health &amp; Workers</h1>
        <p class="page-subtitle">Real-time system status and background worker health</p>
      </div>
      <div class="header-right">
        <span v-if="lastRefreshed" class="last-refreshed">Last refreshed: {{ lastRefreshed }}</span>
        <button class="refresh-btn" @click="fetchSystemStatus" :disabled="loading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"
            :class="{ spinning: loading }">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <div v-if="loading && !healthData" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Gathering system telemetry...</span>
    </div>

    <div v-else class="system-grid">

      <!-- Database -->
      <div class="system-card">
        <div class="card-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" class="card-icon db">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <h3>Database</h3>
          <div class="dot" :class="healthData ? statusDot(healthData.database) : 'dot-unknown'"></div>
        </div>
        <div v-if="healthData" class="card-body">
          <div class="status-row">
            <span class="label">Status</span>
            <span class="badge" :class="statusClass(healthData.database)">{{ healthData.database }}</span>
          </div>
          <div class="status-row">
            <span class="label">Last Checked</span>
            <span class="value">{{ formatTs(healthData.database_checked_at) }}</span>
          </div>
        </div>
        <div v-else class="card-unavailable">Not available</div>
      </div>

      <!-- Telegram -->
      <div class="system-card">
        <div class="card-header">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" class="card-icon tg">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
          </svg>
          <h3>Telegram</h3>
          <div class="dot" :class="healthData ? statusDot(healthData.telegram) : 'dot-unknown'"></div>
        </div>
        <div v-if="healthData" class="card-body">
          <div class="status-row">
            <span class="label">Status</span>
            <span class="badge" :class="statusClass(healthData.telegram)">{{ healthData.telegram }}</span>
          </div>
          <div class="status-row">
            <span class="label">Last Checked</span>
            <span class="value">{{ formatTs(healthData.telegram_checked_at) }}</span>
          </div>
        </div>
        <div v-else class="card-unavailable">Not available</div>
      </div>

      <!-- External APIs -->
      <div class="system-card">
        <div class="card-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" class="card-icon api">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <h3>External APIs</h3>
        </div>
        <div v-if="healthData" class="card-body">
          <div class="status-row">
            <span class="label">TMDB</span>
            <span class="badge" :class="statusClass(healthData.tmdb)">{{ healthData.tmdb }}</span>
          </div>
          <div class="status-row">
            <span class="label">Fanart.tv</span>
            <span class="badge" :class="statusClass(healthData.fanart)">{{ healthData.fanart }}</span>
          </div>
          <div class="status-row">
            <span class="label">OMDb</span>
            <span class="badge" :class="statusClass(healthData.omdb)">{{ healthData.omdb }}</span>
          </div>
          <div class="status-row last-check">
            <span class="label">Last Checked</span>
            <span class="value">{{ formatTs(healthData.tmdb_checked_at) }}</span>
          </div>
        </div>
        <div v-else class="card-unavailable">Not available</div>
      </div>

      <!-- Background Workers -->
      <div class="system-card">
        <div class="card-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" class="card-icon workers">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <h3>Workers</h3>
        </div>
        <div v-if="workersData" class="card-body">
          <div class="status-row">
            <span class="label">Channel Sync</span>
            <span class="badge" :class="statusClass(workersData.channel_sync_service)">
              {{ workersData.channel_sync_service }}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Reconciliation</span>
            <span class="badge" :class="statusClass(workersData.reconciliation_service)">
              {{ workersData.reconciliation_service }}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Checked At</span>
            <span class="value">{{ formatTs(workersData.checked_at) }}</span>
          </div>
        </div>
        <div v-else class="card-unavailable">Not available</div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.system-page { max-width: 1200px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0 0 4px;
  font-size: 1.75rem;
  font-weight: 800;
  color: #f8fafc;
}

.page-subtitle { margin: 0; color: #64748b; font-size: 0.875rem; }

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-refreshed { font-size: 0.8rem; color: #64748b; }

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

.refresh-btn:hover:not(:disabled) { background: #334155; color: #f1f5f9; }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 0.8s linear infinite; }

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px;
  color: #64748b;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #334155;
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.system-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.system-card {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.card-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f1f5f9;
  flex: 1;
}

.card-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.card-icon.db { color: #4ade80; }
.card-icon.tg { color: #38bdf8; }
.card-icon.api { color: #a78bfa; }
.card-icon.workers { color: #fb923c; }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-ok { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
.dot-error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
.dot-warn { background: #facc15; box-shadow: 0 0 8px #facc15; }
.dot-unknown { background: #475569; }

.card-body { padding: 4px 0; }

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.status-row:last-child { border-bottom: none; }

.label {
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: 500;
}

.value {
  font-size: 0.8rem;
  color: #f1f5f9;
  font-weight: 500;
  max-width: 55%;
  text-align: right;
  word-break: break-word;
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

.card-unavailable {
  padding: 20px;
  color: #475569;
  font-size: 0.85rem;
  text-align: center;
}
</style>
