<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'
import SessionAuthWizard from '../components/SessionAuthWizard.vue'

const route = useRoute()
const router = useRouter()
const sessionId = route.params.id as string

interface SessionDetail {
  id: string; name: string | null; account_identifier: string; session_identifier: string
  telegram_user_id: number | null; telegram_username: string | null
  telegram_phone: string | null; credentials_configured: boolean
  status: string; health_status: string; enabled: boolean
  active_streams: number; max_streams: number; error_count: number
  last_error: string | null; last_health_check: string | null
  last_heartbeat_at: string | null; node_id: string | null; node_name: string | null
  created_at: string; updated_at: string
}

interface MediaNode { id: string; node_id: string; name: string; status: string }

const session = ref<SessionDetail | null>(null)
const nodes = ref<MediaNode[]>([])
const loading = ref(true)
const confirmAction = ref<string | null>(null)
const showMoveModal = ref(false)
const moveNodeId = ref('')
const showAuthWizard = ref(false)
let refreshInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchAll = async () => {
  try {
    const [sResp, nResp] = await Promise.all([
      axios.get(`/api/v1/admin/media/sessions/${sessionId}`, auth()),
      axios.get('/api/v1/admin/media/nodes', auth()),
    ])
    session.value = sResp.data
    nodes.value = nResp.data
  } catch (err: any) {
    addToast('Failed to load session', 'error')
  } finally { loading.value = false }
}

const performAction = async (action: string) => {
  try {
    if (action === 'enable') await axios.post(`/api/v1/admin/media/sessions/${sessionId}/enable`, {}, auth())
    else if (action === 'disable') await axios.post(`/api/v1/admin/media/sessions/${sessionId}/disable`, {}, auth())
    else if (action === 'drain') await axios.post(`/api/v1/admin/media/sessions/${sessionId}/drain`, {}, auth())
    else if (action === 'delete') {
      await axios.delete(`/api/v1/admin/media/sessions/${sessionId}`, auth())
      router.push('/media-sessions')
      return
    }
    addToast(`Session ${action}d`, 'success')
    confirmAction.value = null
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || `Failed: ${action}`, 'error')
    confirmAction.value = null
  }
}

const doMove = async () => {
  if (!moveNodeId.value) return
  try {
    await axios.post(`/api/v1/admin/media/sessions/${sessionId}/move`, { target_node_id: moveNodeId.value }, auth())
    addToast('Session moved', 'success')
    showMoveModal.value = false
    moveNodeId.value = ''
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Move failed', 'error')
  }
}

const doAssign = async () => {
  if (!moveNodeId.value) return
  try {
    await axios.post(`/api/v1/admin/media/sessions/${sessionId}/assign`, { target_node_id: moveNodeId.value }, auth())
    addToast('Session assigned', 'success')
    showMoveModal.value = false
    moveNodeId.value = ''
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Assignment failed', 'error')
  }
}

const statusClass = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: 'st-h', ACTIVE: 'st-h', DEGRADED: 'st-w', DRAINING: 'st-w',
    COOLDOWN: 'st-w', STALE: 'st-w', WARNING: 'st-w',
    OFFLINE: 'st-off', CRITICAL: 'st-c', UNHEALTHY: 'st-c', UNKNOWN: 'st-u',
    AUTH_REQUIRED: 'st-auth', AUTHORIZING: 'st-w', PENDING: 'st-u',
  }
  return map[s] || 'st-u'
}

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

onMounted(() => { fetchAll(); refreshInterval = window.setInterval(fetchAll, 15000) })
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
</script>

