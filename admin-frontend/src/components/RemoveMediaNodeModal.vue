<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'

const props = defineProps<{
  node: {
    id: string
    node_id: string
    name: string
    hostname: string | null
    status: string
    provisioned?: boolean
  }
}>()

const emit = defineEmits<{
  close: []
  removed: []
}>()

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

// ── State Machine ──
type Phase = 'precheck' | 'confirm' | 'ssh_key' | 'progress' | 'completed' | 'failed' | 'not_found' | 'status_unavailable'
const phase = ref<Phase>('precheck')

// ── Precheck ──
interface PrecheckResult {
  node_id: string; node_name: string; hostname: string | null
  status: string; provisioned: boolean; requires_ssh: boolean; safe_to_remove: boolean
  active_streams: number; active_playback_sessions: number
  assigned_telegram_sessions: number; pending_deployments: number
  warnings: string[]; blockers: string[]
}
const precheck = ref<PrecheckResult | null>(null)
const precheckLoading = ref(true)
const precheckError = ref<string | null>(null)
const recheckKey = ref('')
const recheckingIdentity = ref(false)
const identityRecheck = ref<{ status: string; reason: string; lifecycle_state: string; remote_state: Record<string, unknown> } | null>(null)

// The backend classification, not the provisioned flag, determines SSH access.
const needsSsh = computed(() => precheck.value?.requires_ssh === true)

const runPrecheck = async () => {
  precheckLoading.value = true
  precheckError.value = null
  try {
    const resp = await axios.post(
      `/api/v1/admin/media/nodes/${props.node.id}/remove/precheck`, {}, auth()
    )
    precheck.value = resp.data
    if (resp.data.safe_to_remove) {
      phase.value = 'confirm'
    }
  } catch (err: any) {
    precheckError.value = err.response?.data?.detail || 'Precheck failed'
  } finally {
    precheckLoading.value = false
  }
}

// This is deliberately not another DB-only precheck.  It asks the backend to
// open SSH and inspect the host key plus NODE_ID, without changing the VPS.
const runIdentityRecheck = async () => {
  if (!recheckKey.value.trim()) {
    addToast('Provide the SSH private key to perform remote identity Re-check.', 'error')
    return
  }
  recheckingIdentity.value = true
  identityRecheck.value = null
  try {
    const resp = await axios.post(
      `/api/v1/admin/media/nodes/${props.node.id}/identity/recheck`,
      { ssh_private_key: recheckKey.value }, auth(),
    )
    identityRecheck.value = resp.data
    // Do not retain credential after the request.  A verified identity is
    // persisted by the backend only after NODE_ID proof, so the next precheck
    // can select the normal protected removal path.
    recheckKey.value = ''
    if (resp.data.status === 'verified') {
      addToast('Remote identity verified. Refreshing the cleanup precheck…', 'success')
      await runPrecheck()
    } else {
      addToast(`Remote identity result: ${resp.data.status}`, 'error')
    }
  } catch (err: any) {
    identityRecheck.value = {
      status: 'unreachable', lifecycle_state: 'unknown', remote_state: {},
      reason: err.response?.data?.detail || 'Remote identity Re-check failed',
    }
  } finally {
    recheckingIdentity.value = false
  }
}

// ── SSH Key ──
const sshKey = ref('')
const submitting = ref(false)

// ── Progress ──
const operationId = ref<string | null>(null)
const removalStatus = ref<string>('')
const currentStage = ref<string | null>(null)
const stages = ref<Record<string, { status: string; message?: string }>>({})
const errorStage = ref<string | null>(null)
const errorReason = ref<string | null>(null)
const pollError = ref<string | null>(null)
let consecutivePollErrors = 0
const maxPollErrors = 5
let pollInterval: number | null = null
let autoCloseTimer: number | null = null

const isUncertain = computed(() =>
  errorStage.value === 'verify_identity' &&
  errorReason.value?.includes('identity could not be verified')
)

