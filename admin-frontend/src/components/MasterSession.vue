<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'

interface MasterSession {
  id: string
  name: string | null
  account_identifier: string
  session_identifier: string
  credentials_configured: boolean
  status: string
  health_status: string
  is_active: boolean
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_display_name: string | null
  telegram_phone: string | null
  last_heartbeat_at: string | null
  last_health_check: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

interface HealthData {
  telegram_status: string
  channel_sync_worker: string
  reconciliation_worker: string
}

const session = ref<MasterSession | null>(null)
const health = ref<HealthData | null>(null)
const loading = ref(true)
const showReplaceModal = ref(false)
const replacing = ref(false)

// Auth flow: phone -> code -> (optional 2FA password) -> authorized.
// The challenge ({phone, phone_code_hash}) returned by request-code lives only in
// component memory for the current flow: never persisted, rendered or logged.
type AuthStep = 'idle' | 'phone' | 'code' | 'password'
interface AuthChallenge { phone: string; phone_code_hash: string }
const authStep = ref<AuthStep>('idle')
const authPhone = ref('')
const authCode = ref('')
const authPassword = ref('')
const authError = ref('')
const authSending = ref(false)
let authChallenge: AuthChallenge | null = null

const newSession = ref({
  name: '',
  account_identifier: '',
  session_identifier: '',
  api_id: '',
  api_hash: '',
})

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchMasterSession = async () => {
  try {
    const [sResp, hResp] = await Promise.all([
      axios.get('/api/v1/admin/media/master-session', auth()),
      axios.get('/api/v1/admin/dashboard/health', auth()),
    ])
    session.value = sResp.data
    health.value = hResp.data
  } catch (err: any) {
    if (err.response?.status === 404) {
      session.value = null
    }
  } finally {
    loading.value = false
  }
}

const displayStatus = computed(() => {
  if (!session.value) return { label: 'NOT CONFIGURED', cls: 'st-err' }
  const s = session.value
  if (s.status === 'ACTIVE' && s.health_status === 'HEALTHY') return { label: 'AUTHORIZED · HEALTHY', cls: 'st-ok' }
  if (s.health_status === 'STALE') return { label: 'STALE', cls: 'st-warn' }
  if (s.status === 'UNAUTHORIZED' || s.health_status === 'UNHEALTHY') return { label: 'UNAUTHORIZED', cls: 'st-err' }
  if (s.health_status === 'UNKNOWN') return { label: 'UNKNOWN', cls: 'st-warn' }
  return { label: s.status, cls: 'st-warn' }
})

const channelSyncStatus = computed(() => {
  if (!health.value) return 'UNKNOWN'
  return health.value.channel_sync_worker === 'running' ? 'HEALTHY' : 'STOPPED'
})

const reconciliationStatus = computed(() => {
  if (!health.value) return 'UNKNOWN'
  return health.value.reconciliation_worker === 'running' ? 'HEALTHY' : 'STOPPED'
})

const formatTime = (d: string | null) => {
  if (!d) return 'Never'
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  return date.toLocaleString()
}

const replaceSession = async () => {
  if (!newSession.value.account_identifier || !newSession.value.session_identifier) {
    addToast('Account and Session identifiers required', 'error')
    return
  }
  replacing.value = true
  try {
    const payload = {
      name: newSession.value.name || null,
      account_identifier: newSession.value.account_identifier,
      session_identifier: newSession.value.session_identifier,
      api_id: parseInt(newSession.value.api_id) || 0,
      api_hash: newSession.value.api_hash,
    }
    await axios.post('/api/v1/admin/media/master-session/change', payload, auth())
    addToast('Master Session replaced', 'success')
    showReplaceModal.value = false
    authStep.value = 'idle'
    await fetchMasterSession()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to replace session', 'error')
  } finally {
    replacing.value = false
  }
}

// Real backend/Telegram error text (FastAPI string detail or 422 validation list).
const apiErrorMessage = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d: any) => `${Array.isArray(d?.loc) ? d.loc.filter((x: any) => x !== 'body').join('.') : ''}: ${d?.msg ?? ''}`)
      .join('; ')
  }
  if (err?.response?.status) return `${fallback} (HTTP ${err.response.status})`
  return err?.message || fallback
}

const resetAuth = () => {
  authChallenge = null
  authCode.value = ''
  authPassword.value = ''
  authError.value = ''
  authStep.value = 'idle'
}

const startAuth = () => {
  resetAuth()
  authPhone.value = ''
  authStep.value = 'phone'
}

const failAuth = async (err: any, fallback: string) => {
  const message = apiErrorMessage(err, fallback)
  addToast(message, 'error')
  if (message.startsWith('SESSION_ALREADY_AUTHORIZED')) {
    resetAuth()
    await fetchMasterSession()
    return
  }
  if (message.startsWith('AUTH_FLOW_NOT_STARTED') || message.startsWith('PHONE_CODE_EXPIRED')
      || message.startsWith('PHONE_CODE_HASH')) {
    // The challenge is no longer valid: start again from the phone step.
    authChallenge = null
    authCode.value = ''
    authPassword.value = ''
    authStep.value = 'phone'
  }
  authError.value = message
}

