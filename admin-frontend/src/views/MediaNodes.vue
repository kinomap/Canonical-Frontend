<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'

const router = useRouter()

interface MediaNode {
  id: string
  node_id: string
  name: string
  hostname: string | null
  public_url: string | null
  media_endpoint: string
  status: string
  health_status: string
  enabled: boolean
  capacity: number
  active_streams: number
  region: string | null
  egress_limit_mbps: number | null
  bandwidth_capacity: number | null
  max_configured_streams: number | null
  enrollment_token: string | null
  cpu_percent: number | null
  ram_percent: number | null
  network_egress_mbps: number | null
  session_count: number
  sessions_connected: number
  sessions_required: number
  sessions_additional: number
  stream_capacity: number
  stream_capacity_max: number
  target_egress_mbps: number | null
  worker_health: string | null
  uptime_seconds: number | null
  last_heartbeat: string | null
  last_health_check_at: string | null
  created_at: string
  updated_at: string
}

const nodes = ref<MediaNode[]>([])
const loading = ref(true)
const showCreateModal = ref(false)
const createdToken = ref<string | null>(null)
const confirmAction = ref<{ type: string, node: MediaNode } | null>(null)

const newNode = ref({
  name: '', hostname: '', public_url: '',
  control_endpoint: '', media_endpoint: '', management_endpoint: '',
  capacity: 100, region: '',
  bandwidth_capacity: null as number | null,
  max_configured_streams: null as number | null,
})

let refreshInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchNodes = async () => {
  try {
    const resp = await axios.get('/api/v1/admin/media/nodes', auth())
    nodes.value = resp.data
  } catch (err: any) {
    addToast('Failed to load nodes', 'error')
  } finally {
    loading.value = false
  }
}

const createNode = async () => {
  try {
    const payload: any = { name: newNode.value.name }
    if (newNode.value.hostname) payload.hostname = newNode.value.hostname
    if (newNode.value.public_url) payload.public_url = newNode.value.public_url
    if (newNode.value.control_endpoint) payload.control_endpoint = newNode.value.control_endpoint
    if (newNode.value.media_endpoint) payload.media_endpoint = newNode.value.media_endpoint
    if (newNode.value.management_endpoint) payload.management_endpoint = newNode.value.management_endpoint
    payload.capacity = newNode.value.capacity
    if (newNode.value.region) payload.region = newNode.value.region
    if (newNode.value.bandwidth_capacity) payload.bandwidth_capacity = newNode.value.bandwidth_capacity
    if (newNode.value.max_configured_streams) payload.max_configured_streams = newNode.value.max_configured_streams

    const resp = await axios.post('/api/v1/admin/media/nodes', payload, auth())
    createdToken.value = resp.data.enrollment_token
    addToast('Node registered successfully', 'success')
    await fetchNodes()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to create node', 'error')
  }
}

const performAction = async () => {
  if (!confirmAction.value) return
  const { type, node } = confirmAction.value
  try {
    if (type === 'enable') await axios.post(`/api/v1/admin/media/nodes/${node.id}/enable`, {}, auth())
    else if (type === 'disable') await axios.post(`/api/v1/admin/media/nodes/${node.id}/disable`, {}, auth())
    else if (type === 'drain') await axios.post(`/api/v1/admin/media/nodes/${node.id}/drain`, {}, auth())
    else if (type === 'delete') await axios.delete(`/api/v1/admin/media/nodes/${node.id}`, auth())
    addToast(`Node ${type}d successfully`, 'success')
    confirmAction.value = null
    await fetchNodes()
  } catch (err: any) {
    addToast(err.response?.data?.detail || `Failed to ${type} node`, 'error')
    confirmAction.value = null
  }
}

const statusClass = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: 'st-healthy', ONLINE: 'st-healthy', ACTIVE: 'st-healthy',
    REGISTERING: 'st-registering', REGISTERED: 'st-registering',
    DEGRADED: 'st-warning', WARNING: 'st-warning',
    DRAINING: 'st-warning', OFFLINE: 'st-offline', CRITICAL: 'st-critical',
    UNKNOWN: 'st-unknown', UNHEALTHY: 'st-critical',
  }
  return map[s] || 'st-unknown'
}

