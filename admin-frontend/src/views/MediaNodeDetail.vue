<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'

const route = useRoute()
const router = useRouter()
const nodeId = route.params.id as string

interface NodeDetail {
  id: string; node_id: string; name: string; hostname: string | null
  public_url: string | null; media_endpoint: string; status: string
  health_status: string; enabled: boolean; capacity: number
  active_streams: number; region: string | null
  egress_limit_mbps: number | null; bandwidth_capacity: number | null
  max_configured_streams: number | null; enrollment_token: string | null
  cpu_percent: number | null; ram_percent: number | null
  network_egress_mbps: number | null; session_count: number
  sessions_connected: number; sessions_required: number; sessions_additional: number
  stream_capacity: number; stream_capacity_max: number; target_egress_mbps: number | null
  worker_health: string | null; uptime_seconds: number | null
  last_heartbeat: string | null; last_health_check_at: string | null
  created_at: string; updated_at: string
}

interface TelemetryNode {
  node_id: string; capacity_percent: number; status: string; bottleneck: string
  network: any; cpu: any; ram: any; streams: any; sessions: any
  headroom_mbps: number | null; peak_egress_mbps: number
  active_sessions: number; healthy_sessions: number
  active_streams: number; active_viewers: number
  worker_health: string; uptime_seconds: number
  errors_per_sec: number; cache_hit_ratio: number
  ttff_p50: number | null; ttff_p95: number | null; ttff_p99: number | null
  telemetry_age_seconds: number; is_stale: boolean
}

interface SessionItem {
  id: string; account_identifier: string; status: string; health_status: string
  active_streams: number; max_streams: number; node_id: string | null; node_name: string | null
}

const node = ref<NodeDetail | null>(null)
const telemetry = ref<TelemetryNode | null>(null)
const sessions = ref<SessionItem[]>([])
const loading = ref(true)
const confirmAction = ref<string | null>(null)
let refreshInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchAll = async () => {
  try {
    const [nodeResp, telResp, sessResp] = await Promise.allSettled([
      axios.get(`/api/v1/admin/media/nodes/${nodeId}`, auth()),
      axios.get(`/api/v1/admin/telemetry/nodes`, auth()),
      axios.get('/api/v1/admin/media/sessions', auth()),
    ])
    if (nodeResp.status === 'fulfilled') node.value = nodeResp.value.data
    if (telResp.status === 'fulfilled') {
      const all = telResp.value.data as TelemetryNode[]
      telemetry.value = all.find((t: TelemetryNode) => node.value && t.node_id === node.value.node_id) || null
    }
    if (sessResp.status === 'fulfilled') {
      sessions.value = (sessResp.value.data as SessionItem[]).filter(
        (s: SessionItem) => s.node_id === nodeId
      )
    }
  } catch (err: any) {
    addToast('Failed to load node details', 'error')
  } finally { loading.value = false }
}

const performAction = async (action: string) => {
  if (!node.value) return
  try {
    if (action === 'enable') await axios.post(`/api/v1/admin/media/nodes/${nodeId}/enable`, {}, auth())
    else if (action === 'disable') await axios.post(`/api/v1/admin/media/nodes/${nodeId}/disable`, {}, auth())
    else if (action === 'drain') await axios.post(`/api/v1/admin/media/nodes/${nodeId}/drain`, {}, auth())
    else if (action === 'delete') {
      await axios.delete(`/api/v1/admin/media/nodes/${nodeId}`, auth())
      router.push('/media-nodes')
      return
    }
    addToast(`Node ${action}d`, 'success')
    confirmAction.value = null
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || `Failed to ${action}`, 'error')
    confirmAction.value = null
  }
}

const statusClass = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: 'st-healthy', ONLINE: 'st-healthy', ACTIVE: 'st-healthy',
    REGISTERING: 'st-reg', REGISTERED: 'st-reg',
    DEGRADED: 'st-warn', DRAINING: 'st-warn', WARNING: 'st-warn',
    OFFLINE: 'st-off', CRITICAL: 'st-crit', UNKNOWN: 'st-unk', UNHEALTHY: 'st-crit',
  }
  return map[s] || 'st-unk'
}