const requestCode = async () => {
  authSending.value = true
  authError.value = ''
  try {
    const resp = await axios.post('/api/v1/admin/media/master-session/auth/request-code', {
      phone: authPhone.value,
    }, auth())
    authChallenge = {
      phone: resp.data.phone || authPhone.value,
      phone_code_hash: resp.data.phone_code_hash,
    }
    authCode.value = ''
    authStep.value = 'code'
    addToast('OTP code sent to Telegram', 'success')
  } catch (err: any) {
    await failAuth(err, 'Failed to request code')
  } finally {
    authSending.value = false
  }
}

const finishAuth = async () => {
  resetAuth()
  addToast('Session authorized successfully', 'success')
  await fetchMasterSession()
}

const submitAuth = async (withPassword: boolean) => {
  if (!authChallenge) {
    await failAuth({ message: 'AUTH_FLOW_NOT_STARTED: request a new code' }, 'Request a new code')
    return
  }
  authSending.value = true
  authError.value = ''
  try {
    const payload: Record<string, string> = {
      phone: authChallenge.phone,
      phone_code_hash: authChallenge.phone_code_hash,
      code: authCode.value,
    }
    if (withPassword) payload.password = authPassword.value
    const resp = await axios.post('/api/v1/admin/media/master-session/auth/submit-code', payload, auth())
    if (resp.data?.requires_password) {
      authPassword.value = ''
      authStep.value = 'password'
      return
    }
    await finishAuth()
  } catch (err: any) {
    await failAuth(err, withPassword ? 'Failed to submit 2FA password' : 'Failed to submit code')
  } finally {
    authSending.value = false
  }
}

const submitCode = () => submitAuth(false)
const submitPassword = () => submitAuth(true)

let refreshInterval: number | null = null

