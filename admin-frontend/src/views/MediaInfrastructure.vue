<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'

// ── Types ─────────────────────────────────────────────────────────────────

interface HealthDomain {
  name: string
  status: string
  detail: string
}

interface Overview {
  total_nodes: number
  healthy_nodes: number
  active_nodes: number
  total_viewers: number
  total_streams: number
  total_egress_mbps: number
  total_ingress_mbps: number
  total_sessions: number
  active_sessions: number
  healthy_sessions: number
  global_capacity_percent: number
  global_status: string
  global_headroom_mbps: number | null
  alert_count: number
  recommendation_count: number
}

interface Alert {
  severity: string
  category: string
  node_id: string | null
  session_id: string | null
  message: string
  timestamp: string
}

interface Recommendation {
  type: string
  severity: string
  node_id: string | null
  message: string
  details: Record<string, any>
}

interface ObservabilityData {
  overview: Overview
  scaling_required: boolean
  scaling_reason: string
  safe_threshold_percent: number
  health_domains: HealthDomain[]
  alerts: Alert[]
  recommendations: Recommendation[]
  channel_sync_running: boolean
  reconciliation_running: boolean
  media_sessions_connected: number
  media_sessions_assigned: number
  media_sessions_unassigned: number
  media_sessions_required: number
  media_sessions_additional: number
  media_sessions_healthy: number
  node_bandwidth_mbps: number
  target_utilization: number
  target_node_egress_mbps: number
  streams_per_session: number
  planning_bitrate_mbps: number
  last_updated: string
}

interface ScaleSignal {
  state: string
  cluster_utilization: number
  total_streams: number
  total_capacity: number
  remaining_capacity: number
  recommended_sessions: number
  recommended_nodes: number
  reasons: string[]
}

// ── State ─────────────────────────────────────────────────────────────────

const data = ref<ObservabilityData | null>(null)
const scaleSignal = ref<ScaleSignal | null>(null)
const loading = ref(true)
const error = ref('')
const lastFetchedAt = ref<Date | null>(null)
const secondsSinceUpdate = ref(0)
let refreshInterval: number | null = null
let tickInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchData = async () => {
  try {
    const [obsResp, scaleResp] = await Promise.all([
      axios.get('/api/v1/admin/telemetry/observability', auth()),
      axios.get('/api/v1/admin/telemetry/scale-signal', auth()).catch(() => null),
    ])
    data.value = obsResp.data
    if (scaleResp) scaleSignal.value = scaleResp.data
    lastFetchedAt.value = new Date()
    secondsSinceUpdate.value = 0
    error.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.detail || 'Failed to load observability data'
  } finally {
    loading.value = false
  }
}

const statusClass = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: 'status-healthy', ELEVATED: 'status-elevated',
    WARNING: 'status-warning', CRITICAL: 'status-critical',
    DEGRADED: 'status-warning', STALE: 'status-warning',
    ERROR: 'status-critical', UNKNOWN: 'status-unknown',
  }
  return map[s] || 'status-unknown'
}

const statusIcon = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: '✓', ELEVATED: '▲', WARNING: '⚠', CRITICAL: '✕',
    DEGRADED: '▲', STALE: '◷', ERROR: '✕', UNKNOWN: '?',
  }
  return map[s] || '?'
}

const capacityColor = computed(() => {
  if (!data.value) return '#6b7280'
  const p = data.value.overview.global_capacity_percent
  if (p <= 60) return '#10b981'
  if (p <= 75) return '#f59e0b'
  if (p <= 85) return '#f97316'
  return '#ef4444'
})

