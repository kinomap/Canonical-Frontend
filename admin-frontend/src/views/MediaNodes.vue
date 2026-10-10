<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { addToast } from '../toast'
import AddMediaNodeWizard from '../components/AddMediaNodeWizard.vue'
import RemoveMediaNodeModal from '../components/RemoveMediaNodeModal.vue'
import {
  type MediaNodeRow, viewState, routingSummary, reasonText, stateClass,
  formatAge, endpointOf, versionOf,
} from '../lib/mediaNodeView'

const router = useRouter()

const nodes = ref<MediaNodeRow[]>([])
const loaded = ref(false)
const loading = ref(true)
const loadError = ref<string | null>(null)
const showDeployWizard = ref(false)
const removeTarget = ref<MediaNodeRow | null>(null)
const confirmAction = ref<{ type: 'enable' | 'disable' | 'drain', node: MediaNodeRow } | null>(null)
const actionBusy = ref(false)

const state = computed(() => viewState(loaded.value, loadError.value, nodes.value.length))
const summary = computed(() => routingSummary(nodes.value))

let refreshInterval: number | null = null

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const errorText = (err: any): string => {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail) return status ? `HTTP ${status}: ${detail}` : detail
  if (status) return `HTTP ${status}`
  return err?.message || 'Network error'
}

const resumePendingRemoval = () => {
  if (removeTarget.value) return
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('node-removal-target:')) continue
    const nodeId = key.slice('node-removal-target:'.length)
    if (!localStorage.getItem(`node-removal:${nodeId}`) || nodes.value.some(n => n.id === nodeId)) continue
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null') as MediaNodeRow | null
      if (saved?.id === nodeId) { removeTarget.value = saved; break }
    } catch { /* Invalid local state is not a reason to alter the backend operation. */ }
  }
}