onMounted(() => {
  fetchMasterSession()
  refreshInterval = window.setInterval(fetchMasterSession, 30000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})
</script>

<template>
  <div class="master-session-card">
    <div class="ms-header">
      <div class="ms-header-left">
        <svg class="ms-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
        </svg>
        <h3 class="ms-title">Master Telegram Session</h3>
      </div>
      <span class="ms-badge" :class="displayStatus.cls">{{ displayStatus.label }}</span>
    </div>

    <div v-if="loading" class="ms-loading">
      <div class="loading-spinner-sm"></div>
    </div>

    <div v-else-if="!session" class="ms-empty">
      <p>No master session configured.</p>
      <button class="ms-btn ms-btn--primary" @click="showReplaceModal = true">Configure Session</button>
    </div>

    <div v-else class="ms-body">
      <div class="ms-info-grid">
        <div class="ms-info-row">
          <span class="ms-label">Session</span>
          <span class="ms-value">{{ session.session_identifier }}</span>
        </div>
        <div class="ms-info-row" v-if="session.telegram_display_name">
          <span class="ms-label">Name</span>
          <span class="ms-value ms-tg-user">{{ session.telegram_display_name }}</span>
        </div>
        <div class="ms-info-row" v-if="session.telegram_username">
          <span class="ms-label">Telegram</span>
          <span class="ms-value ms-tg-user">@{{ session.telegram_username }}</span>
        </div>
        <div class="ms-info-row" v-if="session.telegram_user_id">
          <span class="ms-label">User ID</span>
          <span class="ms-value ms-mono">{{ session.telegram_user_id }}</span>
        </div>
        <div class="ms-info-row" v-if="session.telegram_phone">
          <span class="ms-label">Phone</span>
          <span class="ms-value ms-mono">{{ session.telegram_phone }}</span>
        </div>
        <div class="ms-info-row">
          <span class="ms-label">Role</span>
          <span class="ms-value ms-role">Control Plane</span>
        </div>
        <div class="ms-info-row">
          <span class="ms-label">Last Check</span>
          <span class="ms-value">{{ formatTime(session.last_health_check) }}</span>
        </div>
      </div>

      <div class="ms-workers">
        <div class="ms-worker-item">
          <span class="ms-worker-dot" :class="channelSyncStatus === 'HEALTHY' ? 'dot-ok' : 'dot-err'"></span>
          <span>Channel Sync: {{ channelSyncStatus }}</span>
        </div>
        <div class="ms-worker-item">
          <span class="ms-worker-dot" :class="reconciliationStatus === 'HEALTHY' ? 'dot-ok' : 'dot-err'"></span>
          <span>Reconciliation: {{ reconciliationStatus }}</span>
        </div>
      </div>

      <div v-if="session.last_error" class="ms-error">
        <span class="ms-error-label">Error:</span> {{ session.last_error }}
      </div>

      <div class="ms-actions">
        <button class="ms-btn ms-btn--outline" @click="showReplaceModal = true">Replace Session</button>
        <button
          v-if="session.health_status !== 'HEALTHY'"
          class="ms-btn ms-btn--warn"
          @click="startAuth"
        >Authorize</button>
      </div>
    </div>

    <!-- Replace Session Modal -->
    <Teleport to="body">
      <div v-if="showReplaceModal" class="ms-overlay" @click.self="showReplaceModal = false">
        <div class="ms-modal">
          <h3>Replace Master Session</h3>
          <p class="ms-modal-desc">This will disconnect the current master session and assign a new one.</p>

          <div class="ms-form">
            <label>Session Name (optional)</label>
            <input v-model="newSession.name" placeholder="e.g. Control Plane Master" />

            <label>Account Identifier *</label>
            <input v-model="newSession.account_identifier" placeholder="e.g. Account-A" />

            <label>Session Identifier *</label>
            <input v-model="newSession.session_identifier" placeholder="e.g. tg_stream_backend" />

            <label>API ID *</label>
            <input v-model="newSession.api_id" type="number" placeholder="12345678" />

            <label>API Hash *</label>
            <input v-model="newSession.api_hash" type="password" placeholder="abc123..." />
          </div>

          <div class="ms-modal-actions">
            <button class="ms-btn ms-btn--outline" @click="showReplaceModal = false">Cancel</button>
            <button class="ms-btn ms-btn--primary" @click="replaceSession" :disabled="replacing">
              {{ replacing ? 'Replacing...' : 'Replace Session' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Authorize Modal -->
    <Teleport to="body">
      <div v-if="authStep !== 'idle'" class="ms-overlay" @click.self="resetAuth">
        <div class="ms-modal">
          <h3>Authorize Master Session</h3>

          <div v-if="authStep === 'phone'" class="ms-form">
            <label>Phone Number</label>
            <input v-model="authPhone" placeholder="+1234567890" autocomplete="tel" />
            <button class="ms-btn ms-btn--primary" @click="requestCode" :disabled="authSending || !authPhone" style="margin-top: 12px">
              {{ authSending ? 'Sending...' : 'Request Code' }}
            </button>
          </div>

          <div v-else-if="authStep === 'code'" class="ms-form">
            <label>OTP Code</label>
            <input v-model="authCode" placeholder="12345" autocomplete="one-time-code" inputmode="numeric" @keyup.enter="authCode && submitCode()" />
            <button class="ms-btn ms-btn--primary" @click="submitCode" :disabled="authSending || !authCode" style="margin-top: 12px">
              {{ authSending ? 'Verifying...' : 'Submit Code' }}
            </button>
          </div>

          <div v-else-if="authStep === 'password'" class="ms-form">
            <label>Two-Step Verification Password</label>
            <input v-model="authPassword" type="password" autocomplete="current-password" @keyup.enter="authPassword && submitPassword()" />
            <button class="ms-btn ms-btn--primary" @click="submitPassword" :disabled="authSending || !authPassword" style="margin-top: 12px">
              {{ authSending ? 'Verifying...' : 'Submit Password' }}
            </button>
          </div>

          <div v-if="authError" class="ms-error" role="alert">
            <span class="ms-error-label">Error:</span> {{ authError }}
          </div>

          <div class="ms-modal-actions">
            <button class="ms-btn ms-btn--outline" @click="resetAuth">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.master-session-card {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.ms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.ms-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ms-icon { color: #818cf8; }
.ms-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }

.ms-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}
.st-ok { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.st-warn { background: rgba(234, 179, 8, 0.15); color: #facc15; }
.st-err { background: rgba(239, 68, 68, 0.15); color: #f87171; }

.ms-loading { display: flex; justify-content: center; padding: 20px; }
.loading-spinner-sm {
  width: 20px; height: 20px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ms-empty { text-align: center; padding: 16px 0; color: #94a3b8; }

.ms-body { display: flex; flex-direction: column; gap: 14px; }

.ms-info-grid { display: flex; flex-direction: column; gap: 8px; }

.ms-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.ms-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3px; }
.ms-value { font-size: 13px; color: #e2e8f0; font-weight: 500; }
.ms-tg-user { color: #818cf8; }
.ms-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.ms-role {
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.ms-workers {
  display: flex;
  gap: 16px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.ms-worker-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.ms-worker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dot-ok { background: #4ade80; box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
.dot-err { background: #f87171; box-shadow: 0 0 4px rgba(248, 113, 113, 0.4); }

.ms-error {
  font-size: 12px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  padding: 8px 12px;
  border-radius: 6px;
}
.ms-error-label { font-weight: 600; }

.ms-actions { display: flex; gap: 10px; }

.ms-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}
.ms-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-btn--primary { background: #6366f1; color: #fff; }
.ms-btn--primary:hover:not(:disabled) { background: #818cf8; }
.ms-btn--outline { background: transparent; color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }
.ms-btn--outline:hover:not(:disabled) { border-color: #818cf8; color: #818cf8; }
.ms-btn--warn { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
.ms-btn--warn:hover:not(:disabled) { background: rgba(234, 179, 8, 0.25); }

/* Modal */
.ms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ms-modal {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 440px;
}

.ms-modal h3 { margin: 0 0 8px; color: #e2e8f0; font-size: 16px; }
.ms-modal-desc { color: #94a3b8; font-size: 13px; margin: 0 0 20px; }

.ms-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ms-form label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
  margin-top: 4px;
}

.ms-form input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(0, 0, 0, 0.2);
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.ms-form input:focus { border-color: #6366f1; }

.ms-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
