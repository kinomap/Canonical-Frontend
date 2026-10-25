<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'
import SessionAuthWizard from '../components/SessionAuthWizard.vue'

const router = useRouter()

interface Session {
  id: string; name: string | null; account_identifier: string; session_identifier: string
  telegram_user_id: number | null; telegram_username: string | null
  telegram_display_name: string | null; telegram_phone: string | null
  credentials_configured: boolean
  status: string; health_status: string; enabled: boolean
  active_streams: number; max_streams: number; error_count: number
  last_error: string | null; last_health_check: string | null
  last_heartbeat_at: string | null; node_id: string | null; node_name: string | null
  created_at: string; updated_at: string
}

interface MediaNode {
  id: string; node_id: string; name: string; status: string
}

const sessions = ref<Session[]>([])
const nodes = ref<MediaNode[]>([])
const loading = ref(true)
const confirmAction = ref<{ type: string; session: Session } | null>(null)
const moveTarget = ref<{ session: Session; target_node_id: string } | null>(null)
const showMoveModal = ref(false)
const showWizard = ref(false)
const wizardMode = ref<'create' | 'authorize'>('create')
const authSessionId = ref('')
const authSessionName = ref('')
let refreshInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchAll = async () => {
  try {
    const [sResp, nResp] = await Promise.all([
      axios.get('/api/v1/admin/media/sessions', auth()),
      axios.get('/api/v1/admin/media/nodes', auth()),
    ])
    sessions.value = sResp.data
    nodes.value = nResp.data
  } catch { addToast('Failed to load sessions', 'error') }
  finally { loading.value = false }
}

const counters = computed(() => {
  const ss = sessions.value
  return {
    total: ss.length,
    healthy: ss.filter(s => s.health_status === 'HEALTHY').length,
    active: ss.filter(s => s.status === 'ACTIVE').length,
    stale: ss.filter(s => s.health_status === 'STALE' || s.health_status === 'UNKNOWN').length,
    draining: ss.filter(s => s.status === 'DRAINING').length,
    totalStreams: ss.reduce((a, s) => a + s.active_streams, 0),
    totalCapacity: ss.reduce((a, s) => a + s.max_streams, 0),
  }
})

const performAction = async () => {
  if (!confirmAction.value) return
  const { type, session } = confirmAction.value
  try {
    if (type === 'enable') await axios.post(`/api/v1/admin/media/sessions/${session.id}/enable`, {}, auth())
    else if (type === 'disable') await axios.post(`/api/v1/admin/media/sessions/${session.id}/disable`, {}, auth())
    else if (type === 'drain') await axios.post(`/api/v1/admin/media/sessions/${session.id}/drain`, {}, auth())
    else if (type === 'delete') await axios.delete(`/api/v1/admin/media/sessions/${session.id}`, auth())
    addToast(`Session ${type}d`, 'success')
    confirmAction.value = null
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || `Failed to ${type}`, 'error')
    confirmAction.value = null
  }
}

const openMove = (session: Session) => {
  moveTarget.value = { session, target_node_id: '' }
  showMoveModal.value = true
}

const doMove = async () => {
  if (!moveTarget.value || !moveTarget.value.target_node_id) return
  try {
    await axios.post(
      `/api/v1/admin/media/sessions/${moveTarget.value.session.id}/move`,
      { target_node_id: moveTarget.value.target_node_id },
      auth()
    )
    addToast('Session moved', 'success')
    showMoveModal.value = false
    moveTarget.value = null
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to move session', 'error')
  }
}

