<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'
import MasterReplacement from './MasterReplacement.vue'

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
const authPurpose = ref<'replace'|'authorize'>('replace')

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
const authDelivery = ref('')
const authDiagnostic = ref('')
let authChallenge: AuthChallenge | null = null


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
  if (s.health_status === 'ERROR') return { label: 'CHECK FAILED', cls: 'st-err' }
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
  authDelivery.value = ''
  authDiagnostic.value = ''
  authCode.value = ''
  authPassword.value = ''
  authError.value = ''
  authStep.value = 'idle'
}

const startAuth = () => {
  resetAuth()
  authPurpose.value = 'authorize'
  showReplaceModal.value = true
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
    // Keep only non-secret metadata. Never stringify resp.data (contains hash/phone).
    const deliveries: Record<string, string> = {
      SentCodeTypeApp: 'Telegram выбрал служебный чат Telegram на уже подключённом устройстве этого аккаунта.',
      SentCodeTypeSms: 'Telegram выбрал SMS на указанный номер, не сообщение в приложении.',
      SentCodeTypeCall: 'Telegram выбрал телефонный звонок.',
      SentCodeTypeEmailCode: 'Telegram выбрал электронную почту аккаунта, не сообщение в приложении.',
      SentCodeTypeSetUpEmailRequired: 'Telegram требует сначала настроить почту для входа. Этот ответ не подтверждает отправку кода.',
      SentCodeTypeFlashCall: 'Telegram выбрал короткий звонок, не сообщение в приложении.',
      SentCodeTypeMissedCall: 'Telegram выбрал пропущенный звонок, не сообщение в приложении.',
      SentCodeTypeFragmentSms: 'Telegram выбрал доставку через Fragment, не служебный чат Telegram.',
      SentCodeTypeFirebaseSms: 'Telegram выбрал Firebase SMS, не сообщение в приложении.',
      SentCodeTypeSmsWord: 'Telegram выбрал SMS со словом, не сообщение в приложении.',
      SentCodeTypeSmsPhrase: 'Telegram выбрал SMS с фразой, не сообщение в приложении.',

    }
    const kind = typeof resp.data.delivery_type === 'string' && /^SentCodeType[A-Za-z]+$/.test(resp.data.delivery_type)
      ? resp.data.delivery_type : 'unknown'
    authDelivery.value = deliveries[kind] || 'Backend не сообщил поддерживаемый способ доставки. Не запрашивайте коды подряд.'
    const diagnostic = typeof resp.data.diagnostic_id === 'string' && /^[a-f0-9]{32}$/.test(resp.data.diagnostic_id) ? resp.data.diagnostic_id : null
    authDiagnostic.value = JSON.stringify({
      diagnostic_id: diagnostic,
      delivery_type: Object.hasOwn(deliveries, kind) ? kind : 'unknown',
      next_type: ['CodeTypeSms', 'CodeTypeCall', 'CodeTypeFlashCall', 'CodeTypeMissedCall', 'CodeTypeFragmentSms'].includes(resp.data.next_type) ? resp.data.next_type : null,
      code_length: Number.isInteger(resp.data.code_length) && resp.data.code_length >= 1 && resp.data.code_length <= 32 ? resp.data.code_length : null,
      next_send_timeout: Number.isInteger(resp.data.next_send_timeout) && resp.data.next_send_timeout >= 0 && resp.data.next_send_timeout <= 86400 ? resp.data.next_send_timeout : null,
      delivery_confirmed: false,
    }, null, 2)
    addToast('Telegram принял запрос. Получение кода ещё не подтверждено.', 'info')
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
      <button class="ms-btn ms-btn--primary" @click="authPurpose='replace';showReplaceModal = true">Configure Session</button>
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
        <button class="ms-btn ms-btn--outline" @click="authPurpose='replace';showReplaceModal = true">Replace Session</button>
        <button
          v-if="session.health_status !== 'HEALTHY'"
          class="ms-btn ms-btn--warn"
          @click="startAuth"
        >Authorize</button>
      </div>
    </div>

    <MasterReplacement v-if="showReplaceModal" :purpose="authPurpose" :can-reuse="session?.credentials_configured===true" :initial-account="session?.account_identifier || ''" @close="showReplaceModal=false" @replaced="fetchMasterSession" />

    <!-- Authorize Modal -->
    <Teleport to="body">
      <div v-if="authStep !== 'idle'" class="ms-overlay">
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
            <div class="ms-delivery" role="status">
              <strong>Вход ещё не завершён. Доставка кода не подтверждена.</strong>
              <p>{{ authDelivery }}</p>
              <p>Если кода нет, не вводите старый и не запускайте запрос одновременно в загрузчике и админке.</p>
            </div>
            <details v-if="authDiagnostic" class="ms-auth-diagnostic">
              <summary>Безопасная диагностика запроса — без номера, кода и ключей</summary>
              <pre>{{ authDiagnostic }}</pre>
            </details>
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
.ms-delivery { padding: 12px; background: var(--ui-surface); border: 1px solid var(--ui-warning); border-radius: var(--ui-radius); color: var(--ui-warning); font-size: 13px; line-height: 1.5; }
.ms-delivery p { margin: 8px 0 0; }
.ms-auth-diagnostic summary { cursor: pointer; padding: 12px 0; min-height: 44px; box-sizing: border-box; font-size: 12px; line-height: 1.5; }
.ms-auth-diagnostic pre { max-width: 100%; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 12px; color: var(--ui-secondary); }
.ms-modal { max-height: 85vh; overflow-y: auto; box-sizing: border-box; }
.ms-modal .ms-btn, .ms-modal input { min-height: 44px; box-sizing: border-box; }

.master-session-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
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

.ms-icon { color: var(--ui-link); }
.ms-title { font-size: 14px; font-weight: 600; color: var(--ui-text); margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }

.ms-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--ui-radius-panel);
  letter-spacing: 0.5px;
}
.st-ok { background: rgba(34, 197, 94, 0.15); color: var(--ui-success); }
.st-warn { background: rgba(234, 179, 8, 0.15); color: var(--ui-warning); }
.st-err { background: rgba(239, 68, 68, 0.15); color: var(--ui-danger); }

