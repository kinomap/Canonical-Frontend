<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'
import MediaVpsGuide from './MediaVpsGuide.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'deployed'): void
}>()

const step = ref(1)
const deploying = ref(false)
const deploymentId = ref<string | null>(null)
const deploymentStatus = ref<any>(null)
let pollInterval: number | null = null

// Step 1 — Target
const nodeName = ref('')
const region = ref('')
const cacheL1 = ref(512)
const cacheL2 = ref(10)
const host = ref('')
const sshPort = ref(22)
const sshUsername = ref('ubuntu')
const hostError = ref('')

// Step 2 — Canonical Node
const releases = ref<any[]>([])
const selectedVersion = ref('')
const loadingReleases = ref(false)

// Step 3 — Deploy
const sshPrivateKey = ref('')

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

/**
 * Canonicalize hostname for UX: trim whitespace, strip trailing dot.
 * Backend is the source of truth for full validation.
 */
function canonicalizeHost(raw: string): string {
  let h = raw.trim()
  if (h.endsWith('.')) h = h.replace(/\.+$/, '')
  return h
}

/**
 * Client-side hostname validation — UX guard, not source of truth.
 * Returns error message or empty string if valid.
 */
function validateHost(raw: string): string {
  const h = raw.trim()
  if (!h) return 'Hostname or IP address is required.'
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(h)) return 'Enter a hostname or IP, not a URL.'
  if (/\s/.test(h)) return 'Hostname must not contain spaces.'
  if (h.includes('/')) return 'Enter a hostname or IP, not a path.'
  // Simple port detection for non-IPv6
  if (!h.startsWith('[') && /^.+:\d+$/.test(h) && (h.match(/:/g) || []).length === 1) {
    return 'Enter hostname without port. Specify SSH port separately.'
  }
  return ''
}

const canGoStep2 = computed(() => {
  return nodeName.value.trim() && host.value.trim() && !validateHost(host.value)
})
const canGoStep3 = computed(() => Boolean(selectedVersion.value))
const canDeploy = computed(() => sshPrivateKey.value.trim().length > 50)

async function loadReleases() {
  loadingReleases.value = true
  try {
    const resp = await axios.get('/api/v1/admin/media/node-releases', auth())
    releases.value = resp.data
    if (releases.value.length > 0) {
      selectedVersion.value = releases.value[releases.value.length - 1].version
    }
  } catch {
    addToast('Failed to load releases', 'error')
  } finally {
    loadingReleases.value = false
  }
}

async function goToStep2() {
  // Canonicalize host before proceeding
  const err = validateHost(host.value)
  if (err) {
    hostError.value = err
    return
  }
  host.value = canonicalizeHost(host.value)
  hostError.value = ''
  step.value = 2
  await loadReleases()
}

async function startDeploy() {
  deploying.value = true
  step.value = 4

  try {
    // 1. Create or find node
    let nodeId = ''
    try {
      const canonicalHost = canonicalizeHost(host.value)
      const createResp = await axios.post('/api/v1/admin/media/nodes', {
        name: nodeName.value,
        for_provisioning: true,
        cache_l1_max_mb: cacheL1.value,
        cache_l2_max_gb: cacheL2.value,
        region: region.value.trim() || null,
        hostname: canonicalHost,
        // The backend derives the DNS name from the stable node slug + MEDIA_DOMAIN.
      }, auth())
      nodeId = createResp.data.id

      // Update SSH info
      await axios.patch(`/api/v1/admin/media/nodes/${nodeId}`, {
        hostname: canonicalHost,
      }, auth())
    } catch (err: any) {
      if (err.response?.status === 409) {
        const nodes = await axios.get('/api/v1/admin/media/nodes', auth())
        const existing = nodes.data.find((n: any) =>
          n.name === nodeName.value || n.hostname === host.value
        )
        if (existing) {
          nodeId = existing.id
          await axios.patch(`/api/v1/admin/media/nodes/${nodeId}`, {
            cache_l1_max_mb: cacheL1.value,
            cache_l2_max_gb: cacheL2.value,
            ...(region.value.trim() ? { region: region.value.trim() } : {}),
          }, auth())
        } else {
          throw err
        }
      } else {
        throw err
      }
    }

    // 2. Start deployment
    const selected = releases.value.find((r: any) => r.version === selectedVersion.value)
    const resp = await axios.post(`/api/v1/admin/media/nodes/${nodeId}/deploy`, {
      ssh_private_key: sshPrivateKey.value,
      target_version: selected?.version || '',
      target_commit: selected?.commit || '',
    }, auth())

    deploymentId.value = resp.data.deployment_id
    deploymentStatus.value = resp.data

    // Clear credential from memory immediately
    sshPrivateKey.value = ''

    // Start polling
    pollInterval = window.setInterval(() => pollDeployment(nodeId), 3000)
  } catch (err: any) {
    sshPrivateKey.value = ''
    deploying.value = false
    addToast(err.response?.data?.detail || 'Deployment failed', 'error')
    step.value = 3
  }
}