const stageLabels: Record<string, string> = {
  connect: '🔌 SSH Connect',
  verify_identity: '🔍 Verify Identity',
  stop_services: '⏹ Stop Services',
  remove_containers: '🗑 Remove Containers',
  remove_volumes: '💾 Remove Volumes',
  remove_images: '🖼 Remove Images',
  remove_docker: '🐳 Remove Provisioned Docker',
  remove_wireguard: '🔒 Remove WireGuard',
  remove_config: '📁 Remove Config',
  remove_tls: '🔒 Remove TLS Certificate and Renewal Hooks',
  remove_dns: 'Remove Media DNS Records',
  verify_clean: '✅ Verify Clean',
  control_plane_cleanup: '🧹 Control Plane Cleanup',
}

const orderedStages = [
  'connect', 'verify_identity', 'stop_services', 'remove_containers',
  'remove_volumes', 'remove_images', 'remove_wireguard', 'remove_config', 'remove_tls', 'remove_docker',
  'verify_clean', 'remove_dns', 'control_plane_cleanup',
]

const stageIcon = (stage: string): string => {
  const s = stages.value[stage]
  if (!s) return currentStage.value === stage ? '⏳' : '⬜'
  if (s.status === 'ok') return '✅'
  if (s.status === 'failed') return '❌'
  if (s.status === 'skipped') return '⏭'
  return '⬜'
}

const stageClass = (stage: string): string => {
  const s = stages.value[stage]
  if (!s) return currentStage.value === stage ? 'rm-stage-active' : ''
  if (s.status === 'ok') return 'rm-stage-ok'
  if (s.status === 'failed') return 'rm-stage-fail'
  if (s.status === 'skipped') return 'rm-stage-skip'
  return ''
}

const startRemoval = async () => {
  submitting.value = true
  try {
    const resp = await axios.post(
      `/api/v1/admin/media/nodes/${props.node.id}/remove`,
      { ssh_private_key: sshKey.value || '' },
      auth()
    )
    operationId.value = resp.data.operation_id
    localStorage.setItem(`node-removal:${props.node.id}`, resp.data.operation_id)
    localStorage.setItem(`node-removal-target:${props.node.id}`, JSON.stringify({
      id: props.node.id, node_id: props.node.node_id, name: props.node.name,
      hostname: props.node.hostname, status: props.node.status,
    }))
    phase.value = 'progress'
    // Clear SSH key from memory immediately
    sshKey.value = ''
    startPolling()
  } catch (err: any) {
    const detail = err.response?.data?.detail || 'Failed to start removal'
    // Check if this is an UNCERTAIN error from the backend classification
    if (err.response?.status === 409 && detail.includes('identity could not be verified')) {
      addToast('Remote identity uncertain: ' + detail, 'error')
      // Show as failed phase with the uncertain explanation
      errorStage.value = 'verify_identity'
      errorReason.value = detail
      removalStatus.value = 'DECOMMISSION_FAILED'
      phase.value = 'failed'
    } else {
      addToast(detail, 'error')
    }
  } finally {
    submitting.value = false
  }
}

const pollStatus = async () => {
  if (!operationId.value) return
  try {
    const resp = await axios.get(
      `/api/v1/admin/media/nodes/${operationId.value}/removal`, auth()
    )
    pollError.value = null
    consecutivePollErrors = 0
    removalStatus.value = resp.data.status
    currentStage.value = resp.data.current_stage
    stages.value = resp.data.stages || {}
    errorStage.value = resp.data.error_stage
    errorReason.value = resp.data.error_reason

    if (resp.data.status === 'COMPLETED') {
      phase.value = 'completed'
      stopPolling()
      // Auto-close after 1.5s so user sees success flash, then list refreshes
      autoCloseTimer = window.setTimeout(() => {
        localStorage.removeItem(`node-removal:${props.node.id}`)
        localStorage.removeItem(`node-removal-target:${props.node.id}`)
        emit('removed')
        emit('close')
      }, 1500)
    } else if (resp.data.status === 'DECOMMISSION_FAILED') {
      phase.value = 'failed'
      stopPolling()
    }
  } catch (err: any) {
    if (err.response?.status === 404) {
      errorStage.value = currentStage.value
      errorReason.value = 'Removal operation not found. Refresh or contact an administrator.'
      phase.value = 'not_found'
      stopPolling()
    } else {
      // Network/API errors are transient: keep polling but show an explicit warning.
      pollError.value = 'Cannot reach removal status API. Retrying…'
      if (++consecutivePollErrors >= maxPollErrors) {
        phase.value = 'status_unavailable'
        stopPolling()
      }
    }
  }
}