const formatUptime = (s: number | null | undefined) => {
  if (!s) return 'Telemetry unavailable'
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`
  return `${h}h ${m}m`
}

const dimPercent = (dim: any) => {
  if (!dim || dim.capacity <= 0) return null
  return Math.round((dim.current / dim.capacity) * 100)
}

onMounted(() => { fetchAll(); refreshInterval = window.setInterval(fetchAll, 15000) })
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
</script>

<template>
  <div class="nd-page">
    <button class="nd-back" @click="router.push('/media-nodes')">← Media Nodes</button>

    <div v-if="loading" class="nd-loading"><div class="nd-spinner"></div> Loading...</div>

    <template v-else-if="node">
      <div class="nd-header">
        <div>
          <h1 class="nd-title">{{ node.name }}</h1>
          <div class="nd-subtitle">{{ node.node_id }} <span v-if="node.region" class="nd-region">{{ node.region }}</span></div>
        </div>
        <div class="nd-header-badges">
          <span class="nd-badge" :class="statusClass(node.status)">{{ node.status }}</span>
          <span class="nd-badge" :class="statusClass(node.health_status)">{{ node.health_status }}</span>
        </div>
      </div>

      <!-- ── Identity ── -->
      <section class="nd-section">
        <h2 class="nd-section-title">Identity</h2>
        <div class="nd-info-grid">
          <div class="nd-info"><span class="nd-info-label">Node ID</span><span class="nd-info-val">{{ node.node_id }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Hostname</span><span class="nd-info-val">{{ node.hostname || '—' }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Media Endpoint</span><span class="nd-info-val">{{ node.media_endpoint || 'Via Nginx (relative)' }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Public URL</span><span class="nd-info-val">{{ node.public_url || '—' }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Last Heartbeat</span><span class="nd-info-val" :class="!node.last_heartbeat ? 'nd-stale' : ''">{{ node.last_heartbeat ? new Date(node.last_heartbeat).toLocaleString() : 'No heartbeat received' }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Created</span><span class="nd-info-val">{{ node.created_at }}</span></div>
        </div>
      </section>

      <!-- ── Capacity ── -->
      <section class="nd-section" v-if="telemetry">
        <h2 class="nd-section-title">Capacity</h2>
        <div class="nd-capacity-grid">
          <div class="nd-cap-card" v-for="dim in [
            { label: 'Network', dim: telemetry.network, unit: 'Mbps' },
            { label: 'CPU', dim: telemetry.cpu, unit: '%' },
            { label: 'RAM', dim: telemetry.ram, unit: 'MB' },
            { label: 'Streams', dim: telemetry.streams, unit: '' },
            { label: 'Sessions', dim: telemetry.sessions, unit: '' },
          ]" :key="dim.label">
            <div class="nd-cap-label">{{ dim.label }}</div>
            <div class="nd-cap-bar">
              <div class="nd-cap-fill" :style="{ width: (dimPercent(dim.dim) ?? 0) + '%' }"></div>
            </div>
            <div class="nd-cap-vals">
              <span>{{ dim.dim?.current?.toFixed(1) ?? '—' }}</span>
              <span class="nd-cap-sep">/</span>
              <span>{{ dim.dim?.capacity?.toFixed(0) ?? '—' }} {{ dim.unit }}</span>
              <span class="nd-cap-pct">({{ dimPercent(dim.dim) ?? '—' }}%)</span>
            </div>
          </div>
        </div>
        <div class="nd-cap-summary">
          <span>Effective Capacity: <strong>{{ telemetry.capacity_percent.toFixed(0) }}%</strong></span>
          <span>Bottleneck: <strong>{{ telemetry.bottleneck }}</strong></span>
          <span>Peak Egress: <strong>{{ telemetry.peak_egress_mbps.toFixed(1) }} Mbps</strong></span>
        </div>
      </section>

      <!-- ── Worker ── -->
      <section class="nd-section">
        <h2 class="nd-section-title">Worker</h2>
        <div class="nd-info-grid">
          <div class="nd-info"><span class="nd-info-label">Health</span><span class="nd-badge" :class="statusClass(node.worker_health || 'UNKNOWN')">{{ node.worker_health || 'UNKNOWN' }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Uptime</span><span class="nd-info-val">{{ formatUptime(node.uptime_seconds) }}</span></div>
          <div class="nd-info"><span class="nd-info-label">Active Streams</span><span class="nd-info-val">{{ node.active_streams }}</span></div>
          <div class="nd-info" v-if="telemetry"><span class="nd-info-label">Errors/sec</span><span class="nd-info-val">{{ telemetry.errors_per_sec.toFixed(2) }}</span></div>
          <div class="nd-info" v-if="telemetry"><span class="nd-info-label">Cache Hit Ratio</span><span class="nd-info-val">{{ (telemetry.cache_hit_ratio * 100).toFixed(0) }}%</span></div>
          <div class="nd-info" v-if="telemetry"><span class="nd-info-label">TTFF p95</span><span class="nd-info-val">{{ telemetry.ttff_p95 !== null ? telemetry.ttff_p95.toFixed(0) + ' ms' : '—' }}</span></div>
        </div>
      </section>

      <!-- ── Session Capacity ── -->
      <section class="nd-section" v-if="node">
        <h2 class="nd-section-title">Session Capacity</h2>
        <div class="nd-info-grid">
          <div class="nd-info">
            <span class="nd-info-label">Sessions</span>
            <span class="nd-info-val" :class="{ 'nd-sess-warn': node.sessions_additional > 0 }">
              {{ node.sessions_connected }} / {{ node.sessions_required }}
            </span>
          </div>
          <div class="nd-info">
            <span class="nd-info-label">Stream Capacity</span>
            <span class="nd-info-val">{{ node.stream_capacity }} / {{ node.stream_capacity_max }}</span>
          </div>
          <div class="nd-info">
            <span class="nd-info-label">Target Egress</span>
            <span class="nd-info-val">{{ node.target_egress_mbps || '—' }} Mbps</span>
          </div>
          <div class="nd-info" v-if="node.sessions_additional > 0">
            <span class="nd-info-label">Additional Needed</span>
            <span class="nd-info-val nd-sess-warn">+{{ node.sessions_additional }} sessions</span>
          </div>
        </div>
        <div v-if="node.sessions_additional > 0" class="nd-scale-warn">
          ⚠ Scale Required — {{ node.sessions_additional }} additional session{{ node.sessions_additional > 1 ? 's' : '' }} needed to reach target capacity
        </div>
      </section>

      <!-- ── Sessions ── -->
      <section class="nd-section">
        <h2 class="nd-section-title">Assigned Sessions ({{ sessions.length }})</h2>
        <div v-if="sessions.length === 0" class="nd-empty">No sessions assigned to this node.</div>
        <table v-else class="nd-table">
          <thead><tr><th>Account</th><th>Status</th><th>Health</th><th>Streams</th></tr></thead>
          <tbody>
            <tr v-for="s in sessions" :key="s.id" @click="router.push(`/media-sessions/${s.id}`)" class="nd-table-row">
              <td>{{ s.account_identifier }}</td>
              <td><span class="nd-badge-sm" :class="statusClass(s.status)">{{ s.status }}</span></td>
              <td><span class="nd-badge-sm" :class="statusClass(s.health_status)">{{ s.health_status }}</span></td>
              <td>{{ s.active_streams }} / {{ s.max_streams }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Actions ── -->
      <section class="nd-section">
        <h2 class="nd-section-title">Actions</h2>
        <div class="nd-actions">
          <button v-if="!node.enabled" class="nd-act-btn nd-act-enable" @click="confirmAction = 'enable'">Enable</button>
          <button v-if="node.enabled && node.status !== 'DRAINING'" class="nd-act-btn nd-act-drain" @click="confirmAction = 'drain'">Drain</button>
          <button v-if="node.enabled" class="nd-act-btn nd-act-disable" @click="confirmAction = 'disable'">Disable</button>
          <button class="nd-act-btn nd-act-delete" @click="confirmAction = 'delete'">Delete</button>
        </div>
      </section>
    </template>

    <!-- ── Confirm Modal ── -->
    <div v-if="confirmAction" class="nd-overlay" @click.self="confirmAction = null">
      <div class="nd-modal">
        <h3>Confirm {{ confirmAction }}</h3>
        <p>Are you sure you want to <strong>{{ confirmAction }}</strong> this node?</p>
        <div class="nd-modal-btns">
          <button class="nd-btn-sec" @click="confirmAction = null">Cancel</button>
          <button :class="confirmAction === 'delete' ? 'nd-btn-danger' : 'nd-btn-pri'" @click="performAction(confirmAction!)">{{ confirmAction }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nd-page { padding: 1.5rem 2rem; max-width: 1200px; }
.nd-back { background: none; border: none; color: #818cf8; cursor: pointer; font-size: 0.85rem; padding: 0; margin-bottom: 1rem; display: block; }
.nd-back:hover { text-decoration: underline; }
.nd-loading { display: flex; align-items: center; gap: 0.75rem; justify-content: center; padding: 3rem; color: #94a3b8; }
.nd-spinner { width: 18px; height: 18px; border: 2px solid rgba(129,140,248,0.3); border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.nd-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
.nd-title { font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin: 0; }
.nd-subtitle { font-size: 0.8rem; color: #64748b; font-family: monospace; }
.nd-region { background: rgba(99,102,241,0.12); color: #a5b4fc; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.4rem; }
.nd-header-badges { display: flex; gap: 0.4rem; }

.nd-section { margin-bottom: 1.5rem; }
.nd-section-title { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em; }

.nd-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; }
.nd-info { display: flex; flex-direction: column; gap: 0.15rem; background: rgba(30,41,59,0.5); padding: 0.6rem 0.8rem; border-radius: 6px; }
.nd-info-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
.nd-info-val { font-size: 0.85rem; color: #cbd5e1; word-break: break-all; }

.nd-capacity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
.nd-cap-card { background: rgba(30,41,59,0.5); padding: 0.7rem 0.9rem; border-radius: 8px; }
.nd-cap-label { font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.3rem; }
.nd-cap-bar { height: 5px; background: rgba(100,116,139,0.2); border-radius: 3px; margin-bottom: 0.3rem; }
.nd-cap-fill { height: 100%; border-radius: 3px; background: #818cf8; transition: width 0.5s; }
.nd-cap-vals { font-size: 0.78rem; color: #cbd5e1; }
.nd-cap-sep { color: #475569; margin: 0 0.15rem; }
.nd-cap-pct { color: #64748b; margin-left: 0.3rem; }
.nd-cap-summary { display: flex; gap: 2rem; margin-top: 0.75rem; font-size: 0.82rem; color: #94a3b8; flex-wrap: wrap; }
.nd-cap-summary strong { color: #e2e8f0; }

.nd-empty { color: #64748b; font-size: 0.85rem; padding: 1rem 0; }

.nd-table { width: 100%; border-collapse: collapse; }
.nd-table th { text-align: left; font-size: 0.72rem; color: #64748b; text-transform: uppercase; padding: 0.5rem; border-bottom: 1px solid rgba(100,116,139,0.15); }
.nd-table td { padding: 0.6rem 0.5rem; font-size: 0.85rem; color: #cbd5e1; border-bottom: 1px solid rgba(100,116,139,0.08); }
.nd-table-row { cursor: pointer; }
.nd-table-row:hover { background: rgba(99,102,241,0.05); }

.nd-badge, .nd-badge-sm { padding: 0.12rem 0.45rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
.nd-badge-sm { font-size: 0.65rem; padding: 0.08rem 0.35rem; }
.st-healthy { background: rgba(16,185,129,0.15); color: #34d399; }
.st-reg { background: rgba(99,102,241,0.15); color: #a5b4fc; }
.st-warn { background: rgba(249,115,22,0.15); color: #fb923c; }
.st-off { background: rgba(100,116,139,0.15); color: #94a3b8; }
.st-crit { background: rgba(239,68,68,0.15); color: #f87171; }
.st-unk { background: rgba(100,116,139,0.1); color: #64748b; }

.nd-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.nd-act-btn { padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.82rem; font-weight: 500; cursor: pointer; border: 1px solid; background: transparent; }
.nd-act-enable { color: #34d399; border-color: rgba(16,185,129,0.3); }
.nd-act-enable:hover { background: rgba(16,185,129,0.1); }
.nd-act-drain { color: #fbbf24; border-color: rgba(251,191,36,0.3); }
.nd-act-drain:hover { background: rgba(251,191,36,0.1); }
.nd-act-disable { color: #94a3b8; border-color: rgba(148,163,184,0.3); }
.nd-act-disable:hover { background: rgba(148,163,184,0.1); }
.nd-act-delete { color: #f87171; border-color: rgba(248,113,113,0.3); }
.nd-act-delete:hover { background: rgba(248,113,113,0.1); }

.nd-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.nd-modal { background: #1e293b; border: 1px solid rgba(99,102,241,0.2); border-radius: 12px; padding: 1.5rem; max-width: 400px; width: 90%; }
.nd-modal h3 { color: #e2e8f0; margin: 0 0 0.8rem; }
.nd-modal p { color: #94a3b8; font-size: 0.9rem; }
.nd-modal-btns { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.2rem; }
.nd-btn-sec { padding: 0.4rem 1rem; border-radius: 6px; background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); cursor: pointer; }
.nd-btn-pri { padding: 0.4rem 1rem; border-radius: 6px; background: #6366f1; color: #fff; border: none; cursor: pointer; }
.nd-btn-danger { padding: 0.4rem 1rem; border-radius: 6px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor: pointer; }
.nd-sess-warn { color: #fbbf24 !important; font-weight: 600; }
.nd-scale-warn {
  margin-top: 0.6rem; padding: 0.5rem 0.8rem; border-radius: 6px;
  background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
  font-size: 0.78rem; color: #fb923c; font-weight: 500;
}
.nd-stale { color: #fb923c; font-style: italic; }
</style>
