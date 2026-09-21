<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'

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
const showAddModal = ref(false)
const addForm = ref({ name: '', account_identifier: '', session_identifier: '', api_id: '', api_hash: '', max_streams: 25 })
const addSubmitting = ref(false)
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

const utilPct = (s: Session) => s.max_streams > 0 ? Math.round((s.active_streams / s.max_streams) * 100) : 0

const resetAddForm = () => { addForm.value = { name: '', account_identifier: '', session_identifier: '', api_id: '', api_hash: '', max_streams: 25 } }
const submitAddSession = async () => {
  addSubmitting.value = true
  try {
    const payload = {
      name: addForm.value.name || null,
      account_identifier: addForm.value.account_identifier,
      session_identifier: addForm.value.session_identifier,
      api_id: parseInt(addForm.value.api_id as any) || 0,
      api_hash: addForm.value.api_hash,
      max_streams: addForm.value.max_streams,
    }
    await axios.post('/api/v1/admin/media/sessions', payload, auth())
    addToast('Session registered. Authorize it via the session detail page.', 'success')
    showAddModal.value = false
    resetAddForm()
    await fetchAll()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to create session', 'error')
  } finally { addSubmitting.value = false }
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
        <button class="ms-add-btn" @click="showAddModal = true">+ Add Session</button>
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

    <!-- ── Table ── -->
    <div v-else class="ms-table-wrap">
      <table class="ms-table">
        <thead>
          <tr>
            <th>Session</th><th>Telegram</th><th>Node</th><th>Status</th><th>Health</th>
            <th>Streams</th><th>Util</th><th>Errors</th><th>Heartbeat</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id" class="ms-row" @click="router.push(`/media-sessions/${s.id}`)">
            <td>
              <div class="ms-session-name">{{ s.name || s.account_identifier }}</div>
              <div class="ms-session-id">{{ s.session_identifier }}</div>
            </td>
            <td>
              <div v-if="s.telegram_display_name" class="ms-tg-name">{{ s.telegram_display_name }}</div>
              <span v-if="s.telegram_username">@{{ s.telegram_username }}</span>
              <span v-else-if="s.telegram_phone">{{ s.telegram_phone }}</span>
              <span v-else class="ms-na">N/A</span>
            </td>
            <td>
              <span v-if="s.node_name" class="ms-node-badge">{{ s.node_name }}</span>
              <span v-else class="ms-badge-unassigned">UNASSIGNED</span>
            </td>
            <td><span class="ms-badge" :class="statusClass(s.status)">{{ s.status }}</span></td>
            <td><span class="ms-badge" :class="statusClass(s.health_status)">{{ s.health_status }}</span></td>
            <td>{{ s.active_streams }} / {{ s.max_streams }}</td>
            <td>
              <div class="ms-util-bar"><div class="ms-util-fill" :style="{ width: utilPct(s) + '%' }"></div></div>
              <span class="ms-util-pct">{{ utilPct(s) }}%</span>
            </td>
            <td :class="s.error_count > 0 ? 'ms-err-val' : ''">{{ s.error_count }}</td>
            <td class="ms-hb">{{ timeAgo(s.last_heartbeat_at) }}</td>
            <td @click.stop>
              <div class="ms-actions">
                <button v-if="!s.enabled" class="ms-act ms-act-en" @click="confirmAction = { type: 'enable', session: s }">Enable</button>
                <button v-if="s.enabled && s.status !== 'DRAINING'" class="ms-act ms-act-dr" @click="confirmAction = { type: 'drain', session: s }">Drain</button>
                <button v-if="s.active_streams === 0" class="ms-act ms-act-mv" @click="openMove(s)">Move</button>
                <button v-if="s.enabled" class="ms-act ms-act-dis" @click="confirmAction = { type: 'disable', session: s }">Disable</button>
                <button class="ms-act ms-act-del" @click="confirmAction = { type: 'delete', session: s }">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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

    <!-- ── Add Session Modal ── -->
    <div v-if="showAddModal" class="ms-overlay" @click.self="showAddModal = false">
      <div class="ms-modal ms-modal-wide">
        <h3>Register New Telegram Session</h3>
        <p class="ms-info">After registration, authorize the session via the session detail page (OTP flow).</p>
        <div class="ms-form">
          <label class="ms-label">Display Name (optional)
            <input v-model="addForm.name" class="ms-input" placeholder="e.g. Media Account 2" />
          </label>
          <label class="ms-label">Account Identifier *
            <input v-model="addForm.account_identifier" class="ms-input" placeholder="e.g. @myaccount" required />
          </label>
          <label class="ms-label">Session Identifier *
            <input v-model="addForm.session_identifier" class="ms-input" placeholder="e.g. my_session_file" required />
          </label>
          <div class="ms-form-row">
            <label class="ms-label">Telegram API ID *
              <input v-model="addForm.api_id" class="ms-input" type="number" placeholder="12345678" required />
            </label>
            <label class="ms-label">Telegram API Hash *
              <input v-model="addForm.api_hash" class="ms-input" placeholder="32-char hex" required />
            </label>
          </div>
          <label class="ms-label">Max Streams per Session
            <input v-model.number="addForm.max_streams" class="ms-input" type="number" min="1" max="100" />
          </label>
        </div>
        <div class="ms-modal-btns">
          <button class="ms-btn-sec" @click="showAddModal = false; resetAddForm()">Cancel</button>
          <button class="ms-btn-pri" @click="submitAddSession" :disabled="addSubmitting || !addForm.account_identifier || !addForm.session_identifier || !addForm.api_id || !addForm.api_hash">
            {{ addSubmitting ? 'Registering...' : 'Register Session' }}
          </button>
        </div>
      </div>
    </div>

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
.ms-page { padding: 1.5rem 2rem; max-width: 1600px; }
.ms-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
.ms-title { display: flex; align-items: center; gap: 0.6rem; font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin: 0; }
.ms-title-icon { width: 22px; height: 22px; color: #818cf8; }
.ms-add-btn {
  padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: linear-gradient(135deg, #6366f1, #818cf8); color: #fff; border: none; cursor: pointer;
}
.ms-add-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }

/* ── Counters ── */
.ms-counters { display: flex; gap: 1rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
.ms-counter {
  display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
  background: rgba(30,41,59,0.5); padding: 0.6rem 1.2rem; border-radius: 8px;
  border: 1px solid rgba(100,116,139,0.12); min-width: 80px;
}
.ms-counter-val { font-size: 1.1rem; font-weight: 700; color: #e2e8f0; }
.ms-counter-label { font-size: 0.68rem; color: #64748b; text-transform: uppercase; }
.ms-c-green { color: #34d399; }
.ms-c-warn { color: #fbbf24; }

.ms-loading { display: flex; align-items: center; gap: 0.75rem; justify-content: center; padding: 3rem; color: #94a3b8; }
.ms-spinner { width: 18px; height: 18px; border: 2px solid rgba(129,140,248,0.3); border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ms-empty { text-align: center; padding: 3rem; color: #64748b; }

/* ── Table ── */
.ms-table-wrap { overflow-x: auto; }
.ms-table { width: 100%; border-collapse: collapse; }
.ms-table th {
  text-align: left; font-size: 0.7rem; color: #64748b; text-transform: uppercase;
  letter-spacing: 0.03em; padding: 0.6rem 0.5rem;
  border-bottom: 1px solid rgba(100,116,139,0.15); white-space: nowrap;
}
.ms-table td { padding: 0.55rem 0.5rem; font-size: 0.82rem; color: #cbd5e1; border-bottom: 1px solid rgba(100,116,139,0.06); }
.ms-row { cursor: pointer; transition: background 0.15s; }
.ms-row:hover { background: rgba(99,102,241,0.04); }

.ms-session-name { font-weight: 600; color: #e2e8f0; }
.ms-session-id { font-size: 0.72rem; color: #475569; font-family: monospace; }
.ms-na { color: #475569; font-style: italic; }
.ms-node-badge { background: rgba(99,102,241,0.12); color: #a5b4fc; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.75rem; }
.ms-err-val { color: #f87171; font-weight: 600; }
.ms-hb { font-size: 0.78rem; color: #64748b; white-space: nowrap; }
.ms-title-sub { font-size: 0.7rem; color: #64748b; font-weight: 400; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.5rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(100,116,139,0.12); }
.ms-badge-unassigned { background: rgba(249,115,22,0.15); color: #fb923c; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em; }

.ms-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; }
.st-h { background: rgba(16,185,129,0.15); color: #34d399; }
.st-w { background: rgba(249,115,22,0.15); color: #fb923c; }
.st-off { background: rgba(100,116,139,0.15); color: #94a3b8; }
.st-c { background: rgba(239,68,68,0.15); color: #f87171; }
.st-u { background: rgba(100,116,139,0.1); color: #64748b; }

.ms-util-bar { width: 50px; height: 4px; background: rgba(100,116,139,0.2); border-radius: 2px; display: inline-block; vertical-align: middle; }
.ms-util-fill { height: 100%; border-radius: 2px; background: #818cf8; }
.ms-util-pct { font-size: 0.72rem; color: #94a3b8; margin-left: 0.3rem; }

.ms-actions { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.ms-act { padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.68rem; font-weight: 500; cursor: pointer; border: 1px solid; background: transparent; }
.ms-act-en { color: #34d399; border-color: rgba(16,185,129,0.3); }
.ms-act-dr { color: #fbbf24; border-color: rgba(251,191,36,0.3); }
.ms-act-mv { color: #818cf8; border-color: rgba(129,140,248,0.3); }
.ms-act-dis { color: #94a3b8; border-color: rgba(148,163,184,0.3); }
.ms-act-del { color: #f87171; border-color: rgba(248,113,113,0.3); }

/* ── Modals ── */
.ms-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.ms-modal { background: #1e293b; border: 1px solid rgba(99,102,241,0.2); border-radius: 14px; padding: 1.5rem; max-width: 440px; width: 90%; }
.ms-modal h3 { color: #e2e8f0; margin: 0 0 0.8rem; font-size: 1.1rem; }
.ms-modal p { color: #94a3b8; font-size: 0.88rem; }
.ms-warn { color: #f87171; font-size: 0.82rem; }
.ms-info { color: #94a3b8; font-size: 0.82rem; }
.ms-select {
  width: 100%; padding: 0.5rem; border-radius: 6px; font-size: 0.85rem;
  background: rgba(15,23,42,0.8); border: 1px solid rgba(100,116,139,0.3);
  color: #e2e8f0; outline: none; margin-top: 0.5rem;
}
.ms-modal-btns { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.2rem; }
.ms-btn-sec { padding: 0.4rem 1rem; border-radius: 6px; background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); cursor: pointer; }
.ms-btn-pri { padding: 0.4rem 1rem; border-radius: 6px; background: #6366f1; color: #fff; border: none; cursor: pointer; }
.ms-btn-pri:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-btn-danger { padding: 0.4rem 1rem; border-radius: 6px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor: pointer; }
.ms-modal-wide { max-width: 540px; }
.ms-form { display: flex; flex-direction: column; gap: 0.7rem; margin: 0.8rem 0; }
.ms-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.ms-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: #94a3b8; font-weight: 500; }
.ms-input { padding: 0.45rem 0.6rem; border-radius: 6px; font-size: 0.85rem; background: rgba(15,23,42,0.8); border: 1px solid rgba(100,116,139,0.3); color: #e2e8f0; outline: none; }
.ms-input:focus { border-color: #6366f1; }

/* ── Header Actions ── */
.ms-header-actions { display: flex; gap: 0.5rem; align-items: center; }
.ms-rebalance-btn {
  padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.82rem; font-weight: 600;
  background: rgba(99,102,241,0.12); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3);
  cursor: pointer; transition: all 0.2s;
}
.ms-rebalance-btn:hover:not(:disabled) { background: rgba(99,102,241,0.25); }
.ms-rebalance-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-tg-name { font-size: 0.78rem; color: #94a3b8; margin-bottom: 2px; }
</style>