const statusClass = (s: string) => {
  const map: Record<string, string> = {
    HEALTHY: 'st-h', ACTIVE: 'st-h', DEGRADED: 'st-w', WARNING: 'st-w',
    DRAINING: 'st-w', COOLDOWN: 'st-w', OFFLINE: 'st-off',
    CRITICAL: 'st-c', UNHEALTHY: 'st-c', STALE: 'st-w', UNKNOWN: 'st-u',
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


const onWizardSuccess = () => {
  showWizard.value = false
  fetchAll()
}
const openAuthWizard = (s: Session) => {
  authSessionId.value = s.id
  authSessionName.value = s.name || s.account_identifier
  wizardMode.value = 'authorize'
  showWizard.value = true
}

const rebalancing = ref(false)
const rebalanceAll = async () => {
  rebalancing.value = true
  try {
    const resp = await axios.post('/api/v1/admin/media/sessions/rebalance', {}, auth())
    const d = resp.data
    addToast(`Rebalanced: ${d.assigned} assigned, ${d.orphaned_moved} orphans moved`, 'success')
    await fetchAll()
  } catch { addToast('Rebalance failed', 'error') }
  finally { rebalancing.value = false }
}

onMounted(() => { fetchAll(); refreshInterval = window.setInterval(fetchAll, 15000) })
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
</script>

<template>
  <div class="ms-page">
    <div class="ms-header">
      <h1 class="ms-title">
        <svg class="ms-title-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/></svg>
        Media Streaming Sessions <span class="ms-title-sub">Data Plane</span>
      </h1>
      <div class="ms-header-actions">
        <button class="ms-rebalance-btn" @click="rebalanceAll" :disabled="rebalancing">
          {{ rebalancing ? '⟳ Rebalancing...' : '⚖ Rebalance' }}
        </button>
        <button class="ms-add-btn" @click="wizardMode = 'create'; showWizard = true">+ Add Session</button>
      </div>
    </div>

    <!-- ── Counters ── -->
    <div class="ms-counters" v-if="!loading">
      <div class="ms-counter"><span class="ms-counter-val">{{ counters.total }}</span><span class="ms-counter-label">Total</span></div>
      <div class="ms-counter"><span class="ms-counter-val ms-c-green">{{ counters.healthy }}</span><span class="ms-counter-label">Healthy</span></div>
      <div class="ms-counter"><span class="ms-counter-val">{{ counters.active }}</span><span class="ms-counter-label">Active</span></div>
      <div class="ms-counter"><span class="ms-counter-val" :class="counters.stale > 0 ? 'ms-c-warn' : ''">{{ counters.stale }}</span><span class="ms-counter-label">Stale/Unknown</span></div>
      <div class="ms-counter"><span class="ms-counter-val" :class="counters.draining > 0 ? 'ms-c-warn' : ''">{{ counters.draining }}</span><span class="ms-counter-label">Draining</span></div>
      <div class="ms-counter"><span class="ms-counter-val">{{ counters.totalStreams }} / {{ counters.totalCapacity }}</span><span class="ms-counter-label">Streams</span></div>
    </div>

    <div v-if="loading" class="ms-loading"><div class="ms-spinner"></div> Loading sessions...</div>

    <div v-else-if="sessions.length === 0" class="ms-empty">No Telegram sessions registered.</div>

    <!-- ── Session Cards ── -->
    <div v-else class="ms-cards">
      <div v-for="s in sessions" :key="s.id" class="ms-card" @click="router.push(`/media-sessions/${s.id}`)">
        <!-- Row 1: identity + badges -->
        <div class="ms-card-top">
          <div class="ms-card-identity">
            <div class="ms-session-name">📱 {{ s.telegram_phone || s.name || s.account_identifier }}</div>
            <div class="ms-session-meta">
              <span class="ms-session-id">{{ s.session_identifier }}</span>
              <span v-if="s.telegram_username" class="ms-tg-tag">@{{ s.telegram_username }}</span>
              <span v-if="s.name && s.telegram_phone" class="ms-tg-tag">{{ s.name }}</span>
            </div>
          </div>
          <div class="ms-card-badges">
            <span class="ms-badge" :class="statusClass(s.status)">{{ s.status }}</span>
            <span class="ms-badge" :class="statusClass(s.health_status)">{{ s.health_status }}</span>
          </div>
        </div>
        <!-- Row 2: metrics -->
        <div class="ms-card-metrics">
          <div class="ms-metric">
            <span class="ms-metric-label">Node</span>
            <span v-if="s.node_name" class="ms-node-badge">{{ s.node_name }}</span>
            <span v-else class="ms-badge-unassigned">UNASSIGNED</span>
          </div>
          <div class="ms-metric">
            <span class="ms-metric-label">Streams</span>
            <span class="ms-metric-val">{{ s.active_streams }}<span class="ms-metric-dim"> / {{ s.max_streams }}</span></span>
          </div>
          <div class="ms-metric">
            <span class="ms-metric-label">Heartbeat</span>
            <span class="ms-metric-val ms-hb-val">{{ timeAgo(s.last_heartbeat_at) }}</span>
          </div>
          <div class="ms-metric" v-if="s.error_count > 0">
            <span class="ms-metric-label">Errors</span>
            <span class="ms-metric-val ms-err-val">{{ s.error_count }}</span>
          </div>
        </div>
        <!-- Row 3: actions -->
        <div class="ms-card-actions" @click.stop>
          <button v-if="s.status === 'AUTH_REQUIRED' || s.status === 'PENDING' || s.status === 'AUTHORIZING'" class="ms-act ms-act-auth" @click="openAuthWizard(s)">Authorize</button>
          <button v-if="!s.enabled" class="ms-act ms-act-en" @click="confirmAction = { type: 'enable', session: s }">Enable</button>
          <button v-if="s.enabled && s.status !== 'DRAINING'" class="ms-act ms-act-dr" @click="confirmAction = { type: 'drain', session: s }">Drain</button>
          <button v-if="s.active_streams === 0" class="ms-act ms-act-mv" @click="openMove(s)">Move</button>
          <button v-if="s.enabled" class="ms-act ms-act-dis" @click="confirmAction = { type: 'disable', session: s }">Disable</button>
          <button class="ms-act ms-act-del" @click="confirmAction = { type: 'delete', session: s }">Del</button>
        </div>
      </div>
    </div>

    <!-- ── Confirm Modal ── -->
    <div v-if="confirmAction" class="ms-overlay" @click.self="confirmAction = null">
      <div class="ms-modal">
        <h3>Confirm {{ confirmAction.type }}</h3>
        <p>Are you sure you want to <strong>{{ confirmAction.type }}</strong> session <strong>{{ confirmAction.session.account_identifier }}</strong>?</p>
        <p v-if="confirmAction.type === 'delete'" class="ms-warn">⚠ This action cannot be undone.</p>
        <p v-if="confirmAction.type === 'drain'" class="ms-info">Session will stop accepting new streams. Active streams continue.</p>
        <div class="ms-modal-btns">
          <button class="ms-btn-sec" @click="confirmAction = null">Cancel</button>
          <button :class="confirmAction.type === 'delete' ? 'ms-btn-danger' : 'ms-btn-pri'" @click="performAction">{{ confirmAction.type }}</button>
        </div>
      </div>
    </div>

    <!-- ── Authorization Wizard ── -->
    <SessionAuthWizard
      v-if="showWizard"
      :mode="wizardMode"
      :session-id="authSessionId"
      :session-name="authSessionName"
      @success="onWizardSuccess"
      @cancel="showWizard = false"
    />

    <!-- ── Move Modal ── -->
    <div v-if="showMoveModal && moveTarget" class="ms-overlay" @click.self="showMoveModal = false">
      <div class="ms-modal">
        <h3>Move Session</h3>
        <p>Move <strong>{{ moveTarget.session.account_identifier }}</strong> to:</p>
        <select v-model="moveTarget.target_node_id" class="ms-select">
          <option value="">Select target node...</option>
          <option v-for="n in nodes.filter(n => n.id !== moveTarget!.session.node_id)" :key="n.id" :value="n.id">
            {{ n.name }} ({{ n.status }})
          </option>
        </select>
        <div class="ms-modal-btns">
          <button class="ms-btn-sec" @click="showMoveModal = false">Cancel</button>
          <button class="ms-btn-pri" @click="doMove" :disabled="!moveTarget.target_node_id">Move</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-page { padding: 1.5rem 2rem; max-width: 1600px; width: 100%; box-sizing: border-box; overflow-x: hidden; }
.ms-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
.ms-title { display: flex; align-items: center; gap: 0.6rem; font-size: 1.5rem; font-weight: 700; color: var(--ui-text); margin: 0; }
.ms-title-icon { width: 22px; height: 22px; color: var(--ui-link); }
.ms-add-btn {
  padding: 0.5rem 1.2rem; border-radius: var(--ui-radius); font-size: 0.85rem; font-weight: 600;
  background: var(--ui-surface); color: var(--ui-text); border: none; cursor: pointer;
}
.ms-add-btn:hover { transform: translateY(-1px); box-shadow: none; }

/* ── Counters ── */
.ms-counters { display: flex; gap: 1rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
.ms-counter {
  display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
  background: var(--ui-surface); padding: 0.6rem 1.2rem; border-radius: var(--ui-radius);
  border: 1px solid var(--ui-border); min-width: 80px;
}
.ms-counter-val { font-size: 1.1rem; font-weight: 700; color: var(--ui-text); }
.ms-counter-label { font-size: 12px; color: var(--ui-link); text-transform: uppercase; }
.ms-c-green { color: var(--ui-success); }
.ms-c-warn { color: var(--ui-warning); }

.ms-loading { display: flex; align-items: center; gap: 0.75rem; justify-content: center; padding: 3rem; color: var(--ui-link); }
.ms-spinner { width: 18px; height: 18px; border: 2px solid var(--ui-border); border-top-color: var(--ui-control); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ms-empty { text-align: center; padding: 3rem; color: var(--ui-link); }

/* ── Card Layout ── */
.ms-cards { display: flex; flex-direction: column; gap: 0.6rem; }
.ms-card {
  background: var(--ui-surface); border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius); padding: 0.8rem 1rem; cursor: pointer; transition: border-color 0.15s;
}
.ms-card:hover { border-color: var(--ui-border); }

.ms-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
.ms-card-identity { min-width: 0; flex: 1; }
.ms-session-name { font-weight: 600; color: var(--ui-text); font-size: 0.9rem; }
.ms-session-meta { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.15rem; flex-wrap: wrap; }
.ms-session-id { font-size: 12px; color: var(--ui-link); font-family:var(--ui-font); }
.ms-tg-tag { font-size: 12px; color: var(--ui-link); }
.ms-card-badges { display: flex; gap: 0.35rem; flex-shrink: 0; }

.ms-card-metrics { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.ms-metric { display: flex; flex-direction: column; gap: 0.1rem; }
.ms-metric-label { font-size: 12px; color: var(--ui-link); text-transform: uppercase; letter-spacing: 0.03em; }
.ms-metric-val { font-size: 0.82rem; color: var(--ui-secondary); }
.ms-metric-dim { color: var(--ui-link); }
.ms-hb-val { color: var(--ui-link); }

.ms-card-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; padding-top: 0.4rem; border-top: 1px solid var(--ui-border); }

.ms-node-badge { background: var(--ui-raised); color: var(--ui-link); padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 12px; }
.ms-err-val { color: var(--ui-danger); font-weight: 600; }
.ms-title-sub { font-size: 12px; color: var(--ui-link); font-weight: 400; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.5rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: var(--ui-raised); }
.ms-badge-unassigned { background: var(--ui-danger-bg); color: var(--ui-warning); padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }

.ms-badge { padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 12px; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
.st-h { background: var(--ui-success-bg); color: var(--ui-success); }
.st-w { background: var(--ui-danger-bg); color: var(--ui-warning); }
.st-off { background: var(--ui-raised); color: var(--ui-link); }
.st-c { background: var(--ui-danger-bg); color: var(--ui-danger); }
.st-u { background: var(--ui-raised); color: var(--ui-link); }

.ms-act { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid; background: transparent; }
.ms-act-en { color: var(--ui-success); border-color: var(--ui-success-bg); }
.ms-act-dr { color: var(--ui-warning); border-color: var(--ui-warning-bg); }
.ms-act-mv { color: var(--ui-link); border-color: var(--ui-border); }
.ms-act-dis { color: var(--ui-link); border-color: var(--ui-border); }
.ms-act-del { color: var(--ui-danger); border-color: var(--ui-danger-bg); }
.ms-act-auth { color: var(--ui-warning); border-color: var(--ui-warning-bg); font-weight: 600; }
.st-auth { background: var(--ui-warning-bg); color: var(--ui-warning); }

/* ── Modals ── */
.ms-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: none; }
.ms-modal { background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-panel); padding: 1.5rem; max-width: 440px; width: 90%; }
.ms-modal h3 { color: var(--ui-text); margin: 0 0 0.8rem; font-size: 1.1rem; }
.ms-modal p { color: var(--ui-link); font-size: 0.88rem; }
.ms-warn { color: var(--ui-danger); font-size: 0.82rem; }
.ms-info { color: var(--ui-link); font-size: 0.82rem; }
.ms-select {
  width: 100%; padding: 0.5rem; border-radius: var(--ui-radius); font-size: 0.85rem;
  background: var(--ui-surface); border: 1px solid var(--ui-control);
  color: var(--ui-text); outline: none; margin-top: 0.5rem;
}
.ms-modal-btns { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.2rem; }
.ms-btn-sec { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-raised); color: var(--ui-link); border: 1px solid var(--ui-border); cursor: pointer; }
.ms-btn-pri { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-primary); color: var(--ui-on-primary); border: none; cursor: pointer; }
.ms-btn-pri:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-btn-danger { padding: 0.4rem 1rem; border-radius: var(--ui-radius); background: var(--ui-danger-bg); color: var(--ui-danger); border: 1px solid var(--ui-danger-bg); cursor: pointer; }
.ms-modal-wide { max-width: 540px; }
.ms-form { display: flex; flex-direction: column; gap: 0.7rem; margin: 0.8rem 0; }
.ms-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.ms-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 12px; color: var(--ui-link); font-weight: 500; }
.ms-input { padding: 0.45rem 0.6rem; border-radius: var(--ui-radius); font-size: 0.85rem; background: var(--ui-surface); border: 1px solid var(--ui-control); color: var(--ui-text); outline: none; }
.ms-input:focus { border-color: var(--ui-control); }

