<script setup lang="ts">
import { ref, computed } from 'vue'
import axios from 'axios'
import { addToast } from '../toast'

const props = defineProps<{
  mode: 'create' | 'authorize'
  sessionId?: string
  sessionName?: string
}>()

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'cancel'): void
}>()

type Step = 'config' | 'phone' | 'sending' | 'otp' | 'password' | 'success'
const step = ref<Step>(props.mode === 'create' ? 'config' : 'phone')

// Create-mode form
const form = ref({
  name: '',
  account_identifier: '',
  session_identifier: '',
  phone: '',
  api_id: '',
  api_hash: '',
  max_streams: 25,
})

// Auth state
const phone = ref('')
const phoneCodeHash = ref('')
const otpCode = ref('')
const twoFaPassword = ref('')
const createdSessionId = ref(props.sessionId || '')
const error = ref('')
const submitting = ref(false)

const maskedPhone = computed(() => {
  const p = props.mode === 'create' ? form.value.phone : phone.value
  if (!p || p.length < 6) return p || ''
  return p.slice(0, 4) + '\u2022\u2022\u2022\u2022\u2022\u2022' + p.slice(-3)
})

const auth = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
})

const canSubmitConfig = computed(() =>
  form.value.account_identifier &&
  form.value.session_identifier &&
  form.value.api_id &&
  form.value.api_hash &&
  form.value.phone
)

// Step phase for progress indicator: 0=setup, 1=verify, 2=done
const stepPhase = computed(() => {
  switch (step.value) {
    case 'config': case 'phone': return 0
    case 'sending': case 'otp': case 'password': return 1
    case 'success': return 2
    default: return 0
  }
})

// ── Create + Request Code ──
const handleContinue = async () => {
  error.value = ''
  submitting.value = true

  try {
    let activePhone: string
    let sid: string

    if (props.mode === 'create') {
      activePhone = form.value.phone
      const payload = {
        name: form.value.name || null,
        account_identifier: form.value.account_identifier,
        session_identifier: form.value.session_identifier,
        api_id: parseInt(form.value.api_id as any) || 0,
        api_hash: form.value.api_hash,
        max_streams: form.value.max_streams,
      }
      step.value = 'sending'
      const resp = await axios.post('/api/v1/admin/media/sessions', payload, auth())
      sid = resp.data.id
      createdSessionId.value = sid
    } else {
      activePhone = phone.value
      sid = createdSessionId.value
      step.value = 'sending'
    }

    // Request OTP code
    const codeResp = await axios.post(
      `/api/v1/admin/media/sessions/${sid}/auth/request-code`,
      { phone: activePhone },
      auth(),
    )
    phoneCodeHash.value = codeResp.data.phone_code_hash
    step.value = 'otp'
  } catch (err: any) {
    error.value = err.response?.data?.detail || 'Failed to start authorization'
    step.value = props.mode === 'create' ? 'config' : 'phone'
  } finally {
    submitting.value = false
  }
}

// ── Resend OTP ──
const resendCode = async () => {
  error.value = ''
  submitting.value = true
  try {
    const activePhone = props.mode === 'create' ? form.value.phone : phone.value
    const codeResp = await axios.post(
      `/api/v1/admin/media/sessions/${createdSessionId.value}/auth/request-code`,
      { phone: activePhone },
      auth(),
    )
    phoneCodeHash.value = codeResp.data.phone_code_hash
    addToast('Verification code resent', 'success')
  } catch (err: any) {
    error.value = err.response?.data?.detail || 'Failed to resend code'
  } finally {
    submitting.value = false
  }
}

// ── Submit OTP ──
const submitOtp = async () => {
  error.value = ''
  submitting.value = true
  try {
    const activePhone = props.mode === 'create' ? form.value.phone : phone.value
    const resp = await axios.post(
      `/api/v1/admin/media/sessions/${createdSessionId.value}/auth/submit-code`,
      {
        phone: activePhone,
        phone_code_hash: phoneCodeHash.value,
        code: otpCode.value,
      },
      auth(),
    )
    if (resp.data.requires_password) {
      step.value = 'password'
    } else if (resp.data.success) {
      step.value = 'success'
    } else {
      error.value = resp.data.message || 'Verification failed'
    }
  } catch (err: any) {
    error.value = err.response?.data?.detail || 'Verification failed'
  } finally {
    submitting.value = false
  }
}