async function pollDeployment(nodeId: string) {
  try {
    const resp = await axios.get(
      `/api/v1/admin/media/nodes/${nodeId}/deployment`, auth()
    )
    deploymentStatus.value = resp.data

    if (resp.data.status === 'COMPLETED' || resp.data.status === 'FAILED') {
      if (pollInterval) clearInterval(pollInterval)
      deploying.value = false
      if (resp.data.status === 'COMPLETED') {
        step.value = 5
        emit('deployed')
      }
    }
  } catch {
    // polling error — keep trying
  }
}

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  sshPrivateKey.value = ''
})

const stageLabels: Record<string, string> = {
  connect: 'SSH Connection',
  preflight: 'System Preflight',
  install_docker: 'Docker Installation',
  provision_dns: 'Cloudflare DNS (DNS Only)',
  issue_tls: 'TLS Certificate (DNS-01)',
  configure_tls: 'Automatic TLS Renewal',
  verify_media_endpoint: 'Public HTTPS / TLS / Health',
  prepare_control_connection: 'Control Connection Setup',
  configure_wireguard_remote: 'WireGuard — Remote',
  configure_wireguard_local: 'WireGuard — Local',
  verify_wireguard: 'WireGuard Verification',
  upload_release: 'Canonical Node Upload',
  configure_node: 'Node Configuration',
  start_node: 'Start Containers',
  register_node: 'Registration',
  verify_health: 'Health Verification',
  finalize: 'Finalize',
}

const allStages = [
  'provision_dns', 'connect', 'preflight', 'install_docker',
  'prepare_control_connection', 'configure_wireguard_remote',
  'configure_wireguard_local', 'verify_wireguard',
  'upload_release', 'configure_node', 'issue_tls', 'start_node', 'configure_tls',
  'register_node', 'verify_health', 'verify_media_endpoint', 'finalize',
]

function stageIcon(stage: string): string {
  const stages = deploymentStatus.value?.stages || {}
  const s = stages[stage]
  if (!s) {
    if (deploymentStatus.value?.current_stage === stage) return '⏳'
    return '○'
  }
  return s.status === 'ok' ? '✓' : '✗'
}

function stageClass(stage: string): string {
  const stages = deploymentStatus.value?.stages || {}
  const s = stages[stage]
  if (!s) {
    if (deploymentStatus.value?.current_stage === stage) return 'stage-active'
    return 'stage-pending'
  }
  return s.status === 'ok' ? 'stage-ok' : 'stage-failed'
}
</script>