/* ── Header Actions ── */
.ms-header-actions { display: flex; gap: 0.5rem; align-items: center; }
.ms-rebalance-btn {
  padding: 0.5rem 1rem; border-radius: var(--ui-radius); font-size: 0.82rem; font-weight: 600;
  background: var(--ui-raised); color: var(--ui-link); border: 1px solid var(--ui-border);
  cursor: pointer; transition: all 0.2s;
}
.ms-rebalance-btn:hover:not(:disabled) { background: var(--ui-raised); }
.ms-rebalance-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-tg-name { font-size: 12px; color: var(--ui-link); margin-bottom: 2px; }

/* ── Overflow / truncation guards (no horizontal scroll) ── */
.ms-cards { width: 100%; }
.ms-card { box-sizing: border-box; max-width: 100%; }
.ms-session-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.ms-session-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; display: inline-block; vertical-align: bottom; }
.ms-node-badge { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; display: inline-block; vertical-align: bottom; }
.ms-counters { width: 100%; box-sizing: border-box; }
.ms-counter { flex: 1 1 auto; }

/* ── Responsive: tablet / narrow admin viewport ── */
@media (max-width: 900px) {
  .ms-page { padding: 1rem 1rem; }
  .ms-card-metrics { gap: 0.9rem; }
}

/* ── Responsive: mobile — stack badges under identity ── */
@media (max-width: 560px) {
  .ms-page { padding: 0.85rem 0.75rem; }
  .ms-card-top { flex-direction: column; align-items: stretch; }
  .ms-card-badges { align-self: flex-start; }
  .ms-card-metrics { gap: 0.75rem 1rem; }
  .ms-metric { flex: 1 1 40%; }
  .ms-card-actions .ms-act { flex: 1 1 auto; text-align: center; }
  .ms-title { font-size: 1.25rem; }
  .ms-header-actions { width: 100%; }
  .ms-header-actions button { flex: 1 1 auto; }
}
</style>