// ── Submit 2FA Password ──
const submit2fa = async () => {
  error.value = ''
  submitting.value = true
  try {
    const activePhone = props.mode === 'create' ? form.value.phone : phone.value
    const resp = await axios.post(
      `/api/v1/admin/media/sessions/${createdSessionId.value}/auth/submit-code`,
      {
        phone: activePhone,
        phone_code_hash: phoneCodeHash.value,
        code: otpCode.value,
        password: twoFaPassword.value,
      },
      auth(),
    )
    if (resp.data.success) {
      step.value = 'success'
    } else {
      error.value = resp.data.message || 'Authentication failed'
    }
  } catch (err: any) {
    error.value = err.response?.data?.detail || 'Authentication failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="aw-overlay" @click.self="step !== 'sending' && emit('cancel')">
      <div class="aw-modal">
        <!-- Step indicator -->
        <div class="aw-steps-bar">
          <div class="aw-dot" :class="{ active: stepPhase === 0, done: stepPhase > 0 }"><span>1</span></div>
          <div class="aw-line" :class="{ done: stepPhase > 0 }"></div>
          <div class="aw-dot" :class="{ active: stepPhase === 1, done: stepPhase > 1 }"><span>2</span></div>
          <div class="aw-line" :class="{ done: stepPhase > 1 }"></div>
          <div class="aw-dot" :class="{ active: stepPhase === 2 }"><span>\u2713</span></div>
        </div>

        <!-- ── Step: Config (create mode) ── -->
        <div v-if="step === 'config'" class="aw-body">
          <h3 class="aw-title">Add Telegram Session</h3>
          <div class="aw-form">
            <label class="aw-label">Identifier *
              <input v-model="form.session_identifier" class="aw-input" placeholder="e.g. msxportal" />
            </label>
            <label class="aw-label">Telegram Phone *
              <input v-model="form.phone" class="aw-input" placeholder="+380XXXXXXXXX" />
            </label>
            <label class="aw-label">Account Identifier *
              <input v-model="form.account_identifier" class="aw-input" placeholder="e.g. @myaccount" />
            </label>
            <label class="aw-label">Display Name <span class="aw-opt">(optional)</span>
              <input v-model="form.name" class="aw-input" placeholder="e.g. Media Account 2" />
            </label>
            <div class="aw-form-row">
              <label class="aw-label">API ID *
                <input v-model="form.api_id" class="aw-input" type="number" placeholder="12345678" />
              </label>
              <label class="aw-label">API Hash *
                <input v-model="form.api_hash" class="aw-input" placeholder="32-char hex" />
              </label>
            </div>
            <label class="aw-label">Max Streams
              <input v-model.number="form.max_streams" class="aw-input" type="number" min="1" max="100" />
            </label>
          </div>
          <div v-if="error" class="aw-error">{{ error }}</div>
          <div class="aw-actions">
            <button class="aw-btn aw-btn-sec" @click="emit('cancel')">Cancel</button>
            <button class="aw-btn aw-btn-pri" @click="handleContinue" :disabled="!canSubmitConfig || submitting">
              {{ submitting ? 'Creating...' : 'Continue' }}
            </button>
          </div>
        </div>

        <!-- ── Step: Phone (authorize mode) ── -->
        <div v-if="step === 'phone'" class="aw-body">
          <h3 class="aw-title">Authorize Telegram Session</h3>
          <p class="aw-desc" v-if="props.sessionName">Session: <strong>{{ props.sessionName }}</strong></p>
          <div class="aw-form">
            <label class="aw-label">Telegram Phone Number
              <input v-model="phone" class="aw-input aw-input-lg" placeholder="+380XXXXXXXXX" @keyup.enter="phone && handleContinue()" />
            </label>
          </div>
          <div v-if="error" class="aw-error">{{ error }}</div>
          <div class="aw-actions">
            <button class="aw-btn aw-btn-sec" @click="emit('cancel')">Cancel</button>
            <button class="aw-btn aw-btn-pri" @click="handleContinue" :disabled="!phone || submitting">
              {{ submitting ? 'Sending...' : 'Continue' }}
            </button>
          </div>
        </div>

        <!-- ── Step: Sending code ── -->
        <div v-if="step === 'sending'" class="aw-body aw-center">
          <h3 class="aw-title">Authorizing Telegram Session</h3>
          <p class="aw-desc">Phone: <strong>{{ maskedPhone }}</strong></p>
          <p class="aw-desc">Sending Telegram verification code...</p>
          <div class="aw-spinner-wrap"><div class="aw-spinner"></div></div>
        </div>

        <!-- ── Step: OTP code ── -->
        <div v-if="step === 'otp'" class="aw-body">
          <h3 class="aw-title">Telegram Verification</h3>
          <p class="aw-desc">A verification code was sent to Telegram.</p>
          <div class="aw-form">
            <label class="aw-label">Code
              <input v-model="otpCode" class="aw-input aw-input-code" placeholder="_ _ _ _ _" maxlength="6" autocomplete="one-time-code" @keyup.enter="otpCode && submitOtp()" />
            </label>
          </div>
          <div v-if="error" class="aw-error">{{ error }}</div>
          <div class="aw-actions">
            <button class="aw-btn aw-btn-sec" @click="resendCode" :disabled="submitting">Resend</button>
            <button class="aw-btn aw-btn-pri" @click="submitOtp" :disabled="!otpCode || submitting">
              {{ submitting ? 'Verifying...' : 'Verify' }}
            </button>
          </div>
        </div>

        <!-- ── Step: 2FA Password ── -->
        <div v-if="step === 'password'" class="aw-body">
          <h3 class="aw-title">Two-Factor Authentication</h3>
          <p class="aw-desc">Your Telegram account requires a password.</p>
          <div class="aw-form">
            <label class="aw-label">Password
              <input v-model="twoFaPassword" class="aw-input" type="password" @keyup.enter="twoFaPassword && submit2fa()" />
            </label>
          </div>
          <div v-if="error" class="aw-error">{{ error }}</div>
          <div class="aw-actions">
            <button class="aw-btn aw-btn-sec" @click="step = 'otp'; error = ''">Back</button>
            <button class="aw-btn aw-btn-pri" @click="submit2fa" :disabled="!twoFaPassword || submitting">
              {{ submitting ? 'Verifying...' : 'Verify' }}
            </button>
          </div>
        </div>

        <!-- ── Step: Success ── -->
        <div v-if="step === 'success'" class="aw-body aw-center">
          <div class="aw-success-icon">\u2713</div>
          <h3 class="aw-title">Session Authorized</h3>
          <p class="aw-desc">Telegram session is now active and will be loaded by the Media Worker.</p>
          <div class="aw-actions">
            <button class="aw-btn aw-btn-pri" @click="emit('success')">Done</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.aw-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.aw-modal { background: #1e293b; border: 1px solid rgba(99,102,241,0.2); border-radius: 14px; padding: 1.5rem; max-width: 520px; width: 92%; }

/* Step indicator */
.aw-steps-bar { display: flex; align-items: center; justify-content: center; gap: 0; margin-bottom: 1.2rem; padding: 0 2rem; }
.aw-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #475569; transition: all 0.3s; flex-shrink: 0; }
.aw-dot.active { border-color: #818cf8; color: #818cf8; background: rgba(99,102,241,0.1); }
.aw-dot.done { border-color: #34d399; color: #34d399; background: rgba(16,185,129,0.1); }
.aw-line { flex: 1; height: 2px; background: #475569; transition: background 0.3s; margin: 0 0.5rem; }
.aw-line.done { background: #34d399; }

.aw-body { display: flex; flex-direction: column; gap: 0.8rem; }
.aw-center { align-items: center; text-align: center; padding: 1rem 0; }
.aw-title { color: #e2e8f0; font-size: 1.1rem; font-weight: 600; margin: 0; }
.aw-desc { color: #94a3b8; font-size: 0.85rem; margin: 0; }

.aw-form { display: flex; flex-direction: column; gap: 0.6rem; }
.aw-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.aw-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: #94a3b8; font-weight: 500; }
.aw-opt { font-weight: 400; color: #64748b; }
.aw-input { padding: 0.45rem 0.6rem; border-radius: 6px; font-size: 0.85rem; background: rgba(15,23,42,0.8); border: 1px solid rgba(100,116,139,0.3); color: #e2e8f0; outline: none; }
.aw-input:focus { border-color: #6366f1; }
.aw-input-lg { font-size: 1rem; padding: 0.6rem 0.8rem; }
.aw-input-code { font-size: 1.4rem; letter-spacing: 0.3em; text-align: center; font-family: 'JetBrains Mono', monospace; }

.aw-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #f87171; font-size: 0.82rem; padding: 0.5rem 0.75rem; border-radius: 6px; }

.aw-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.4rem; }
.aw-btn { padding: 0.45rem 1.1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
.aw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.aw-btn-sec { background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
.aw-btn-pri { background: linear-gradient(135deg, #6366f1, #818cf8); color: #fff; }
.aw-btn-pri:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }

.aw-spinner-wrap { padding: 1.5rem 0; }
.aw-spinner { width: 32px; height: 32px; border: 3px solid rgba(129,140,248,0.3); border-top-color: #818cf8; border-radius: 50%; animation: awspin 0.8s linear infinite; margin: 0 auto; }
@keyframes awspin { to { transform: rotate(360deg); } }

.aw-success-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16,185,129,0.15); color: #34d399; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
</style>