const fetchNodes = async () => {
  loading.value = true
  try {
    const resp = await axios.get('/api/v1/admin/media/nodes', auth())
    nodes.value = Array.isArray(resp.data) ? resp.data : []
    loaded.value = true
    loadError.value = null
    resumePendingRemoval()
  } catch (err: any) {
    // Never fall through to the empty state: a failed request is not "no nodes".
    loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

const performAction = async () => {
  if (!confirmAction.value || actionBusy.value) return
  const { type, node } = confirmAction.value
  actionBusy.value = true
  try {
    await axios.post(`/api/v1/admin/media/nodes/${node.id}/${type}`, {}, auth())
    addToast(`${node.name}: ${type} requested`, 'success')
    confirmAction.value = null
    await fetchNodes()
  } catch (err: any) {
    addToast(`Failed to ${type} ${node.name}: ${errorText(err)}`, 'error')
    confirmAction.value = null
  } finally {
    actionBusy.value = false
  }
}

const openNode = (node: MediaNodeRow) => router.push(`/media-nodes/${node.id}`)

const ACTION_TEXT: Record<string, string> = {
  enable: 'The node returns to routing once it is ACTIVE, HEALTHY and has a fresh heartbeat.',
  drain: 'The node stops receiving new playback sessions. Existing streams continue until they finish.',
  disable: 'The node is excluded from routing immediately. Existing streams are not interrupted by this action.',
}

onMounted(() => { fetchNodes(); refreshInterval = window.setInterval(fetchNodes, 15000) })
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
</script>

<template>
  <div class="mn-page">
    <header class="mn-header">
      <div class="mn-heading">
        <h1 class="mn-title">Media Nodes</h1>
        <p class="mn-subtitle">
          Media Nodes stream video to viewers. Playback is routed only to nodes that are
          <strong>ACTIVE</strong>, enabled, <strong>HEALTHY</strong>, have a heartbeat within the
          freshness window and have free stream capacity.
        </p>
      </div>
      <button class="mn-btn mn-btn-primary" data-test="add-node" @click="showDeployWizard = true">Add Media Node</button>
    </header>

    <!-- Loading (first load only) -->
    <div v-if="state === 'loading'" class="mn-panel mn-state" data-test="state-loading">
      <div class="mn-spinner"></div>
      <span>Loading Media Nodes…</span>
    </div>

    <!-- Error (no data has been loaded yet) -->
    <div v-else-if="state === 'error'" class="mn-panel mn-state mn-state-error" data-test="state-error" role="alert">
      <div class="mn-state-title">Could not load Media Nodes</div>
      <p class="mn-state-text">{{ loadError }}</p>
      <p class="mn-state-text mn-muted">The node list is unknown — this is not the same as “no nodes”.</p>
      <button class="mn-btn mn-btn-secondary" data-test="retry" :disabled="loading" @click="fetchNodes">
        {{ loading ? 'Retrying…' : 'Retry' }}
      </button>
    </div>

    <!-- Empty -->
    <div v-else-if="state === 'empty'" class="mn-panel mn-state" data-test="state-empty">
      <div class="mn-state-title">No Media Nodes registered</div>
      <p class="mn-state-text">
        Playback is unavailable: the player API returns <code>503</code> until at least one
        Media Node is ACTIVE and HEALTHY. Use <strong>Add Media Node</strong> to provision a VPS over SSH.
      </p>
    </div>

    <!-- Populated -->
    <template v-else>
      <div v-if="loadError" class="mn-banner mn-banner-warn" data-test="refresh-error" role="alert">
        Refresh failed ({{ loadError }}). Showing the last successfully loaded data.
        <button class="mn-link" :disabled="loading" @click="fetchNodes">Retry</button>
      </div>

      <div class="mn-banner" :class="summary.eligible > 0 ? 'mn-banner-ok' : 'mn-banner-bad'" data-test="routing-summary">
        <template v-if="summary.eligible > 0">
          Routing: <strong>{{ summary.eligible }}</strong> of {{ summary.total }} nodes eligible for new playback sessions.
        </template>
        <template v-else>
          Routing: <strong>no eligible nodes</strong> ({{ summary.total }} registered). Playback returns 503 until a node becomes eligible.
        </template>
      </div>

      <div class="mn-table" role="table" aria-label="Media Nodes">
        <div class="mn-row mn-row-head" role="row">
          <div role="columnheader">Node</div>
          <div role="columnheader">Status</div>
          <div role="columnheader">Health</div>
          <div role="columnheader">Heartbeat</div>
          <div role="columnheader">Streams</div>
          <div role="columnheader">Version</div>
          <div role="columnheader">Routing</div>
          <div role="columnheader" class="mn-col-actions">Actions</div>
        </div>

        <div v-for="node in nodes" :key="node.id" class="mn-row" role="row" data-test="node-row">
          <div class="mn-cell mn-cell-node" role="cell">
            <button class="mn-node-name" @click="openNode(node)">{{ node.name }}</button>
            <div class="mn-node-sub">{{ node.node_id }}<span v-if="node.region"> · {{ node.region }}</span></div>
            <div class="mn-node-sub mn-mono" :title="endpointOf(node)">{{ endpointOf(node) }}</div>
          </div>
          <div class="mn-cell" role="cell" data-label="Status">
            <span class="mn-badge" :class="stateClass(node.status)">{{ node.status }}</span>
            <span v-if="!node.enabled" class="mn-badge st-off">DISABLED</span>
          </div>
          <div class="mn-cell" role="cell" data-label="Health">
            <span class="mn-badge" :class="stateClass(node.health_status)" data-test="health">{{ node.health_status }}</span>
          </div>
          <div class="mn-cell" role="cell" data-label="Heartbeat">
            <span :class="{ 'mn-warn-text': node.heartbeat_age_seconds == null || (node.heartbeat_age_seconds > (node.heartbeat_freshness_seconds || 90)) }">
              {{ formatAge(node.heartbeat_age_seconds) }}
            </span>
          </div>
          <div class="mn-cell" role="cell" data-label="Streams">
            {{ node.active_streams }} / {{ node.effective_stream_capacity ?? 0 }}
            <div class="mn-node-sub">{{ node.available_capacity ?? 0 }} free</div>
          </div>
          <div class="mn-cell mn-mono" role="cell" data-label="Version">{{ versionOf(node) }}</div>
          <div class="mn-cell" role="cell" data-label="Routing">
            <span v-if="node.routing_eligible" class="mn-badge st-ok" data-test="eligible">Eligible</span>
            <template v-else>
              <span class="mn-badge st-bad" data-test="excluded">Excluded</span>
              <ul class="mn-reasons" data-test="reasons">
                <li v-for="code in node.routing_exclusion_reasons || []" :key="code">{{ reasonText(code, node.heartbeat_freshness_seconds) }}</li>
              </ul>
            </template>
          </div>
          <div class="mn-cell mn-col-actions" role="cell">
            <div class="mn-actions">
              <button v-if="!node.enabled" class="mn-btn mn-btn-sm mn-btn-secondary" @click="confirmAction = { type: 'enable', node }">Enable</button>
              <button v-if="node.enabled && node.status !== 'DRAINING'" class="mn-btn mn-btn-sm mn-btn-secondary" @click="confirmAction = { type: 'drain', node }">Drain</button>
              <button v-if="node.enabled" class="mn-btn mn-btn-sm mn-btn-secondary" @click="confirmAction = { type: 'disable', node }">Disable</button>
              <button class="mn-btn mn-btn-sm mn-btn-danger" @click="removeTarget = node">Remove</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <AddMediaNodeWizard v-if="showDeployWizard"
      @close="showDeployWizard = false; fetchNodes()"
      @deployed="fetchNodes()" />

    <!-- Confirm (enable / disable / drain) -->
    <div v-if="confirmAction" class="mn-overlay" @click.self="confirmAction = null">
      <div class="mn-modal" role="dialog" aria-modal="true">
        <h2 class="mn-modal-title">{{ confirmAction.type.charAt(0).toUpperCase() + confirmAction.type.slice(1) }} {{ confirmAction.node.name }}?</h2>
        <p class="mn-modal-text">{{ ACTION_TEXT[confirmAction.type] }}</p>
        <div class="mn-modal-actions">
          <button class="mn-btn mn-btn-secondary" @click="confirmAction = null">Cancel</button>
          <button class="mn-btn mn-btn-primary" :disabled="actionBusy" @click="performAction">
            {{ confirmAction.type.charAt(0).toUpperCase() + confirmAction.type.slice(1) }}
          </button>
        </div>
      </div>
    </div>

    <RemoveMediaNodeModal
      v-if="removeTarget"
      :node="removeTarget"
      @close="removeTarget = null"
      @removed="removeTarget = null; fetchNodes()"
    />
  </div>
</template>

<style scoped>
.mn-page { padding: 1.5rem 2rem; max-width: 1400px; color: var(--k-text); text-align: left; }
.mn-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; margin-bottom: 1.25rem; }
.mn-heading { min-width: 0; }
.mn-title { font-size: 1.5rem; font-weight: 700; color: var(--k-text); margin: 0 0 0.35rem; }
.mn-subtitle { margin: 0; max-width: 760px; color: var(--k-text-muted); font-size: 0.875rem; line-height: 1.5; }
.mn-subtitle strong { color: var(--k-text-secondary); font-weight: 600; }

.mn-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 0.55rem 1.1rem; border-radius: var(--k-radius); border: 1px solid transparent;
  font-size: 0.875rem; font-weight: 600; line-height: 1.2; white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
.mn-btn:disabled { opacity: 0.55; }
.mn-btn-primary { background: var(--k-accent); color: #fff; }
.mn-btn-primary:hover:not(:disabled) { background: var(--k-accent-hover); }
.mn-btn-secondary { background: rgba(148, 163, 184, 0.08); border-color: var(--k-border-strong); color: var(--k-text-secondary); }
.mn-btn-secondary:hover:not(:disabled) { background: rgba(148, 163, 184, 0.16); }
.mn-btn-danger { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.35); color: #fca5a5; }
.mn-btn-danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }
.mn-btn-sm { padding: 0.3rem 0.65rem; font-size: 0.75rem; font-weight: 500; border-radius: 6px; }
.mn-link { background: none; border: none; color: var(--k-info); padding: 0 0 0 6px; font-weight: 600; }

.mn-panel { background: var(--k-surface-muted); border: 1px solid var(--k-border); border-radius: var(--k-radius-lg); }
.mn-state { padding: 2.5rem 2rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }
.mn-state-title { font-size: 1.05rem; font-weight: 600; color: var(--k-text); }
.mn-state-text { margin: 0; color: var(--k-text-muted); max-width: 680px; line-height: 1.5; }
.mn-state-error { border-color: rgba(239, 68, 68, 0.4); }
.mn-state-error .mn-state-title { color: #fca5a5; }
.mn-muted { color: var(--k-text-dim); font-size: 0.8rem; }
.mn-spinner { width: 22px; height: 22px; border: 2px solid var(--k-border-strong); border-top-color: var(--k-accent); border-radius: 50%; animation: mn-spin 0.8s linear infinite; }
@keyframes mn-spin { to { transform: rotate(360deg); } }

.mn-banner { padding: 0.7rem 1rem; border-radius: var(--k-radius); font-size: 0.85rem; margin-bottom: 0.9rem; border: 1px solid var(--k-border); }
.mn-banner-ok { background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.3); color: #bbf7d0; }
.mn-banner-bad { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3); color: #fecaca; }
.mn-banner-warn { background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.3); color: #fde68a; }

.mn-table { background: var(--k-surface-muted); border: 1px solid var(--k-border); border-radius: var(--k-radius-lg); overflow: hidden; }
.mn-row {
  display: grid;
  grid-template-columns: minmax(200px, 2.2fr) 1.1fr 0.9fr 0.9fr 0.8fr 1fr minmax(170px, 1.6fr) minmax(150px, 1.2fr);
  gap: 0.75rem; align-items: start; padding: 0.85rem 1rem; border-top: 1px solid var(--k-border);
  font-size: 0.85rem; color: var(--k-text-secondary);
}
.mn-row-head { border-top: none; background: rgba(15, 23, 42, 0.5); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--k-text-muted); padding-top: 0.6rem; padding-bottom: 0.6rem; }
.mn-cell { min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.mn-cell-node { flex-direction: column; align-items: flex-start; gap: 2px; }
.mn-node-name { background: none; border: none; padding: 0; color: var(--k-text); font-weight: 600; font-size: 0.95rem; text-align: left; }
.mn-node-name:hover { color: var(--k-info); text-decoration: underline; }
.mn-node-sub { color: var(--k-text-muted); font-size: 0.75rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mn-mono { font-family: var(--k-mono); font-size: 0.75rem; }
.mn-col-actions { justify-content: flex-end; text-align: right; }
.mn-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.mn-warn-text { color: #fbbf24; }
.mn-reasons { margin: 2px 0 0; padding-left: 1rem; width: 100%; color: var(--k-text-muted); font-size: 0.75rem; line-height: 1.4; }

.mn-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; border: 1px solid transparent; }
.st-ok { background: rgba(34, 197, 94, 0.12); color: #4ade80; border-color: rgba(34, 197, 94, 0.3); }
.st-info { background: rgba(56, 189, 248, 0.12); color: #7dd3fc; border-color: rgba(56, 189, 248, 0.3); }
.st-warn { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
.st-off { background: rgba(100, 116, 139, 0.15); color: #94a3b8; border-color: rgba(100, 116, 139, 0.3); }
.st-bad { background: rgba(239, 68, 68, 0.12); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }
.st-unknown { background: rgba(148, 163, 184, 0.1); color: #cbd5e1; border-color: rgba(148, 163, 184, 0.25); }

.mn-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.mn-modal { background: var(--k-surface); border: 1px solid var(--k-border-strong); border-radius: var(--k-radius-lg); padding: 1.5rem; width: 100%; max-width: 440px; color: var(--k-text); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); }
.mn-modal-title { margin: 0 0 0.6rem; font-size: 1.1rem; font-weight: 700; color: var(--k-text); }
.mn-modal-text { margin: 0; color: var(--k-text-muted); line-height: 1.5; font-size: 0.875rem; }
.mn-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 1.25rem; }

@media (max-width: 1100px) {
  .mn-page { padding: 1rem; }
  .mn-header { flex-direction: column; align-items: stretch; }
  .mn-header .mn-btn-primary { align-self: flex-start; }
  .mn-table { background: none; border: none; display: flex; flex-direction: column; gap: 0.75rem; }
  .mn-row-head { display: none; }
  .mn-row {
    grid-template-columns: 1fr 1fr; background: var(--k-surface-muted); border: 1px solid var(--k-border);
    border-radius: var(--k-radius-lg); padding: 1rem;
  }
  .mn-cell-node, .mn-col-actions, .mn-cell[data-label="Routing"] { grid-column: 1 / -1; }
  .mn-cell[data-label]::before {
    content: attr(data-label); width: 100%; font-size: 0.65rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em; color: var(--k-text-dim);
  }
  .mn-col-actions, .mn-actions { justify-content: flex-start; }
}
</style>