const formatUptime = (s: number | null) => {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const resetCreate = () => {
  showCreateModal.value = false
  createdToken.value = null
  newNode.value = { name: '', hostname: '', public_url: '', control_endpoint: '', media_endpoint: '', management_endpoint: '', capacity: 100, region: '', bandwidth_capacity: null, max_configured_streams: null }
}

onMounted(() => { fetchNodes(); refreshInterval = window.setInterval(fetchNodes, 15000) })
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
</script>

<template>
  <div class="mn-page">
    <div class="mn-header">
      <h1 class="mn-title">
        <svg class="mn-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
        Media Nodes
      </h1>
      <button class="mn-add-btn" @click="showCreateModal = true">+ Register Node</button>
    </div>

    <div v-if="loading" class="mn-loading"><div class="mn-spinner"></div> Loading nodes...</div>

    <div v-else-if="nodes.length === 0" class="mn-empty">
      <p>No Media Nodes registered.</p>
      <button @click="showCreateModal = true" class="mn-add-btn">+ Register First Node</button>
    </div>

    <div v-else class="mn-nodes-grid">
      <div v-for="node in nodes" :key="node.id" class="mn-node-card" @click="router.push(`/media-nodes/${node.id}`)">
        <div class="mn-node-header">
          <div class="mn-node-name">{{ node.name }}</div>
          <span class="mn-status-badge" :class="statusClass(node.status)">{{ node.status }}</span>
        </div>
        <div class="mn-node-id">{{ node.node_id }} <span v-if="node.region" class="mn-region">{{ node.region }}</span></div>

        <!-- No-heartbeat warning -->
        <div v-if="!node.last_heartbeat" class="mn-no-hb-warn">
          ⚠ No Heartbeat — Worker not connected
        </div>

        <div class="mn-node-metrics">
          <div class="mn-metric">
            <span class="mn-metric-label">Streams</span>
            <span class="mn-metric-val">{{ node.active_streams }} / {{ node.max_configured_streams || node.capacity }}</span>
          </div>
          <div class="mn-metric">
            <span class="mn-metric-label">CPU</span>
            <span class="mn-metric-val" :class="{ 'mn-no-data': node.cpu_percent === null }">{{ node.cpu_percent !== null ? node.cpu_percent.toFixed(0) + '%' : '—' }}</span>
          </div>
          <div class="mn-metric">
            <span class="mn-metric-label">RAM</span>
            <span class="mn-metric-val" :class="{ 'mn-no-data': node.ram_percent === null }">{{ node.ram_percent !== null ? node.ram_percent.toFixed(0) + '%' : '—' }}</span>
          </div>
          <div class="mn-metric">
            <span class="mn-metric-label">Egress</span>
            <span class="mn-metric-val" :class="{ 'mn-no-data': node.network_egress_mbps === null }">{{ node.network_egress_mbps !== null ? node.network_egress_mbps.toFixed(1) + ' Mbps' : '—' }}</span>
          </div>
          <div class="mn-metric">
            <span class="mn-metric-label">Sessions</span>
            <span class="mn-metric-val" :class="{ 'mn-sess-warn': node.sessions_additional > 0 }">{{ node.sessions_connected }} / {{ node.sessions_required }}</span>
          </div>
          <div class="mn-metric">
            <span class="mn-metric-label">Heartbeat</span>
            <span class="mn-metric-val" :class="{ 'mn-hb-never': !node.last_heartbeat }">{{ node.last_heartbeat ? timeAgo(node.last_heartbeat) : 'Never' }}</span>
          </div>
        </div>

        <div class="mn-node-footer">
          <span class="mn-health-badge" :class="statusClass(node.health_status)">{{ node.health_status }}</span>
          <span class="mn-uptime" v-if="node.uptime_seconds">Uptime: {{ formatUptime(node.uptime_seconds) }}</span>
          <span class="mn-uptime mn-no-data" v-else>No telemetry</span>
        </div>

        <div class="mn-node-actions" @click.stop>
          <button v-if="!node.enabled" class="mn-action-btn mn-action-enable" @click="confirmAction = { type: 'enable', node }">Enable</button>
          <button v-if="node.enabled && node.status !== 'DRAINING'" class="mn-action-btn mn-action-drain" @click="confirmAction = { type: 'drain', node }">Drain</button>
          <button v-if="node.enabled" class="mn-action-btn mn-action-disable" @click="confirmAction = { type: 'disable', node }">Disable</button>
          <button class="mn-action-btn mn-action-delete" @click="confirmAction = { type: 'delete', node }">Delete</button>
        </div>
      </div>
    </div>

    <!-- ── Create Modal ── -->
    <div v-if="showCreateModal" class="mn-modal-overlay" @click.self="resetCreate">
      <div class="mn-modal">
        <template v-if="!createdToken">
          <h2 class="mn-modal-title">Register New Media Node</h2>
          <div class="mn-form-grid">
            <div class="mn-form-group"><label>Name *</label><input v-model="newNode.name" placeholder="media-node-01" /></div>
            <div class="mn-form-group"><label>Region</label><input v-model="newNode.region" placeholder="eu-west-1" /></div>
            <div class="mn-form-group"><label>Hostname</label><input v-model="newNode.hostname" placeholder="node01.example.com" /></div>
            <div class="mn-form-group"><label>Public URL</label><input v-model="newNode.public_url" placeholder="https://media.example.com" /></div>
            <div class="mn-form-group"><label>Control Endpoint</label><input v-model="newNode.control_endpoint" placeholder="http://10.0.0.1:8100" /></div>
            <div class="mn-form-group"><label>Media Endpoint</label><input v-model="newNode.media_endpoint" placeholder="http://10.0.0.1:8100" /></div>
            <div class="mn-form-group"><label>Management Endpoint</label><input v-model="newNode.management_endpoint" placeholder="http://10.0.0.1:8100" /></div>
            <div class="mn-form-group"><label>Bandwidth (Mbps)</label><input v-model.number="newNode.bandwidth_capacity" type="number" placeholder="1000" /></div>
            <div class="mn-form-group"><label>Max Streams</label><input v-model.number="newNode.max_configured_streams" type="number" placeholder="100" /></div>
          </div>
          <div class="mn-modal-actions">
            <button class="mn-btn-secondary" @click="resetCreate">Cancel</button>
            <button class="mn-btn-primary" @click="createNode" :disabled="!newNode.name">Register</button>
          </div>
        </template>
        <template v-else>
          <h2 class="mn-modal-title">✓ Node Registered</h2>
          <p class="mn-modal-subtitle">Use this enrollment token to bootstrap the Media Worker:</p>
          <div class="mn-token-display">
            <code>{{ createdToken }}</code>
          </div>
          <div class="mn-bootstrap-cmd">
            <label>Docker bootstrap command:</label>
            <code class="mn-cmd">ENROLLMENT_TOKEN={{ createdToken }} docker compose -f docker-compose.media-worker.yml up -d</code>
          </div>
          <p class="mn-token-warning">⚠ This token is shown once. Save it now.</p>
          <div class="mn-modal-actions">
            <button class="mn-btn-primary" @click="resetCreate">Done</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ── Confirm Modal ── -->
    <div v-if="confirmAction" class="mn-modal-overlay" @click.self="confirmAction = null">
      <div class="mn-modal mn-modal-sm">
        <h2 class="mn-modal-title">Confirm {{ confirmAction.type }}</h2>
        <p class="mn-confirm-text">
          Are you sure you want to <strong>{{ confirmAction.type }}</strong> node
          <strong>{{ confirmAction.node.name }}</strong>?
        </p>
        <p v-if="confirmAction.type === 'delete'" class="mn-confirm-warn">⚠ This action cannot be undone.</p>
        <p v-if="confirmAction.type === 'drain'" class="mn-confirm-info">
          Node will stop accepting new streams. Existing streams will continue until completion.
        </p>
        <div class="mn-modal-actions">
          <button class="mn-btn-secondary" @click="confirmAction = null">Cancel</button>
          <button class="mn-btn-danger" v-if="confirmAction.type === 'delete'" @click="performAction">Delete</button>
          <button class="mn-btn-primary" v-else @click="performAction">{{ confirmAction.type }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mn-page { padding: 1.5rem 2rem; max-width: 1400px; }
.mn-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.mn-title { display: flex; align-items: center; gap: 0.6rem; font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin: 0; }
.mn-title-icon { width: 24px; height: 24px; color: #818cf8; }
.mn-add-btn {
  padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: linear-gradient(135deg, #6366f1, #818cf8); color: #fff; border: none;
  cursor: pointer; transition: all 0.2s;
}
.mn-add-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }

.mn-loading { display: flex; align-items: center; gap: 0.75rem; padding: 3rem; justify-content: center; color: #94a3b8; }
.mn-spinner { width: 18px; height: 18px; border: 2px solid rgba(129,140,248,0.3); border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mn-empty { text-align: center; padding: 4rem 2rem; color: #64748b; }
.mn-empty p { margin-bottom: 1rem; }

/* ── Node Grid ── */
.mn-nodes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 1rem; }
.mn-node-card {
  background: rgba(30,41,59,0.6); border: 1px solid rgba(99,102,241,0.12);
  border-radius: 12px; padding: 1.2rem; cursor: pointer;
  transition: all 0.2s; position: relative;
}
.mn-node-card:hover { border-color: rgba(99,102,241,0.3); transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.2); }

.mn-node-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3rem; }
.mn-node-name { font-size: 1.05rem; font-weight: 700; color: #e2e8f0; }
.mn-node-id { font-size: 0.75rem; color: #64748b; font-family: monospace; margin-bottom: 0.8rem; }
.mn-region { background: rgba(99,102,241,0.12); color: #a5b4fc; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.5rem; }

.mn-node-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.8rem; }
.mn-metric { display: flex; flex-direction: column; gap: 0.1rem; }
.mn-metric-label { font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
.mn-metric-val { font-size: 0.85rem; font-weight: 600; color: #cbd5e1; }

.mn-node-footer { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.mn-uptime { font-size: 0.75rem; color: #64748b; }

.mn-node-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.mn-action-btn {
  padding: 0.3rem 0.6rem; border-radius: 5px; font-size: 0.72rem; font-weight: 500;
  border: 1px solid; cursor: pointer; transition: all 0.2s; background: transparent;
}
.mn-action-enable { color: #34d399; border-color: rgba(16,185,129,0.3); }
.mn-action-enable:hover { background: rgba(16,185,129,0.1); }
.mn-action-drain { color: #fbbf24; border-color: rgba(251,191,36,0.3); }
.mn-action-drain:hover { background: rgba(251,191,36,0.1); }
.mn-action-disable { color: #94a3b8; border-color: rgba(148,163,184,0.3); }
.mn-action-disable:hover { background: rgba(148,163,184,0.1); }
.mn-action-delete { color: #f87171; border-color: rgba(248,113,113,0.3); }
.mn-action-delete:hover { background: rgba(248,113,113,0.1); }

/* ── Status badges ── */
.mn-status-badge, .mn-health-badge {
  padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.03em;
}
.st-healthy { background: rgba(16,185,129,0.15); color: #34d399; }
.st-registering { background: rgba(99,102,241,0.15); color: #a5b4fc; }
.st-warning { background: rgba(249,115,22,0.15); color: #fb923c; }
.st-offline { background: rgba(100,116,139,0.15); color: #94a3b8; }
.st-critical { background: rgba(239,68,68,0.15); color: #f87171; }
.st-unknown { background: rgba(100,116,139,0.1); color: #64748b; }

/* ── Modal ── */
.mn-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex;
  align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px);
}
.mn-modal {
  background: #1e293b; border: 1px solid rgba(99,102,241,0.2); border-radius: 16px;
  padding: 2rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;
}
.mn-modal-sm { max-width: 420px; }
.mn-modal-title { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin: 0 0 1rem; }
.mn-modal-subtitle { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem; }

.mn-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.mn-form-group { display: flex; flex-direction: column; gap: 0.3rem; }
.mn-form-group label { font-size: 0.75rem; color: #94a3b8; font-weight: 500; }
.mn-form-group input {
  padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem;
  background: rgba(15,23,42,0.8); border: 1px solid rgba(100,116,139,0.3);
  color: #e2e8f0; outline: none;
}
.mn-form-group input:focus { border-color: #818cf8; }

.mn-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
.mn-btn-primary {
  padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: linear-gradient(135deg, #6366f1, #818cf8); color: #fff; border: none; cursor: pointer;
}
.mn-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.mn-btn-secondary {
  padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
  background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); cursor: pointer;
}
.mn-btn-danger {
  padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor: pointer;
}

.mn-token-display {
  background: rgba(15,23,42,0.9); border: 1px solid rgba(99,102,241,0.3);
  border-radius: 8px; padding: 1rem; margin-bottom: 1rem;
}
.mn-token-display code { color: #a5b4fc; font-size: 0.85rem; word-break: break-all; }

.mn-bootstrap-cmd { margin-bottom: 1rem; }
.mn-bootstrap-cmd label { font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 0.4rem; }
.mn-cmd {
  display: block; background: rgba(15,23,42,0.9); border: 1px solid rgba(100,116,139,0.3);
  border-radius: 6px; padding: 0.7rem; font-size: 0.78rem; color: #34d399; word-break: break-all;
}
.mn-token-warning { font-size: 0.8rem; color: #fbbf24; }
.mn-confirm-text { color: #cbd5e1; font-size: 0.9rem; }
.mn-confirm-warn { color: #f87171; font-size: 0.8rem; }
.mn-confirm-info { color: #94a3b8; font-size: 0.8rem; }

.mn-no-hb-warn {
  background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
  border-radius: 6px; padding: 0.4rem 0.7rem; margin-bottom: 0.8rem;
  font-size: 0.75rem; color: #fb923c; font-weight: 500;
}
.mn-no-data { color: #475569 !important; font-weight: 400 !important; }
.mn-hb-never { color: #fb923c !important; }
.mn-sess-warn { color: #fbbf24 !important; font-weight: 600 !important; }
</style>