const formatMbps = (v: number | null) => {
  if (v === null || v === undefined) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Gbps`
  return `${v.toFixed(1)} Mbps`
}

onMounted(() => {
  fetchData()
  refreshInterval = window.setInterval(fetchData, 10000)
  tickInterval = window.setInterval(() => { secondsSinceUpdate.value++ }, 1000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (tickInterval) clearInterval(tickInterval)
})
</script>

<template>
  <div class="obs-page">
    <div class="obs-header">
      <h1 class="obs-title">
        <svg class="obs-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Observability
      </h1>
      <div class="obs-refresh">
        <span class="obs-refresh-text">Updated {{ secondsSinceUpdate }}s ago</span>
        <button class="obs-refresh-btn" @click="fetchData" :disabled="loading">↻ Refresh</button>
      </div>
    </div>

    <div v-if="loading && !data" class="obs-loading">
      <div class="obs-spinner"></div>
      <span>Loading telemetry...</span>
    </div>

    <div v-else-if="error && !data" class="obs-error">
      <span>{{ error }}</span>
      <button @click="fetchData">Retry</button>
    </div>

    <template v-if="data">
      <!-- ── Capacity Overview ───────────────────────── -->
      <section class="obs-section">
        <h2 class="obs-section-title">Capacity Overview</h2>
        <div class="obs-metrics-grid">
          <div class="obs-metric-card">
            <div class="obs-metric-label">Overall Capacity</div>
            <div class="obs-metric-value" :style="{ color: capacityColor }">
              {{ data.overview.global_capacity_percent.toFixed(0) }}%
            </div>
            <div class="obs-capacity-bar">
              <div class="obs-capacity-fill" :style="{ width: Math.min(data.overview.global_capacity_percent, 100) + '%', backgroundColor: capacityColor }"></div>
              <div class="obs-capacity-threshold" :style="{ left: data.safe_threshold_percent + '%' }"></div>
            </div>
            <span class="obs-badge" :class="statusClass(data.overview.global_status)">{{ data.overview.global_status }}</span>
          </div>

          <div class="obs-metric-card">
            <div class="obs-metric-label">Active Streams</div>
            <div class="obs-metric-value">{{ data.overview.total_streams }}</div>
            <div class="obs-metric-sub">{{ data.overview.total_viewers }} viewers</div>
          </div>

          <div class="obs-metric-card">
            <div class="obs-metric-label">Nodes</div>
            <div class="obs-metric-value">{{ data.overview.healthy_nodes }} / {{ data.overview.total_nodes }}</div>
            <div class="obs-metric-sub">{{ data.overview.active_nodes }} active</div>
          </div>

          <div class="obs-metric-card">
            <div class="obs-metric-label">Sessions</div>
            <div class="obs-metric-value" :class="data.media_sessions_additional > 0 ? 'text-warning' : ''">
              {{ data.media_sessions_assigned ?? data.media_sessions_connected }} / {{ data.media_sessions_required }}
            </div>
            <div class="obs-metric-sub">{{ data.media_sessions_healthy }} healthy<template v-if="data.media_sessions_unassigned > 0"> · <span class="text-warning">{{ data.media_sessions_unassigned }} unassigned</span></template></div>
          </div>

          <div class="obs-metric-card">
            <div class="obs-metric-label">Network Egress</div>
            <div class="obs-metric-value">{{ formatMbps(data.overview.total_egress_mbps) }}</div>
            <div class="obs-metric-sub">Headroom: {{ formatMbps(data.overview.global_headroom_mbps) }}</div>
          </div>

          <div class="obs-metric-card">
            <div class="obs-metric-label">Alerts</div>
            <div class="obs-metric-value" :class="data.overview.alert_count > 0 ? 'text-warning' : ''">{{ data.overview.alert_count }}</div>
            <div class="obs-metric-sub">{{ data.overview.recommendation_count }} recommendations</div>
          </div>
        </div>
      </section>

      <!-- ── Scaling Advisor (only when action required) ── -->
      <section class="obs-section" v-if="(scaleSignal && scaleSignal.state !== 'HEALTHY') || data.scaling_required">
        <h2 class="obs-section-title">Scaling Advisor</h2>
        <div class="obs-scaling-card obs-scaling-required">
          <div class="obs-scaling-icon">⚠</div>
          <div class="obs-scaling-info">
            <div class="obs-scaling-status">
              {{ scaleSignal ? scaleSignal.state : 'SCALING REQUIRED' }}
            </div>
            <div class="obs-scaling-detail" v-if="scaleSignal">
              Streams: {{ scaleSignal.total_streams }}/{{ scaleSignal.total_capacity }}
              ({{ scaleSignal.remaining_capacity }} remaining)
            </div>
            <div class="obs-scaling-detail" v-else-if="data.scaling_required">{{ data.scaling_reason }}</div>
            <!-- Recommendations -->
            <div v-if="scaleSignal && (scaleSignal.recommended_sessions > 0 || scaleSignal.recommended_nodes > 0)" class="obs-scaling-recs">
              <span v-if="scaleSignal.recommended_sessions > 0" class="obs-rec-badge rec-session">
                + {{ scaleSignal.recommended_sessions }} session{{ scaleSignal.recommended_sessions > 1 ? 's' : '' }}
              </span>
              <span v-if="scaleSignal.recommended_nodes > 0" class="obs-rec-badge rec-node">
                + {{ scaleSignal.recommended_nodes }} node{{ scaleSignal.recommended_nodes > 1 ? 's' : '' }}
              </span>
            </div>
            <!-- Reasons -->
            <div v-if="scaleSignal && scaleSignal.reasons.length > 0" class="obs-scaling-reasons">
              <div v-for="(reason, i) in scaleSignal.reasons" :key="i" class="obs-reason">• {{ reason }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Media Session Capacity ────────────────── -->
      <section class="obs-section" v-if="data.media_sessions_required > 0">
        <h2 class="obs-section-title">Media Session Capacity · Workers only</h2>
        <p>Master не участвует в медиатрафике. Цель ёмкости — план масштабирования, не минимальное число сессий для запуска видео. Отключённые и неподтверждённые сессии не считаются готовыми.</p>
        <div class="obs-session-capacity">
          <div class="obs-cap-row">
            <span class="obs-cap-label">Capacity target</span>
            <span class="obs-cap-value">{{ data.media_sessions_required }} sessions</span>
          </div>
          <div class="obs-cap-row">
            <span class="obs-cap-label">Healthy Workers (fresh heartbeat)</span>
            <span class="obs-cap-value" :class="data.media_sessions_additional > 0 ? 'obs-cap-warn' : 'obs-cap-ok'">{{ data.media_sessions_healthy }} sessions</span>
          </div>
          <div class="obs-cap-row" v-if="data.media_sessions_unassigned > 0">
            <span class="obs-cap-label">Unassigned</span>
            <span class="obs-cap-value obs-cap-warn">{{ data.media_sessions_unassigned }} sessions</span>
          </div>
          <div class="obs-cap-row" v-if="data.media_sessions_additional > 0">
            <span class="obs-cap-label">Additional Needed</span>
            <span class="obs-cap-value obs-cap-warn">+{{ data.media_sessions_additional }} sessions</span>
          </div>
          <div class="obs-cap-row">
            <span class="obs-cap-label">Planning Bitrate</span>
            <span class="obs-cap-value obs-cap-dim">{{ data.planning_bitrate_mbps }} Mbps/stream</span>
          </div>
          <div class="obs-cap-row">
            <span class="obs-cap-label">Streams/Session</span>
            <span class="obs-cap-value obs-cap-dim">{{ data.streams_per_session }}</span>
          </div>
          <div class="obs-cap-row">
            <span class="obs-cap-label">Node Bandwidth</span>
            <span class="obs-cap-value obs-cap-dim">{{ data.node_bandwidth_mbps }} Mbps</span>
          </div>
          <div class="obs-cap-row">
            <span class="obs-cap-label">Target Egress ({{ (data.target_utilization * 100).toFixed(0) }}%)</span>
            <span class="obs-cap-value obs-cap-dim">{{ data.target_node_egress_mbps }} Mbps</span>
          </div>
          <div class="obs-formula">
            <span class="obs-formula-label">Formula</span>
            <code class="obs-formula-code">
              ceil(({{ data.node_bandwidth_mbps }} × {{ data.target_utilization }}) / {{ data.planning_bitrate_mbps }} / {{ data.streams_per_session }})
              = ceil({{ ((data.node_bandwidth_mbps * data.target_utilization) / data.planning_bitrate_mbps / data.streams_per_session).toFixed(1) }})
              = {{ data.media_sessions_required }} sessions
            </code>
          </div>
          <div v-if="data.media_sessions_additional > 0" class="obs-scale-alert">
            ⚠ Scale Required — Add {{ data.media_sessions_additional }} more session{{ data.media_sessions_additional > 1 ? 's' : '' }} to meet capacity targets
          </div>
        </div>
      </section>

      <!-- ── Health Domains ──────────────────────────── -->
      <section class="obs-section">
        <h2 class="obs-section-title">System Health</h2>
        <div class="obs-health-grid">
          <div v-for="domain in data.health_domains" :key="domain.name" class="obs-health-card">
            <div class="obs-health-icon" :class="statusClass(domain.status)">{{ statusIcon(domain.status) }}</div>
            <div class="obs-health-info">
              <div class="obs-health-name">{{ domain.name }}</div>
              <div class="obs-health-detail">{{ domain.detail }}</div>
            </div>
            <span class="obs-badge-sm" :class="statusClass(domain.status)">{{ domain.status }}</span>
          </div>
        </div>
      </section>

      <!-- ── Alerts ──────────────────────────────────── -->
      <section v-if="data.alerts.length > 0" class="obs-section">
        <h2 class="obs-section-title">Active Alerts ({{ data.alerts.length }})</h2>
        <div class="obs-alerts-list">
          <div v-for="(alert, i) in data.alerts" :key="i" class="obs-alert-item" :class="'obs-alert-' + alert.severity.toLowerCase()">
            <span class="obs-alert-severity">{{ alert.severity }}</span>
            <span class="obs-alert-category">{{ alert.category }}</span>
            <span class="obs-alert-message">{{ alert.message }}</span>
            <span class="obs-alert-node" v-if="alert.node_id">{{ alert.node_id }}</span>
          </div>
        </div>
      </section>

      <!-- ── Recommendations ─────────────────────────── -->
      <section v-if="data.recommendations.length > 0" class="obs-section">
        <h2 class="obs-section-title">Recommendations ({{ data.recommendations.length }})</h2>
        <div class="obs-recs-list">
          <div v-for="(rec, i) in data.recommendations" :key="i" class="obs-rec-item">
            <span class="obs-rec-type">{{ rec.type }}</span>
            <span class="obs-rec-message">{{ rec.message }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.obs-page { padding: 1.5rem 2rem; max-width: 1400px; }

.obs-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;
}
.obs-title {
  display: flex; align-items: center; gap: 0.6rem;
  font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin: 0;
}
.obs-title-icon { width: 24px; height: 24px; color: #818cf8; }

.obs-refresh {
  display: flex; align-items: center; gap: 0.75rem;
}
.obs-refresh-text { font-size: 0.8rem; color: #94a3b8; }
.obs-refresh-btn {
  padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.8rem; font-weight: 500;
  background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3);
  cursor: pointer; transition: all 0.2s;
}
.obs-refresh-btn:hover { background: rgba(99,102,241,0.25); }
.obs-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.obs-loading, .obs-error {
  display: flex; align-items: center; gap: 1rem; justify-content: center;
  padding: 3rem; color: #94a3b8; font-size: 0.9rem;
}
.obs-error { color: #f87171; }
.obs-error button {
  padding: 0.4rem 1rem; border-radius: 6px; background: rgba(239,68,68,0.15);
  color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor: pointer;
}
.obs-spinner {
  width: 20px; height: 20px; border: 2px solid rgba(129,140,248,0.3);
  border-top-color: #818cf8; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Section ── */
.obs-section { margin-bottom: 2rem; }
.obs-section-title {
  font-size: 1rem; font-weight: 600; color: #cbd5e1;
  margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
}

/* ── Metrics Grid ── */
.obs-metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;
}
.obs-metric-card {
  background: rgba(30,41,59,0.6); border: 1px solid rgba(99,102,241,0.15);
  border-radius: 10px; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.3rem;
}
.obs-metric-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
.obs-metric-value { font-size: 1.6rem; font-weight: 700; color: #e2e8f0; }
.obs-metric-sub { font-size: 0.78rem; color: #64748b; }

/* ── Capacity Bar ── */
.obs-capacity-bar {
  position: relative; height: 6px; background: rgba(100,116,139,0.25);
  border-radius: 3px; margin-top: 0.5rem; overflow: visible;
}
.obs-capacity-fill {
  height: 100%; border-radius: 3px; transition: width 0.6s ease;
}
.obs-capacity-threshold {
  position: absolute; top: -3px; width: 2px; height: 12px;
  background: rgba(251,191,36,0.7); border-radius: 1px;
}

/* ── Badges ── */
.obs-badge, .obs-badge-sm {
  display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px;
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; width: fit-content;
}
.obs-badge-sm { font-size: 0.65rem; padding: 0.1rem 0.4rem; }

.status-healthy { background: rgba(16,185,129,0.15); color: #34d399; }
.status-elevated { background: rgba(245,158,11,0.15); color: #fbbf24; }
.status-warning { background: rgba(249,115,22,0.15); color: #fb923c; }
.status-critical { background: rgba(239,68,68,0.15); color: #f87171; }
.status-unknown { background: rgba(100,116,139,0.15); color: #94a3b8; }

.text-warning { color: #f59e0b !important; }

/* ── Scaling ── */
.obs-scaling-card {
  display: flex; align-items: center; gap: 1rem; padding: 1.2rem 1.5rem;
  border-radius: 10px; border: 1px solid;
}
.obs-scaling-ok {
  background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.2);
}
.obs-scaling-required {
  background: rgba(249,115,22,0.06); border-color: rgba(249,115,22,0.3);
}
.obs-scaling-icon { font-size: 1.5rem; }
.obs-scaling-status { font-weight: 700; font-size: 0.9rem; color: #e2e8f0; }
.obs-scaling-detail { font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem; }

/* ── Health Grid ── */
.obs-health-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem;
}
.obs-health-card {
  display: flex; align-items: center; gap: 0.75rem;
  background: rgba(30,41,59,0.5); border: 1px solid rgba(100,116,139,0.15);
  border-radius: 8px; padding: 0.8rem 1rem;
}
.obs-health-icon {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; font-weight: 700; flex-shrink: 0;
}
.obs-health-info { flex: 1; min-width: 0; }
.obs-health-name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
.obs-health-detail { font-size: 0.75rem; color: #64748b; }

/* ── Alerts ── */
.obs-alerts-list { display: flex; flex-direction: column; gap: 0.5rem; }
.obs-alert-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.82rem;
  background: rgba(30,41,59,0.5); border: 1px solid rgba(100,116,139,0.15);
}
.obs-alert-warning { border-left: 3px solid #f59e0b; }
.obs-alert-critical { border-left: 3px solid #ef4444; }
.obs-alert-severity {
  font-weight: 700; font-size: 0.7rem; padding: 0.1rem 0.4rem;
  border-radius: 3px; text-transform: uppercase;
}
.obs-alert-warning .obs-alert-severity { background: rgba(245,158,11,0.15); color: #fbbf24; }
.obs-alert-critical .obs-alert-severity { background: rgba(239,68,68,0.15); color: #f87171; }
.obs-alert-category { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; }
.obs-alert-message { color: #cbd5e1; flex: 1; }
.obs-alert-node { color: #818cf8; font-size: 0.75rem; font-family: monospace; }

/* ── Recommendations ── */
.obs-recs-list { display: flex; flex-direction: column; gap: 0.5rem; }
.obs-rec-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.82rem;
  background: rgba(30,41,59,0.5); border: 1px solid rgba(99,102,241,0.15);
  border-left: 3px solid #818cf8;
}
.obs-rec-type {
  font-weight: 600; font-size: 0.7rem; padding: 0.1rem 0.4rem;
  border-radius: 3px; background: rgba(99,102,241,0.15); color: #a5b4fc;
  text-transform: uppercase;
}
.obs-rec-message { color: #cbd5e1; flex: 1; }

/* ── Scale Signal Recommendations ── */
.obs-scaling-recs {
  display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;
}
.obs-rec-badge {
  padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.78rem;
  font-weight: 600; letter-spacing: 0.02em;
}
.rec-session { background: rgba(99,102,241,0.15); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
.rec-node { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
.obs-scaling-reasons { margin-top: 0.5rem; }
.obs-reason { color: #94a3b8; font-size: 0.78rem; line-height: 1.5; }

/* ── Media Session Capacity ── */
.obs-session-capacity {
  background: rgba(30,41,59,0.5); border: 1px solid rgba(100,116,139,0.15);
  border-radius: 10px; padding: 1rem 1.2rem;
}
.obs-cap-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.45rem 0; border-bottom: 1px solid rgba(100,116,139,0.08);
}
.obs-cap-row:last-of-type { border-bottom: none; }
.obs-cap-label { font-size: 0.82rem; color: #94a3b8; }
.obs-cap-value { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
.obs-cap-ok { color: #34d399; }
.obs-cap-warn { color: #fbbf24; }
.obs-cap-dim { color: #64748b; font-weight: 400; }
.obs-scale-alert {
  margin-top: 0.75rem; padding: 0.5rem 0.8rem; border-radius: 6px;
  background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
  font-size: 0.78rem; color: #fb923c; font-weight: 500;
}
.obs-formula {
  margin-top: 0.5rem; padding: 0.6rem 0.8rem; border-radius: 6px;
  background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.12);
}
.obs-formula-label {
  font-size: 0.68rem; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.04em; display: block; margin-bottom: 0.3rem;
}
.obs-formula-code {
  font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
  color: #a5b4fc; line-height: 1.6; white-space: pre-wrap;
}
</style>