const startPolling = () => {
  consecutivePollErrors = 0
  pollInterval = window.setInterval(pollStatus, 2000)
  pollStatus()
}

const stopPolling = () => {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null }
}

const retryRemoval = () => {
  localStorage.removeItem(`node-removal:${props.node.id}`)
  localStorage.removeItem(`node-removal-target:${props.node.id}`)
  operationId.value = null
  precheck.value = null
  phase.value = 'precheck'
  runPrecheck()
}

const goToConfirm = () => {
  // If not provisioned, skip SSH key step and submit directly
  if (!needsSsh.value) {
    startRemoval()
  } else {
    phase.value = 'ssh_key'
  }
}

const handleClose = () => {
  sshKey.value = ''
  recheckKey.value = ''
  stopPolling()
  if (phase.value === 'completed') {
    localStorage.removeItem(`node-removal:${props.node.id}`)
    localStorage.removeItem(`node-removal-target:${props.node.id}`)
    emit('removed')
  }
  emit('close')
}

// Resume the specific operation, even if the registration has been deleted.
const previousOperation = localStorage.getItem(`node-removal:${props.node.id}`)
if (previousOperation) {
  operationId.value = previousOperation
  phase.value = 'progress'
  startPolling()
} else {
  runPrecheck()
}

onUnmounted(() => {
  sshKey.value = ''
  stopPolling() // also clears autoCloseTimer
})
</script>