<template>
  <div class="wizard-overlay" @click.self="emit('close')">
    <div class="wizard-modal">
      <div class="wizard-header">
        <h2>Add Media Node</h2>
        <button class="wizard-close" @click="emit('close')">×</button>
      </div>

      <div class="wizard-steps">
        <span v-for="s in [1,2,3,4,5]" :key="s"
              :class="['wstep', { active: step === s, done: step > s }]">
          {{ s === 5 ? '✓' : s }}
        </span>
      </div>

      <!-- Step 1: Target -->
      <div v-if="step === 1" class="wizard-body">
        <label>L1-кэш, МиБ<input v-model.number="cacheL1" type="number" min="0" max="65536" /></label>
        <label>L2-кэш, ГиБ<input v-model.number="cacheL2" type="number" min="0" max="65536" /></label>
        <MediaVpsGuide />
        <h3>Target VPS</h3>
        <label>Node Name
          <input v-model="nodeName" placeholder="media-02" />
        </label>
        <label>Region (optional)
          <input v-model="region" placeholder="Configured node region" />
        </label>
        <label>Host / IP
          <input v-model="host" placeholder="203.0.113.12"
                 @blur="hostError = validateHost(host)" />
          <span v-if="hostError" class="field-error">{{ hostError }}</span>
        </label>
        <label>SSH Port
          <input v-model.number="sshPort" type="number" />
        </label>
        <label>SSH Username
          <input v-model="sshUsername" placeholder="ubuntu" />
        </label>
        <div class="wizard-actions">
          <button @click="emit('close')">Cancel</button>
          <button :disabled="!canGoStep2" class="btn-primary" @click="goToStep2">Next →</button>
        </div>
      </div>

      <!-- Step 2: Canonical Node -->
      <div v-if="step === 2" class="wizard-body">
        <h3>Canonical Node Version</h3>
        <div v-if="loadingReleases" class="wiz-loading">Loading releases...</div>
        <div v-else-if="releases.length === 0" class="wiz-empty">
          No releases found. Run <code>scripts/build_node_release.sh</code> first.
        </div>
        <div v-else>
          <label>Version
            <select v-model="selectedVersion">
              <option v-for="r in releases" :key="r.commit" :value="r.version">
                {{ r.version }} ({{ r.commit.slice(0, 8) }})
              </option>
            </select>
          </label>
        </div>
        <p class="wiz-hint">Media URL is derived by the backend from the node ID and MEDIA_DOMAIN.</p>
        <div class="wizard-actions">
          <button @click="step = 1">← Back</button>
          <button :disabled="!canGoStep3" class="btn-primary" @click="step = 3">Next →</button>
        </div>
      </div>

      <!-- Step 3: SSH Key & Deploy -->
      <div v-if="step === 3" class="wizard-body">
        <h3>SSH Access</h3>
        <p class="wiz-hint">Paste the SSH private key for <strong>{{ sshUsername }}@{{ host }}</strong>.
          It is used only for this deployment and never stored.</p>
        <label>SSH Private Key (PEM)
          <textarea v-model="sshPrivateKey" rows="6" placeholder="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----" spellcheck="false" />
        </label>
        <div class="wizard-actions">
          <button @click="step = 2">← Back</button>
          <button :disabled="!canDeploy" class="btn-primary btn-deploy" @click="startDeploy">
            🚀 Deploy
          </button>
        </div>
      </div>

      <!-- Step 4: Deployment Progress -->
      <div v-if="step === 4" class="wizard-body">
        <h3>Deploying {{ nodeName }} to {{ host }}</h3>
        <div v-if="deploymentStatus?.status === 'FAILED'" class="deploy-error" role="alert">
          <strong>FAILED</strong> at {{ stageLabels[deploymentStatus.error_stage] || deploymentStatus.error_stage }}
          <p>{{ deploymentStatus.error_reason }}</p>
          <p>Исправьте указанную причину и повторите установку этого узла. Backend и Витрина не переустанавливаются. Для повторной попытки введите SSH-ключ заново.</p>
        </div>
        <div v-if="deploymentStatus?.status === 'FAILED'" class="wizard-actions">
          <button @click="step = 3">← Исправить и повторить</button>
          <button @click="emit('close')">Close</button>
        </div>
        <div class="deploy-stages">
          <div v-for="s in allStages" :key="s" :class="['deploy-stage', stageClass(s)]">
            <span class="stage-icon">{{ stageIcon(s) }}</span>
            <span class="stage-label">{{ stageLabels[s] || s }}</span>
          </div>
        </div>

      </div>

      <!-- Step 5: Success -->
      <div v-if="step === 5" class="wizard-body wizard-success">
        <div class="success-icon">✓</div>
        <h3>{{ nodeName }}</h3>
        <p class="success-status">ACTIVE · HEALTHY</p>
        <p class="success-wg">✓ Control Connection: WireGuard</p>
        <p>Node version: {{ deploymentStatus?.target_version }}</p>
        <p>Commit: {{ deploymentStatus?.target_commit?.slice(0, 12) }}</p>
        <div class="wizard-actions">
          <button class="btn-primary" @click="emit('close')">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.wizard-modal {
  background: var(--k-surface, var(--ui-raised)); border: 1px solid var(--k-border-strong, var(--ui-border));
  border-radius: var(--ui-radius); width: 520px; max-width: 95vw; text-align: left;
  max-height: 90vh; overflow-y: auto; color: var(--k-text-secondary, var(--ui-text));
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.wizard-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px 12px; border-bottom: 1px solid var(--k-border, var(--ui-border));
}
.wizard-header h2 { margin: 0; font-size: 1.2rem; font-weight: 700; color: var(--k-text, var(--ui-text)); }
.wizard-close {
  background: none; border: none; color: var(--ui-muted); font-size: 1.5rem;
  cursor: pointer; padding: 0 4px;
}
.wizard-steps {
  display: flex; justify-content: center; gap: 12px; padding: 16px 0;
}
.wstep {
  width: 28px; height: 28px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 0.8rem;
  background: var(--ui-raised); color: var(--k-text-muted, var(--ui-link));
}
.wstep.active { background: var(--ui-primary); color: var(--ui-on-primary); }
.wstep.done { background: var(--ui-success-bg); color: white; }
.wizard-body { padding: 0 24px 24px; }
.wizard-body h3 { margin: 0 0 16px; font-size: 1rem; font-weight: 600; color: var(--k-text, var(--ui-text)); }
.wizard-body label {
  display: block; margin-bottom: 12px; font-size: 0.85rem; color: var(--k-text-muted, var(--ui-link)); text-align: left;
}
.wizard-body input, .wizard-body select, .wizard-body textarea {
  width: 100%; margin-top: 4px; padding: 8px 12px; border-radius: var(--ui-radius);
  border: 1px solid var(--k-border-strong, var(--ui-control)); background: var(--k-surface-sunken, var(--ui-bg)); color: var(--k-text, var(--ui-text));
  font-size: 0.9rem; font-family: var(--ui-font); box-sizing: border-box;
}
.wizard-body textarea { font-family: monospace; font-size: 0.8rem; resize: vertical; }
.wizard-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
}
.wizard-actions button {
  padding: 8px 20px; border-radius: var(--ui-radius); border: 1px solid var(--k-border-strong, var(--ui-border));
  background: var(--ui-raised); color: var(--k-text-secondary, var(--ui-text)); cursor: pointer;
  font-size: 0.85rem; font-weight: 600; font-family: var(--ui-font);
}
.btn-primary { background: var(--ui-primary) !important; border-color: var(--ui-control) !important; color: var(--ui-on-primary) !important; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-deploy { background: var(--ui-success-bg) !important; border-color: var(--ui-success) !important; }
.wiz-hint { font-size: 0.85rem; color: var(--ui-muted); margin-bottom: 12px; line-height: 1.4; }
.wiz-loading, .wiz-empty { color: var(--ui-muted); font-size: 0.9rem; padding: 12px 0; }
.deploy-stages { display: flex; flex-direction: column; gap: 8px; }
.deploy-stage {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: var(--ui-radius); background: var(--k-surface-sunken, var(--ui-bg)); font-size: 0.9rem;
}
.stage-icon { font-size: 1rem; width: 20px; text-align: center; }
.stage-ok { color: var(--ui-success); }
.stage-ok .stage-icon { color: var(--ui-success); }
.stage-failed { color: var(--ui-danger); }
.stage-active { color: var(--ui-warning); }
.stage-active .stage-icon { animation: pulse 1s infinite; }
.stage-pending { color: var(--ui-on-primary); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.deploy-error {
  margin-top: 16px; padding: 12px; background: var(--ui-bg); border: 1px solid var(--ui-danger);
  border-radius: var(--ui-radius); color: var(--ui-danger); font-size: 0.85rem;
}
.deploy-error p { color: var(--ui-secondary); margin: 8px 0 0; }
.wizard-success { text-align: center; padding-top: 20px; }
.success-icon {
  font-size: 3rem; color: var(--ui-success); margin-bottom: 12px;
  width: 64px; height: 64px; border-radius: 50%; background: rgba(34,197,94,0.1);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
}
.success-status { color: var(--ui-success); font-weight: bold; font-size: 1rem; }
.success-wg { color: var(--ui-link); font-size: 0.9rem; margin-top: 4px; }
.field-error { display: block; color: var(--ui-danger); font-size: 0.8rem; margin-top: 4px; }
</style>
