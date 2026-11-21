<script setup lang="ts">
/**
 * KINOSOTA TV sign-in (/tv/auth): no login / password typing with the remote.
 * Guest: device flow — QR code + 8-character code, the phone approves, the TV polls
 * /desktop/pairing/exchange and stores the token. Signed in: profile card + sign out.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { encode } from 'uqr'
import { useAuthStore } from '@/stores/auth'
import { clearClientCache } from '@/api/client'
import { useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import { TV_DEVICE_LIMIT } from '@/lib/tvConnect'
import { formatUserCode, phoneAuthUrl, pollDelayMs, tvPairingApi, PairingError, type PairingStart } from '@/lib/tvPairing'

const TOKEN_KEY = 'tg_stream_access_token'
const REDIRECT_DELAY_MS = 1500

type Phase = 'loading' | 'waiting' | 'expired' | 'error' | 'success'

const router = useRouter()
const auth = useAuthStore()
const root = ref<HTMLElement | null>(null)

const phase = ref<Phase>('loading')
const pairing = ref<PairingStart | null>(null)
const secondsLeft = ref(0)
const signingOut = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | undefined
let countdownTimer: ReturnType<typeof setInterval> | undefined
let redirectTimer: ReturnType<typeof setTimeout> | undefined
let flowId = 0
let disposed = false

const signedIn = computed(() => auth.isAuthenticated.value && phase.value !== 'success')
const userName = computed(() => auth.user.value?.display_name || auth.user.value?.username || 'Пользователь KINOSOTA')
const avatarLetter = computed(() => userName.value.trim().charAt(0).toUpperCase() || 'K')
const avatarUrl = computed(() => (auth.user.value as { avatar_url?: string | null } | null)?.avatar_url || '')

const userCode = computed(() => (pairing.value ? formatUserCode(pairing.value.user_code) : ''))
const phoneUrl = computed(() => (pairing.value ? phoneAuthUrl(pairing.value.user_code) : ''))
const countdown = computed(() => {
  const value = Math.max(0, secondsLeft.value)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
})

const qr = computed(() => {
  const uri = pairing.value?.verification_uri
  if (!uri) return null
  const { size, data } = encode(uri, { ecc: 'M', border: 2 })
  let path = ''
  data.forEach((line, y) => line.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z` }))
  return { size, path }
})

type ActionId = 'catalog' | 'logout' | 'refresh'
const actions = computed<{ id: ActionId; label: string }[]>(() => {
  if (signedIn.value) return [{ id: 'catalog', label: 'Назад в каталог' }, { id: 'logout', label: signingOut.value ? 'Выходим…' : 'Выйти из аккаунта' }]
  if (phase.value === 'success') return []
  const list: { id: ActionId; label: string }[] = []
  if (phase.value === 'expired' || phase.value === 'error') list.push({ id: 'refresh', label: 'Обновить код' })
  list.push({ id: 'catalog', label: 'Назад в каталог' })
  return list
})

const rows = computed<TvRow[]>(() => [{ id: 'actions', size: actions.value.length }])

function stopFlow() {
  flowId++
  clearTimeout(pollTimer)
  clearInterval(countdownTimer)
  pollTimer = undefined
  countdownTimer = undefined
}

function schedulePoll(id: number, delay: number) {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(() => { void poll(id) }, delay)
}

async function poll(id: number) {
  const current = pairing.value
  if (id !== flowId || !current || phase.value !== 'waiting') return
  try {
    const result = await tvPairingApi.exchange(current.device_code)
    if (id !== flowId) return
    if (result.status === 'authorized' && result.access_token) {
      onAuthorized(result.access_token)
      return
    }
    schedulePoll(id, pollDelayMs(current.interval))
  } catch (error) {
    if (id !== flowId) return
    if (error instanceof PairingError && (error.status === 410 || error.status === 401)) {
      stopFlow()
      phase.value = 'expired'
      return
    }
    // Rate limited or a network blip: keep waiting, a little slower.
    schedulePoll(id, pollDelayMs(current.interval) + (error instanceof PairingError && error.status === 429 ? 5000 : 0))
  }
}

function onAuthorized(token: string) {
  stopFlow()
  localStorage.setItem(TOKEN_KEY, token)
  auth.token.value = token
  clearClientCache()
  phase.value = 'success'
  void auth.fetchCurrentUser()
  redirectTimer = setTimeout(() => { if (!disposed) void router.replace('/tv') }, REDIRECT_DELAY_MS)
}

async function startPairing() {
  stopFlow()
  const id = flowId
  phase.value = 'loading'
  pairing.value = null
  try {
    const started = await tvPairingApi.start()
    if (id !== flowId || disposed) return
    pairing.value = started
    secondsLeft.value = Math.max(0, Math.floor(started.expires_in))
    phase.value = 'waiting'
    countdownTimer = setInterval(() => {
      secondsLeft.value = Math.max(0, secondsLeft.value - 1)
      if (secondsLeft.value === 0) {
        stopFlow()
        phase.value = 'expired'
      }
    }, 1000)
    schedulePoll(id, pollDelayMs(started.interval))
  } catch {
    if (id !== flowId || disposed) return
    phase.value = 'error'
  }
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await auth.logout()
    localStorage.removeItem(TOKEN_KEY)
    clearClientCache()
  } finally {
    signingOut.value = false
  }
  void startPairing()
}

function backToCatalog() {
  void router.push('/tv')
}

function runAction(id: ActionId) {
  if (id === 'catalog') backToCatalog()
  else if (id === 'logout') void signOut()
  else void startPairing()
}

function onSelect(target: TvSelectTarget) {
  if (target.area !== 'content') return
  const action = actions.value[target.index]
  if (action) runAction(action.id)
}

const nav = useTvNavigation({
  rows,
  root,
  onSelect,
  onBack: () => { backToCatalog(); return true },
})

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  if (auth.isAuthenticated.value) {
    if (!auth.user.value) void auth.fetchCurrentUser()
  } else {
    void startPairing()
  }
})

onBeforeUnmount(() => {
  disposed = true
  stopFlow()
  clearTimeout(redirectTimer)
  document.documentElement.classList.remove('tv-mode')
})
</script>

<template>
  <div ref="root" class="tv-auth" data-testid="tv-auth">
    <header class="tv-auth-head">
      <span class="tv-auth-brand" aria-hidden="true">K</span>
      <h1>{{ signedIn ? 'Профиль' : 'Вход в KINOSOTA' }}</h1>
    </header>

    <section v-if="signedIn" class="tv-auth-card tv-profile" data-testid="tv-auth-profile" aria-labelledby="tv-profile-name">
      <div class="tv-avatar" aria-hidden="true">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" />
        <span v-else>{{ avatarLetter }}</span>
      </div>
      <div class="tv-profile-text">
        <h2 id="tv-profile-name">{{ userName }}</h2>
        <p v-if="auth.user.value?.email" class="tv-muted">{{ auth.user.value.email }}</p>
        <span class="tv-badge" data-testid="tv-device-badge">Активно ТВ-устройство (1 из {{ TV_DEVICE_LIMIT }})</span>
      </div>
    </section>

    <section v-else-if="phase === 'success'" class="tv-auth-card tv-success" role="status" aria-live="polite" data-testid="tv-auth-success">
      <h2>Вход успешно выполнен!</h2>
      <p class="tv-muted">Открываем каталог…</p>
    </section>

    <section v-else class="tv-auth-card tv-pairing" aria-labelledby="tv-pairing-title">
      <div class="tv-qr" :class="{ dim: phase !== 'waiting' }">
        <svg
          v-if="qr"
          :viewBox="`0 0 ${qr.size} ${qr.size}`"
          shape-rendering="crispEdges"
          role="img"
          aria-label="QR-код для входа с телефона"
          data-testid="tv-auth-qr"
        >
          <rect :width="qr.size" :height="qr.size" fill="#fff" />
          <path :d="qr.path" fill="#000" />
        </svg>
        <span v-else class="tv-qr-placeholder" aria-hidden="true" />
      </div>

      <div class="tv-pairing-text">
        <h2 id="tv-pairing-title">Войдите с телефона</h2>
        <p v-if="phase === 'loading'" class="tv-muted" role="status">Получаем код входа…</p>
        <p v-else-if="phase === 'error'" class="tv-error" role="alert" data-testid="tv-auth-error">Не удалось получить код входа. Проверьте интернет и обновите код.</p>
        <template v-else>
          <p class="tv-code" data-testid="tv-auth-code" :aria-label="`Код входа ${pairing?.user_code ?? ''}`">{{ userCode }}</p>
          <ol class="tv-steps">
            <li>Наведите камеру смартфона на QR-код или откройте в телефоне: <strong data-testid="tv-auth-url">{{ phoneUrl }}</strong></li>
            <li>Нажмите «Подтвердить вход» на экране телефона</li>
          </ol>
          <p v-if="phase === 'waiting'" class="tv-timer" data-testid="tv-auth-timer">Код действует ещё <strong>{{ countdown }}</strong> · ждём подтверждения…</p>
          <p v-else class="tv-error" role="alert" data-testid="tv-auth-expired">Срок действия кода истёк. Нажмите «Обновить код».</p>
        </template>
      </div>
    </section>

    <div v-if="actions.length" class="tv-auth-actions">
      <button
        v-for="(action, index) in actions"
        :key="action.id"
        type="button"
        class="tv-auth-button"
        :class="{ 'tv-focused': nav.isFocused('actions', index), danger: action.id === 'logout' }"
        :data-tv-key="`actions:${index}`"
        :data-testid="`tv-auth-${action.id}`"
        :disabled="action.id === 'logout' && signingOut"
        @click="runAction(action.id)"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tv-auth {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4vh;
  padding: 5vh 6vw;
  overflow: hidden;
  background: radial-gradient(circle at 30% 20%, #151a24 0%, #07080b 65%);
  color: #f5f5f7;
}

.tv-auth-head {
  display: flex;
  align-items: center;
  gap: 20px;
}

.tv-auth-head h1 {
  margin: 0;
  font-size: clamp(30px, 2.4vw, 56px);
  font-weight: 800;
}

.tv-auth-brand {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: #f4d45e;
  color: #0d0e12;
  font-size: 34px;
  font-weight: 900;
}

.tv-auth-card {
  width: min(1400px, 100%);
  display: flex;
  align-items: center;
  gap: 5vw;
  padding: 5vh 4vw;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tv-qr {
  flex: 0 0 auto;
  width: clamp(260px, 22vw, 440px);
  aspect-ratio: 1;
  padding: 14px;
  border-radius: 20px;
  background: #fff;
  transition: opacity 0.2s ease;
}

.tv-qr.dim {
  opacity: 0.25;
}

.tv-qr svg,
.tv-qr-placeholder {
  display: block;
  width: 100%;
  height: 100%;
}

.tv-pairing-text h2,
.tv-profile-text h2,
.tv-success h2 {
  margin: 0 0 2vh;
  font-size: clamp(28px, 2vw, 48px);
}

.tv-code {
  margin: 0 0 3vh;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(56px, 5vw, 120px);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #f4d45e;
}

.tv-steps {
  margin: 0 0 3vh;
  padding-left: 1.4em;
  display: flex;
  flex-direction: column;
  gap: 1.6vh;
  font-size: clamp(20px, 1.4vw, 34px);
  line-height: 1.4;
}

.tv-steps strong {
  color: #fff;
  overflow-wrap: anywhere;
}

.tv-timer,
.tv-muted {
  margin: 0;
  color: #b8c0cc;
  font-size: clamp(18px, 1.2vw, 30px);
}

.tv-error {
  margin: 0;
  color: #ffb4b4;
  font-size: clamp(20px, 1.3vw, 32px);
}

.tv-success {
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.tv-avatar {
  flex: 0 0 auto;
  width: clamp(140px, 10vw, 220px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: #f4d45e;
  color: #0d0e12;
  font-size: clamp(60px, 4.5vw, 110px);
  font-weight: 900;
}

.tv-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tv-badge {
  display: inline-block;
  margin-top: 2.5vh;
  padding: 10px 22px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
  font-size: clamp(18px, 1.2vw, 28px);
  font-weight: 700;
}

.tv-auth-actions {
  display: flex;
  gap: 2vw;
}

.tv-auth-button {
  min-width: clamp(260px, 18vw, 420px);
  padding: 2vh 2.4vw;
  border: 4px solid transparent;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
  font: inherit;
  font-size: clamp(22px, 1.5vw, 36px);
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.tv-auth-button:hover,
.tv-auth-button.tv-focused {
  border-color: #f4d45e;
  background: rgba(244, 212, 94, 0.16);
  transform: scale(1.05);
  outline: none;
}

.tv-auth-button.danger.tv-focused {
  border-color: #f87171;
  background: rgba(248, 113, 113, 0.16);
}

.tv-auth-button:disabled {
  opacity: 0.6;
}
</style>