<template>
  <div class="rm-overlay" @click.self="handleClose">
    <div class="rm-modal">
      <!-- ── Header ── -->
      <div class="rm-header">
        <h2 class="rm-title">
          <span v-if="phase === 'completed'">✅</span>
          <span v-else-if="phase === 'failed'">❌</span>
          <span v-else>🗑</span>
          Remove Media Node
        </h2>
        <button class="rm-close" @click="handleClose">✕</button>
      </div>

      <div class="rm-node-info">
        <span class="rm-node-name">{{ node.name }}</span>
        <span class="rm-node-host" v-if="node.hostname">{{ node.hostname }}</span>
        <span class="rm-node-id">{{ node.node_id }}</span>
      </div>

      <!-- ── Phase: Precheck Loading ── -->
      <div v-if="phase === 'precheck' && precheckLoading" class="rm-loading">
        <div class="rm-spinner"></div>
        Running safety precheck...
      </div>

      <!-- ── Phase: Precheck Error ── -->
      <div v-if="phase === 'precheck' && precheckError" class="rm-error-box">
        <p>{{ precheckError }}</p>
        <button class="rm-btn-sec" @click="runPrecheck">Retry</button>
      </div>

      <!-- ── Phase: Precheck Result (with blockers) ── -->
      <div v-if="phase === 'precheck' && precheck && !precheck.safe_to_remove" class="rm-precheck">
        <div class="rm-blockers" v-if="precheck.blockers.length">
          <h3 class="rm-section-title rm-danger">⛔ Removal Blocked</h3>
          <ul>
            <li v-for="b in precheck.blockers" :key="b">{{ b }}</li>
          </ul>
        </div>
        <div class="rm-warnings" v-if="precheck.warnings.length">
          <h3 class="rm-section-title rm-warn">⚠ Warnings</h3>
          <ul>
            <li v-for="w in precheck.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>
        <div class="rm-identity-recheck">
          <h3 class="rm-section-title">Remote identity Re-check</h3>
          <p>Uses SSH to verify the host key and KINOSOTA NODE_ID, then reports containers, WireGuard, TLS and deployment residue. It does not modify the VPS.</p>
          <textarea v-model="recheckKey" class="rm-ssh-input" rows="5"
            placeholder="SSH private key (used once; never stored)"></textarea>
          <p v-if="identityRecheck" :class="identityRecheck.status === 'verified' ? 'rm-success' : 'rm-danger'">
            <strong>{{ identityRecheck.status }}</strong>: {{ identityRecheck.reason }}
          </p>
          <button class="rm-btn-sec" :disabled="recheckingIdentity || !recheckKey.trim()" @click="runIdentityRecheck">
            {{ recheckingIdentity ? 'Checking remote identity…' : 'Re-check remote identity' }}
          </button>
        </div>
        <div class="rm-actions">
          <button class="rm-btn-sec" @click="handleClose">Close</button>
          <button class="rm-btn-sec" @click="runPrecheck">Re-check</button>
        </div>
      </div>

      <!-- ── Phase: Confirm ── -->
      <div v-if="phase === 'confirm' && precheck" class="rm-confirm">
        <div class="rm-warnings" v-if="precheck.warnings.length">
          <h3 class="rm-section-title rm-warn">⚠ Warnings</h3>
          <ul>
            <li v-for="w in precheck.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>

        <div class="rm-summary">
          <h3 class="rm-section-title">Precheck Summary</h3>
          <div class="rm-summary-grid">
            <div class="rm-sum-item"><span>Status</span><span>{{ precheck.status }}</span></div>
            <div class="rm-sum-item">
              <span>Removal Path</span>
              <span v-if="needsSsh">🔒 VPS decommission (SSH required)</span>
              <span v-else class="rm-db-only">⚡ DB-only cleanup (no SSH needed)</span>
            </div>
            <div class="rm-sum-item"><span>Active Streams</span><span>{{ precheck.active_streams }}</span></div>
            <div class="rm-sum-item"><span>Telegram Sessions</span><span>{{ precheck.assigned_telegram_sessions }} (will be detached)</span></div>
          </div>
        </div>

        <div class="rm-destructive-warn" v-if="needsSsh">
          <strong>⚠ This will clean the Media Node provisioning resources on {{ node.hostname }}.</strong>
          <p>Node-owned resources will be removed from the VPS. For pre-release deployments this includes Docker installed during provisioning.</p>
          <p>Telegram sessions, movies, sources, and user data will NOT be affected.</p>
        </div>
        <div class="rm-info-box" v-else>
          <strong>ℹ This node was never provisioned on a remote VPS.</strong>
          <p>Only Control Plane records will be cleaned up. No VPS access is needed.</p>
          <p>Telegram sessions, movies, sources, and user data will NOT be affected.</p>
        </div>

        <div class="rm-actions">
          <button class="rm-btn-sec" @click="handleClose">Cancel</button>
          <button class="rm-btn-danger" @click="goToConfirm">
            {{ needsSsh ? 'Proceed to Decommission' : '⚡ Remove (DB-only)' }}
          </button>
        </div>
      </div>

      <!-- ── Phase: SSH Key Input (only for provisioned nodes) ── -->
      <div v-if="phase === 'ssh_key'" class="rm-ssh">
        <h3 class="rm-section-title">SSH Access for VPS Decommission</h3>
        <p class="rm-ssh-info">
          Provide the SSH private key to connect to <strong>{{ node.hostname }}</strong>.
          The key is used only for this operation and is never stored.
        </p>
        <textarea
          v-model="sshKey"
          class="rm-ssh-input"
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
          rows="8"
          spellcheck="false"
        ></textarea>
        <div class="rm-actions">
          <button class="rm-btn-sec" @click="phase = 'confirm'">Back</button>
          <button
            class="rm-btn-danger"
            :disabled="!sshKey.trim() || submitting"
            @click="startRemoval"
          >
            {{ submitting ? 'Starting...' : '🗑 Remove Node' }}
          </button>
        </div>
      </div>

      <!-- ── Phase: Progress ── -->
      <div v-if="phase === 'progress'" class="rm-progress">
        <h3 class="rm-section-title">Decommissioning in Progress</h3>
        <p v-if="pollError" class="rm-danger">{{ pollError }}</p>
        <div class="rm-stages">
          <div
            v-for="stage in orderedStages"
            :key="stage"
            class="rm-stage"
            :class="stageClass(stage)"
          >
            <span class="rm-stage-icon">
              <span v-if="stageClass(stage) === 'rm-stage-active'" class="rm-spinner-sm"></span>
              <span v-else>{{ stageIcon(stage) }}</span>
            </span>
            <span class="rm-stage-label">{{ stageLabels[stage] || stage }}</span>
            <span class="rm-stage-badge" v-if="stages[stage]?.status === 'skipped'">SKIPPED</span>
            <span class="rm-stage-msg" v-if="stages[stage]?.message && stages[stage]?.status !== 'skipped'">
              {{ stages[stage].message }}
            </span>
          </div>
        </div>
      </div>

      <!-- ── Phase: Completed ── -->
      <div v-if="phase === 'completed'" class="rm-completed">
        <h3 class="rm-section-title rm-success">✅ Node Successfully Removed</h3>
        <p>
          <strong>{{ node.name }}</strong> ({{ node.node_id }}) has been decommissioned.
          Closing automatically…
        </p>
        <div class="rm-result-grid">
          <div class="rm-result-item rm-result-ok">Control plane cleaned up</div>
          <div class="rm-result-item rm-result-safe">Telegram sessions preserved</div>
          <div class="rm-result-item rm-result-safe">Movies &amp; data preserved</div>
        </div>

        <!-- Verification details (only for full SSH decommission) -->
        <div v-if="stages['verify_clean']?.message && stages['verify_clean']?.status === 'ok'" class="rm-verify-detail">
          <h4>VPS Verification</h4>
          <pre>{{ stages['verify_clean'].message }}</pre>
        </div>

        <div class="rm-actions">
          <button class="rm-btn-primary" @click="handleClose">Done</button>
        </div>
      </div>

      <div v-if="phase === 'status_unavailable'" class="rm-error-box">
        <p>Removal status is temporarily unavailable. The backend operation may still be running.</p>
        <button class="rm-btn-sec" @click="phase = 'progress'; startPolling()">Retry status check</button>
        <button class="rm-btn-sec" @click="handleClose">Close</button>
      </div>

      <div v-if="phase === 'not_found'" class="rm-error-box">
        <p>Removal operation not found. The server could not confirm its outcome.</p>
        <button class="rm-btn-sec" @click="retryRemoval">Re-check node</button>
        <button class="rm-btn-sec" @click="handleClose">Close</button>
      </div>

      <!-- ── Phase: Failed ── -->
      <div v-if="phase === 'failed'" class="rm-failed">
        <h3 class="rm-section-title rm-danger">Decommission Failed</h3>

        <!-- UNCERTAIN: special explanation -->
        <div v-if="isUncertain" class="rm-uncertain-box">
          <h4 class="rm-uncertain-title">🔍 Remote Identity Could Not Be Verified</h4>
          <p>Remote node identity could not be confirmed. <strong>No destructive cleanup was performed.</strong></p>
          <p>This can happen when:</p>
          <ul>
            <li>The VPS was repurposed and the IP now belongs to a different host</li>
            <li>The SSH host key fingerprint doesn't match the registered node</li>
            <li>The node was partially provisioned without a verifiable identity anchor</li>
          </ul>
          <p class="rm-uncertain-action">Manual investigation is required before removal.</p>
        </div>

        <!-- Normal failure details -->
        <div v-else class="rm-error-detail" v-if="errorStage || errorReason">
          <p v-if="errorStage"><strong>Failed at:</strong> {{ stageLabels[errorStage] || errorStage }}</p>
          <p v-if="errorReason"><strong>Reason:</strong> {{ errorReason }}</p>
        </div>

        <div class="rm-stages" v-if="!isUncertain">
          <div
            v-for="stage in orderedStages"
            :key="stage"
            class="rm-stage"
            :class="stageClass(stage)"
          >
            <span class="rm-stage-icon">{{ stageIcon(stage) }}</span>
            <span class="rm-stage-label">{{ stageLabels[stage] || stage }}</span>
            <span class="rm-stage-badge" v-if="stages[stage]?.status === 'skipped'">SKIPPED</span>
          </div>
        </div>

        <p class="rm-fail-info" v-if="!isUncertain">
          The node is in DECOMMISSION_FAILED state. You can retry the removal
          or investigate the VPS manually.
        </p>
        <div class="rm-actions">
          <button class="rm-btn-sec" @click="handleClose">Close</button>
          <button v-if="!isUncertain" class="rm-btn-danger" @click="retryRemoval">
            Retry Removal
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(4px);
}
.rm-modal {
  background: #1e293b; border: 1px solid rgba(239,68,68,0.2);
  border-radius: 16px; padding: 1.5rem 2rem; max-width: 640px;
  width: 95%; max-height: 90vh; overflow-y: auto;
}
.rm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.rm-title { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin: 0; }
.rm-close { background: none; border: none; color: #64748b; font-size: 1.2rem; cursor: pointer; padding: 0.2rem; }
.rm-close:hover { color: #94a3b8; }

.rm-node-info {
  display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;
  margin-bottom: 1.2rem; padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(100,116,139,0.15);
}
.rm-node-name { font-weight: 600; color: #e2e8f0; }
.rm-node-host { font-family: monospace; font-size: 0.82rem; color: #94a3b8; }
.rm-node-id { font-family: monospace; font-size: 0.75rem; color: #64748b; }

.rm-loading { display: flex; align-items: center; gap: 0.75rem; padding: 2rem; justify-content: center; color: #94a3b8; }
.rm-spinner { width: 18px; height: 18px; border: 2px solid rgba(129,140,248,0.3); border-top-color: #818cf8; border-radius: 50%; animation: rmspin 0.8s linear infinite; }
.rm-spinner-sm { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(251,191,36,0.3); border-top-color: #fbbf24; border-radius: 50%; animation: rmspin 0.8s linear infinite; }
@keyframes rmspin { to { transform: rotate(360deg); } }

.rm-error-box { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 1rem; color: #f87171; text-align: center; }
.rm-error-box p { margin: 0 0 0.8rem; }

.rm-section-title { font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin: 0 0 0.6rem; text-transform: uppercase; letter-spacing: 0.03em; }
.rm-section-title.rm-danger { color: #f87171; }
.rm-section-title.rm-warn { color: #fbbf24; }
.rm-section-title.rm-success { color: #34d399; }

.rm-blockers ul, .rm-warnings ul { margin: 0; padding-left: 1.2rem; }
.rm-blockers li { color: #f87171; margin-bottom: 0.3rem; font-size: 0.85rem; }
.rm-warnings li { color: #fbbf24; margin-bottom: 0.3rem; font-size: 0.85rem; }
.rm-blockers, .rm-warnings { margin-bottom: 1rem; }

.rm-summary { margin-bottom: 1rem; }
.rm-summary-grid { display: grid; gap: 0.4rem; }
.rm-sum-item { display: flex; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(30,41,59,0.6); border-radius: 5px; font-size: 0.82rem; }
.rm-sum-item span:first-child { color: #64748b; }
.rm-sum-item span:last-child { color: #cbd5e1; }
.rm-db-only { color: #34d399 !important; }

.rm-destructive-warn {
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 8px; padding: 1rem; margin-bottom: 1rem;
}
.rm-destructive-warn strong { color: #f87171; font-size: 0.88rem; display: block; margin-bottom: 0.4rem; }
.rm-destructive-warn p { color: #94a3b8; font-size: 0.82rem; margin: 0.2rem 0; }

.rm-info-box {
  background: rgba(52,211,153,0.07); border: 1px solid rgba(52,211,153,0.2);
  border-radius: 8px; padding: 1rem; margin-bottom: 1rem;
}
.rm-info-box strong { color: #34d399; font-size: 0.88rem; display: block; margin-bottom: 0.4rem; }
.rm-info-box p { color: #94a3b8; font-size: 0.82rem; margin: 0.2rem 0; }

.rm-ssh { margin-top: 0.5rem; }
.rm-ssh-info { font-size: 0.82rem; color: #94a3b8; margin-bottom: 0.8rem; }
.rm-ssh-input {
  width: 100%; padding: 0.7rem; border-radius: 8px; font-family: monospace;
  font-size: 0.78rem; background: rgba(15,23,42,0.9); color: #e2e8f0;
  border: 1px solid rgba(100,116,139,0.3); resize: vertical;
}
.rm-ssh-input:focus { border-color: #818cf8; outline: none; }
.rm-identity-recheck {
  margin-top: 1rem; padding: .85rem; border: 1px solid rgba(148,163,184,.25);
  border-radius: 8px; color: #cbd5e1; font-size: .82rem;
}
.rm-identity-recheck .rm-ssh-input { margin: .65rem 0; }

.rm-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.2rem; }
.rm-btn-sec {
  padding: 0.45rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
  background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3);
  cursor: pointer;
}
.rm-btn-danger {
  padding: 0.45rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3);
  cursor: pointer;
}
.rm-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.rm-btn-primary {
  padding: 0.45rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: linear-gradient(135deg, #6366f1, #818cf8); color: #fff; border: none;
  cursor: pointer;
}

/* ── Progress stages ── */
.rm-stages { display: flex; flex-direction: column; gap: 0.4rem; }
.rm-stage {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem;
  border-radius: 6px; font-size: 0.82rem; color: #64748b;
  background: rgba(30,41,59,0.4);
}
.rm-stage-ok { color: #34d399; background: rgba(16,185,129,0.05); }
.rm-stage-fail { color: #f87171; background: rgba(239,68,68,0.08); }
.rm-stage-skip { color: #64748b; background: rgba(30,41,59,0.2); font-style: italic; }
.rm-stage-active { color: #fbbf24; background: rgba(251,191,36,0.06); }
.rm-stage-icon { width: 20px; text-align: center; flex-shrink: 0; }
.rm-stage-label { font-weight: 500; }
.rm-stage-badge {
  margin-left: auto; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em;
  color: #64748b; background: rgba(100,116,139,0.15);
  padding: 0.1rem 0.4rem; border-radius: 4px; text-transform: uppercase;
}
.rm-stage-msg { font-size: 0.72rem; color: #64748b; margin-left: auto; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Completed ── */
.rm-completed p { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; }
.rm-result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-bottom: 1rem; }
.rm-result-item { padding: 0.4rem 0.6rem; border-radius: 5px; font-size: 0.8rem; }
.rm-result-ok { color: #34d399; background: rgba(16,185,129,0.08); }
.rm-result-safe { color: #818cf8; background: rgba(99,102,241,0.08); }

.rm-verify-detail { margin-bottom: 1rem; }
.rm-verify-detail h4 { font-size: 0.78rem; color: #94a3b8; margin: 0 0 0.3rem; text-transform: uppercase; }
.rm-verify-detail pre {
  font-size: 0.72rem; color: #cbd5e1; background: rgba(15,23,42,0.8);
  padding: 0.6rem; border-radius: 6px; white-space: pre-wrap; overflow-x: auto;
}

/* ── Failed / Uncertain ── */
.rm-error-detail { background: rgba(239,68,68,0.08); border-radius: 6px; padding: 0.8rem; margin-bottom: 1rem; }
.rm-error-detail p { color: #f87171; font-size: 0.82rem; margin: 0.2rem 0; }
.rm-fail-info { color: #94a3b8; font-size: 0.82rem; margin-top: 0.8rem; }

.rm-uncertain-box {
  background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.25);
  border-radius: 10px; padding: 1.1rem; margin-bottom: 1rem;
}
.rm-uncertain-title {
  color: #fbbf24; font-size: 0.9rem; font-weight: 700; margin: 0 0 0.7rem;
}
.rm-uncertain-box p { color: #94a3b8; font-size: 0.82rem; margin: 0.3rem 0; }
.rm-uncertain-box ul { color: #94a3b8; font-size: 0.82rem; margin: 0.4rem 0; padding-left: 1.2rem; }
.rm-uncertain-box li { margin-bottom: 0.25rem; }
.rm-uncertain-action { color: #fbbf24 !important; font-weight: 600 !important; margin-top: 0.6rem !important; }
</style>