<template>
  <div class="sd-page">
    <button class="sd-back" @click="router.push('/media-sessions')">← Sessions</button>

    <div v-if="loading" class="sd-loading"><div class="sd-spinner"></div> Loading...</div>

    <template v-else-if="session">
      <div class="sd-header">
        <div>
          <h1 class="sd-title">📱 {{ session.telegram_phone || session.name || session.account_identifier }}</h1>
          <div class="sd-subtitle">{{ session.session_identifier }}<span v-if="session.telegram_username" class="sd-tg-user"> · @{{ session.telegram_username }}</span></div>
        </div>
        <div class="sd-badges">
          <span class="sd-badge" :class="statusClass(session.status)">{{ session.status }}</span>
          <span class="sd-badge" :class="statusClass(session.health_status)">{{ session.health_status }}</span>
        </div>
      </div>

      <!-- ── Identity ── -->
      <section class="sd-section">
        <h2 class="sd-section-title">Identity</h2>
        <div class="sd-grid">
          <div class="sd-field"><span class="sd-label">Phone</span><span class="sd-val">{{ session.telegram_phone || 'N/A' }}</span></div>
          <div class="sd-field"><span class="sd-label">Telegram ID</span><span class="sd-val">{{ session.telegram_user_id || 'N/A' }}</span></div>
          <div class="sd-field"><span class="sd-label">Username</span><span class="sd-val">{{ session.telegram_username ? '@' + session.telegram_username : 'N/A' }}</span></div>
          <div class="sd-field"><span class="sd-label">Role</span><span class="sd-val sd-role">Media</span></div>
          <div class="sd-field"><span class="sd-label">Session ID</span><span class="sd-val sd-mono">{{ session.id }}</span></div>
          <div class="sd-field"><span class="sd-label">Account</span><span class="sd-val">{{ session.account_identifier }}</span></div>
          <div class="sd-field"><span class="sd-label">Session File</span><span class="sd-val sd-mono">{{ session.session_identifier }}</span></div>
          <div class="sd-field"><span class="sd-label">Credentials</span><span class="sd-val">{{ session.credentials_configured ? '✓ Configured' : '✕ Missing' }}</span></div>
        </div>
      </section>

      <!-- ── Runtime ── -->
      <section class="sd-section">
        <h2 class="sd-section-title">Runtime</h2>
        <div class="sd-grid">
          <div class="sd-field"><span class="sd-label">Status</span><span class="sd-badge" :class="statusClass(session.status)">{{ session.status }}</span></div>
          <div class="sd-field"><span class="sd-label">Health</span><span class="sd-badge" :class="statusClass(session.health_status)">{{ session.health_status }}</span></div>
          <div class="sd-field"><span class="sd-label">Enabled</span><span class="sd-val">{{ session.enabled ? '✓ Yes' : '✕ No' }}</span></div>
          <div class="sd-field"><span class="sd-label">Heartbeat</span><span class="sd-val">{{ timeAgo(session.last_heartbeat_at) }}</span></div>
          <div class="sd-field"><span class="sd-label">Health Check</span><span class="sd-val">{{ timeAgo(session.last_health_check) }}</span></div>
        </div>
      </section>

      <!-- ── Streams ── -->
      <section class="sd-section">
        <h2 class="sd-section-title">Streams</h2>
        <div class="sd-grid">
          <div class="sd-field">
            <span class="sd-label">Active / Capacity</span>
            <span class="sd-val sd-big">{{ session.active_streams }} / {{ session.max_streams }}</span>
          </div>
          <div class="sd-field">
            <span class="sd-label">Utilization</span>
            <div class="sd-util-wrap">
              <div class="sd-util-bar"><div class="sd-util-fill" :style="{ width: (session.max_streams > 0 ? (session.active_streams / session.max_streams * 100) : 0) + '%' }"></div></div>
              <span class="sd-util-pct">{{ session.max_streams > 0 ? Math.round(session.active_streams / session.max_streams * 100) : 0 }}%</span>
            </div>
          </div>
          <div class="sd-field"><span class="sd-label">Errors</span><span class="sd-val" :class="session.error_count > 0 ? 'sd-err' : ''">{{ session.error_count }}</span></div>
          <div class="sd-field" v-if="session.last_error"><span class="sd-label">Last Error</span><span class="sd-val sd-err-text">{{ session.last_error }}</span></div>
        </div>
      </section>

      <!-- ── Node Assignment ── -->
      <section class="sd-section">
        <h2 class="sd-section-title">Node Assignment</h2>
        <div class="sd-grid">
          <div class="sd-field">
            <span class="sd-label">Assigned Node</span>
            <span v-if="session.node_name" class="sd-val">
              <span class="sd-node-link" @click="router.push(`/media-nodes/${session.node_id}`)">{{ session.node_name }}</span>
            </span>
            <span v-else class="sd-val sd-na">Unassigned</span>
          </div>
        </div>
        <button class="sd-assign-btn" @click="showMoveModal = true; moveNodeId = ''">
          {{ session.node_id ? 'Move to Node' : 'Assign to Node' }}
        </button>
      </section>

      <!-- ── Actions ── -->
      <section class="sd-section">
        <h2 class="sd-section-title">Actions</h2>
        <div class="sd-actions">
          <button v-if="session.status === 'AUTH_REQUIRED' || session.status === 'PENDING' || session.status === 'AUTHORIZING'" class="sd-act sd-act-auth" @click="showAuthWizard = true">Authorize</button>
          <button v-if="!session.enabled" class="sd-act sd-act-en" @click="confirmAction = 'enable'">Enable</button>
          <button v-if="session.enabled && session.status !== 'DRAINING'" class="sd-act sd-act-dr" @click="confirmAction = 'drain'">Drain</button>
          <button v-if="session.enabled" class="sd-act sd-act-dis" @click="confirmAction = 'disable'">Disable</button>
          <button class="sd-act sd-act-del" @click="confirmAction = 'delete'">Delete</button>
        </div>
      </section>

      <!-- ── Authorization Wizard ── -->
      <SessionAuthWizard
        v-if="showAuthWizard"
        mode="authorize"
        :session-id="sessionId"
        :session-name="session.name || session.account_identifier"
        @success="showAuthWizard = false; fetchAll()"
        @cancel="showAuthWizard = false"
      />
    </template>

    <!-- ── Confirm ── -->
    <div v-if="confirmAction" class="sd-overlay" @click.self="confirmAction = null">
      <div class="sd-modal">
        <h3>Confirm {{ confirmAction }}</h3>
        <p>Are you sure you want to <strong>{{ confirmAction }}</strong> this session?</p>
        <p v-if="confirmAction === 'delete'" class="sd-warn">⚠ This cannot be undone.</p>
        <div class="sd-modal-btns">
          <button class="sd-btn-sec" @click="confirmAction = null">Cancel</button>
          <button :class="confirmAction === 'delete' ? 'sd-btn-danger' : 'sd-btn-pri'" @click="performAction(confirmAction!)">{{ confirmAction }}</button>
        </div>
      </div>
    </div>

    <!-- ── Move/Assign ── -->
    <div v-if="showMoveModal" class="sd-overlay" @click.self="showMoveModal = false">
      <div class="sd-modal">
        <h3>{{ session?.node_id ? 'Move Session' : 'Assign Session' }}</h3>
        <select v-model="moveNodeId" class="sd-select">
          <option value="">Select node...</option>
          <option v-for="n in nodes.filter(n => n.id !== session?.node_id)" :key="n.id" :value="n.id">
            {{ n.name }} ({{ n.status }})
          </option>
        </select>
        <div class="sd-modal-btns">
          <button class="sd-btn-sec" @click="showMoveModal = false">Cancel</button>
          <button class="sd-btn-pri" @click="session?.node_id ? doMove() : doAssign()" :disabled="!moveNodeId">
            {{ session?.node_id ? 'Move' : 'Assign' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sd-page { padding: 1.5rem 2rem; max-width: 1000px; }
.sd-back { background: none; border: none; color: var(--ui-link); cursor: pointer; font-size: 0.85rem; padding: 0; margin-bottom: 1rem; display: block; }
.sd-back:hover { text-decoration: underline; }
.sd-loading { display: flex; align-items: center; gap: 0.75rem; justify-content: center; padding: 3rem; color: var(--ui-link); }
.sd-spinner { width: 18px; height: 18px; border: 2px solid var(--ui-border); border-top-color: var(--ui-control); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.sd-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
.sd-title { font-size: 1.4rem; font-weight: 700; color: var(--ui-text); margin: 0; }
.sd-subtitle { font-size: 12px; color: var(--ui-link); font-family:var(--ui-font); }
.sd-badges { display: flex; gap: 0.4rem; }

.sd-section { margin-bottom: 1.5rem; }
.sd-section-title { font-size: 0.85rem; font-weight: 600; color: var(--ui-link); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }

.sd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem; }
.sd-field { display: flex; flex-direction: column; gap: 0.15rem; background: var(--ui-surface); padding: 0.6rem 0.8rem; border-radius: var(--ui-radius); }
.sd-label { font-size: 12px; color: var(--ui-link); text-transform: uppercase; letter-spacing: 0.03em; }
.sd-val { font-size: 0.85rem; color: var(--ui-secondary); }
.sd-mono { font-family:var(--ui-font); font-size: 12px; word-break: break-all; }
.sd-tg-user { color: var(--ui-link); font-size: 12px; margin-left: 0.3rem; }
.sd-role { background: var(--ui-raised); color: var(--ui-link); padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 12px; font-weight: 600; }
.sd-big { font-size: 1.2rem; font-weight: 700; }
.sd-na { color: var(--ui-link); font-style: italic; }
.sd-err { color: var(--ui-danger); font-weight: 600; }
.sd-err-text { color: var(--ui-danger); font-size: 12px; }

.sd-badge { padding: 0.12rem 0.45rem; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
.st-h { background: var(--ui-success-bg); color: var(--ui-success); }
.st-w { background: var(--ui-danger-bg); color: var(--ui-warning); }
.st-off { background: var(--ui-raised); color: var(--ui-link); }
.st-c { background: var(--ui-danger-bg); color: var(--ui-danger); }
.st-u { background: var(--ui-raised); color: var(--ui-link); }

.sd-util-wrap { display: flex; align-items: center; gap: 0.5rem; }
.sd-util-bar { width: 100px; height: 6px; background: var(--ui-raised); border-radius: 3px; }
.sd-util-fill { height: 100%; border-radius: 3px; background: var(--ui-primary); transition: width 0.5s; color: var(--ui-on-primary); }
.sd-util-pct { font-size: 0.8rem; color: var(--ui-link); }

.sd-node-link { color: var(--ui-link); cursor: pointer; text-decoration: underline; }
.sd-assign-btn {
  margin-top: 0.5rem; padding: 0.35rem 0.9rem; border-radius: var(--ui-radius); font-size: 0.8rem;
  background: var(--ui-raised); color: var(--ui-link); border: 1px solid var(--ui-border); cursor: pointer;
}
.sd-assign-btn:hover { background: var(--ui-raised); }

.sd-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.sd-act { padding: 0.4rem 0.9rem; border-radius: var(--ui-radius); font-size: 0.82rem; font-weight: 500; cursor: pointer; border: 1px solid; background: transparent; }
.sd-act-en { color: var(--ui-success); border-color: var(--ui-success-bg); }
.sd-act-en:hover { background: var(--ui-success-bg); }
.sd-act-dr { color: var(--ui-warning); border-color: var(--ui-warning-bg); }
.sd-act-dr:hover { background: var(--ui-warning-bg); }
.sd-act-dis { color: var(--ui-link); border-color: var(--ui-border); }
.sd-act-dis:hover { background: var(--ui-raised); }
.sd-act-del { color: var(--ui-danger); border-color: var(--ui-danger-bg); }
.sd-act-del:hover { background: var(--ui-danger-bg); }
.sd-act-auth { color: var(--ui-warning); border-color: var(--ui-warning-bg); font-weight: 600; }
.sd-act-auth:hover { background: var(--ui-warning-bg); }
.st-auth { background: var(--ui-warning-bg); color: var(--ui-warning); }

.sd-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: none; }
.sd-modal { background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-panel); padding: 1.5rem; max-width: 420px; width: 90%; }
.sd-modal h3 { color: var(--ui-text); margin: 0 0 0.8rem; }
.sd-modal p { color: var(--ui-link); font-size: 0.88rem; }
.sd-warn { color: var(--ui-danger); font-size: 0.82rem; }
.sd-select {
  width: 100%; padding: 0.5rem; border-radius: var(--ui-radius); font-size: 0.85rem;
  background: var(--ui-surface); border: 1px solid var(--ui-control);
  color: var(--ui-text); outline: none; margin-top: 0.5rem;
}
.sd-modal-btns { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.2rem; }
.sd-btn-sec { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-raised); color: var(--ui-link); border: 1px solid var(--ui-border); cursor: pointer; }
.sd-btn-pri { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-primary); color: var(--ui-on-primary); border: none; cursor: pointer; }
.sd-btn-pri:disabled { opacity: 0.5; cursor: not-allowed; }
.sd-btn-danger { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-danger-bg); color: var(--ui-danger); border: 1px solid var(--ui-danger-bg); cursor: pointer; }
</style>
