<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'

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
const host = ref('')
const sshPort = ref(22)
const sshUsername = ref('ubuntu')

// Step 2 — Canonical Node
const releases = ref<any[]>([])
const selectedVersion = ref('')
const mediaPublicUrl = ref('')
const loadingReleases = ref(false)

// Step 3 — Deploy
const sshPrivateKey = ref('')

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const canGoStep2 = computed(() => nodeName.value.trim() && host.value.trim())
const canGoStep3 = computed(() => selectedVersion.value)
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
      const createResp = await axios.post('/api/v1/admin/media/nodes', {
        name: nodeName.value,
        hostname: host.value,
        media_endpoint: mediaPublicUrl.value || `http://${host.value}`,
        control_endpoint: '',
      }, auth())
      nodeId = createResp.data.id

      // Update SSH info
      await axios.patch(`/api/v1/admin/media/nodes/${nodeId}`, {
        hostname: host.value,
      }, auth())
    } catch (err: any) {
      if (err.response?.status === 409) {
        const nodes = await axios.get('/api/v1/admin/media/nodes', auth())
        const existing = nodes.data.find((n: any) =>
          n.name === nodeName.value || n.hostname === host.value
        )
        if (existing) {
          nodeId = existing.id
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
      media_public_url: mediaPublicUrl.value || `http://${host.value}`,
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
  upload_release: 'Canonical Node Upload',
  configure_node: 'Node Configuration',
  start_node: 'Start Containers',
  register_node: 'Registration',
  verify_health: 'Health Verification',
  finalize: 'Finalize',
}

const allStages = ['connect', 'preflight', 'install_docker', 'upload_release',
  'configure_node', 'start_node', 'register_node', 'verify_health', 'finalize']

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
        <h3>Target VPS</h3>
        <label>Node Name
          <input v-model="nodeName" placeholder="media-02" />
        </label>
        <label>Host / IP
          <input v-model="host" placeholder="203.0.113.12" />
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
        <label>Media Public URL (optional)
          <input v-model="mediaPublicUrl" :placeholder="`http://${host}`" />
        </label>
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
        <div class="deploy-stages">
          <div v-for="s in allStages" :key="s" :class="['deploy-stage', stageClass(s)]">
            <span class="stage-icon">{{ stageIcon(s) }}</span>
            <span class="stage-label">{{ stageLabels[s] || s }}</span>
          </div>
        </div>
        <div v-if="deploymentStatus?.status === 'FAILED'" class="deploy-error">
          <strong>FAILED</strong> at {{ stageLabels[deploymentStatus.error_stage] || deploymentStatus.error_stage }}
          <p>{{ deploymentStatus.error_reason }}</p>
        </div>
        <div v-if="deploymentStatus?.status === 'FAILED'" class="wizard-actions">
          <button @click="step = 3">← Retry</button>
          <button @click="emit('close')">Close</button>
        </div>
      </div>

      <!-- Step 5: Success -->
      <div v-if="step === 5" class="wizard-body wizard-success">
        <div class="success-icon">✓</div>
        <h3>{{ nodeName }}</h3>
        <p class="success-status">ACTIVE · HEALTHY</p>
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
  background: #1a1a2e; border-radius: 12px; width: 520px; max-width: 95vw;
  max-height: 90vh; overflow-y: auto; color: #e0e0e0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.wizard-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px 12px; border-bottom: 1px solid #2a2a4a;
}
.wizard-header h2 { margin: 0; font-size: 1.2rem; }
.wizard-close {
  background: none; border: none; color: #888; font-size: 1.5rem;
  cursor: pointer; padding: 0 4px;
}
.wizard-steps {
  display: flex; justify-content: center; gap: 12px; padding: 16px 0;
}
.wstep {
  width: 28px; height: 28px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 0.8rem;
  background: #2a2a4a; color: #888;
}
.wstep.active { background: #6366f1; color: white; }
.wstep.done { background: #22c55e; color: white; }
.wizard-body { padding: 0 24px 24px; }
.wizard-body h3 { margin: 0 0 16px; font-size: 1rem; }
.wizard-body label {
  display: block; margin-bottom: 12px; font-size: 0.85rem; color: #aaa;
}
.wizard-body input, .wizard-body select, .wizard-body textarea {
  width: 100%; margin-top: 4px; padding: 8px 12px; border-radius: 6px;
  border: 1px solid #3a3a5a; background: #0d0d1a; color: #e0e0e0;
  font-size: 0.9rem; font-family: inherit; box-sizing: border-box;
}
.wizard-body textarea { font-family: monospace; font-size: 0.8rem; resize: vertical; }
.wizard-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
}
.wizard-actions button {
  padding: 8px 20px; border-radius: 6px; border: 1px solid #3a3a5a;
  background: #2a2a4a; color: #e0e0e0; cursor: pointer; font-size: 0.85rem;
}
.btn-primary { background: #6366f1 !important; border-color: #6366f1 !important; color: white !important; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-deploy { background: #22c55e !important; border-color: #22c55e !important; }
.wiz-hint { font-size: 0.85rem; color: #888; margin-bottom: 12px; line-height: 1.4; }
.wiz-loading, .wiz-empty { color: #888; font-size: 0.9rem; padding: 12px 0; }
.deploy-stages { display: flex; flex-direction: column; gap: 8px; }
.deploy-stage {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: 6px; background: #0d0d1a; font-size: 0.9rem;
}
.stage-icon { font-size: 1rem; width: 20px; text-align: center; }
.stage-ok { color: #22c55e; }
.stage-ok .stage-icon { color: #22c55e; }
.stage-failed { color: #ef4444; }
.stage-active { color: #f59e0b; }
.stage-active .stage-icon { animation: pulse 1s infinite; }
.stage-pending { color: #555; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.deploy-error {
  margin-top: 16px; padding: 12px; background: #1a0505; border: 1px solid #ef4444;
  border-radius: 6px; color: #ef4444; font-size: 0.85rem;
}
.deploy-error p { color: #ccc; margin: 8px 0 0; }
.wizard-success { text-align: center; padding-top: 20px; }
.success-icon {
  font-size: 3rem; color: #22c55e; margin-bottom: 12px;
  width: 64px; height: 64px; border-radius: 50%; background: rgba(34,197,94,0.1);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
}
.success-status { color: #22c55e; font-weight: bold; font-size: 1rem; }
</style>