.ms-loading { display: flex; justify-content: center; padding: 20px; }
.loading-spinner-sm {
  width: 20px; height: 20px;
  border: 2px solid var(--ui-border);
  border-top-color: var(--ui-control);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ms-empty { text-align: center; padding: 16px 0; color: var(--ui-link); }

.ms-body { display: flex; flex-direction: column; gap: 14px; }

.ms-info-grid { display: flex; flex-direction: column; gap: 8px; }

.ms-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.ms-label { font-size: 12px; color: var(--ui-link); text-transform: uppercase; letter-spacing: 0.3px; }
.ms-value { font-size: 13px; color: var(--ui-text); font-weight: 500; }
.ms-tg-user { color: var(--ui-link); }
.ms-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.ms-role {
  background: var(--ui-raised);
  color: var(--ui-link);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.ms-workers {
  display: flex;
  gap: 16px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: var(--ui-radius);
}

.ms-worker-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-secondary);
}

.ms-worker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dot-ok { background: var(--ui-success-bg); box-shadow: none; }
.dot-err { background: var(--ui-danger-bg); box-shadow: none; }

.ms-error {
  font-size: 12px;
  color: var(--ui-danger);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  padding: 8px 12px;
  border-radius: var(--ui-radius);
}
.ms-error-label { font-weight: 600; }

.ms-actions { display: flex; gap: 10px; }

.ms-btn {
  padding: 7px 14px;
  border-radius: var(--ui-radius);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}
.ms-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-btn--primary { background: var(--ui-primary); color: var(--ui-on-primary); }
.ms-btn--primary:hover:not(:disabled) { background: var(--ui-primary); color: var(--ui-on-primary); }
.ms-btn--outline { background: transparent; color: var(--ui-link); border: 1px solid var(--ui-border); }
.ms-btn--outline:hover:not(:disabled) { border-color: var(--ui-control); color: var(--ui-link); }
.ms-btn--warn { background: rgba(234, 179, 8, 0.15); color: var(--ui-warning); border: 1px solid rgba(234, 179, 8, 0.3); }
.ms-btn--warn:hover:not(:disabled) { background: rgba(234, 179, 8, 0.25); }

/* Modal */
.ms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ms-modal {
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 24px;
  width: 90%;
  max-width: 440px;
}

.ms-modal h3 { margin: 0 0 8px; color: var(--ui-text); font-size: 16px; }
.ms-modal-desc { color: var(--ui-link); font-size: 13px; margin: 0 0 20px; }

.ms-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ms-form label {
  font-size: 12px;
  color: var(--ui-link);
  font-weight: 500;
  margin-top: 4px;
}

.ms-form input {
  padding: 8px 12px;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-control);
  background: rgba(0, 0, 0, 0.2);
  color: var(--ui-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.ms-form input:focus { border-color: var(--ui-control); }

.ms-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
