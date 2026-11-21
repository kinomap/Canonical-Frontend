import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick, type Ref } from 'vue'

const pairing = vi.hoisted(() => ({ start: vi.fn(), exchange: vi.fn() }))
const authMock = vi.hoisted(() => ({
  store: null as null | {
    token: Ref<string | null>
    user: Ref<Record<string, unknown> | null>
    fetchCurrentUser: ReturnType<typeof vi.fn>
    logout: ReturnType<typeof vi.fn>
  },
}))

vi.mock('@/lib/tvPairing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tvPairing')>()
  return { ...actual, tvPairingApi: pairing }
})
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, clearClientCache: vi.fn() }
})
vi.mock('@/stores/auth', async () => {
  const { ref, computed } = await import('vue')
  const token = ref<string | null>(null)
  const user = ref<Record<string, unknown> | null>(null)
  const store = {
    token,
    user,
    isAuthenticated: computed(() => !!token.value),
    fetchCurrentUser: vi.fn(async () => null),
    logout: vi.fn(async () => { token.value = null; user.value = null }),
  }
  authMock.store = store
  return { useAuthStore: () => store }
})

import TvAuthView from '@/views/tv/TvAuthView.vue'
import { PairingError } from '@/lib/tvPairing'

const TOKEN_KEY = 'tg_stream_access_token'
const started = (extra: Record<string, unknown> = {}) => ({
  device_code: 'secret-device-code',
  user_code: 'ABCD2345',
  verification_uri: 'https://watch.scenrix.com/profile?player_code=ABCD2345',
  expires_in: 300,
  interval: 5,
  ...extra,
})

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let router: Router
let wrapper: VueWrapper | undefined

async function mountAuth() {
  wrapper = mount(TvAuthView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  await nextTick()
  return wrapper
}

const store = () => authMock.store!

describe('TvAuthView.vue', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    pairing.start.mockReset().mockResolvedValue(started())
    pairing.exchange.mockReset().mockResolvedValue({ status: 'pending' })
    store().token.value = null
    store().user.value = null
    store().logout.mockClear()
    store().fetchCurrentUser.mockClear()

    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv', component: { render: () => null } },
      { path: '/tv/auth', component: TvAuthView },
      { path: '/:any(.*)*', component: { render: () => null } },
    ] })
    router.push('/tv/auth')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  it('starts the device flow and shows the QR code, the split code and the phone address', async () => {
    await mountAuth()
    expect(pairing.start).toHaveBeenCalledTimes(1)
    expect(wrapper!.get('[data-testid="tv-auth-code"]').text()).toBe('ABCD-2345')
    expect(wrapper!.find('[data-testid="tv-auth-qr"] path').attributes('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(wrapper!.get('[data-testid="tv-auth-url"]').text()).toContain('/auth/desktop?code=ABCD2345')
    expect(wrapper!.get('[data-testid="tv-auth-timer"]').text()).toContain('5:00')
  })

  it('polls the exchange every interval, stores the token and returns to /tv', async () => {
    pairing.exchange
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'authorized', access_token: 'jwt-token' })
    await mountAuth()

    expect(pairing.exchange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(pairing.exchange).toHaveBeenCalledWith('secret-device-code')
    expect(wrapper!.find('[data-testid="tv-auth-success"]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(pairing.exchange).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-token')
    expect(store().token.value).toBe('jwt-token')
    expect(store().fetchCurrentUser).toHaveBeenCalled()
    expect(wrapper!.get('[data-testid="tv-auth-success"]').text()).toContain('Вход успешно выполнен!')

    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('counts the code down and offers «Обновить код» when it expires', async () => {
    pairing.start.mockResolvedValueOnce(started({ expires_in: 3, interval: 10 }))
    await mountAuth()
    expect(wrapper!.get('[data-testid="tv-auth-timer"]').text()).toContain('0:03')

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper!.find('[data-testid="tv-auth-expired"]').exists()).toBe(true)
    expect(pairing.exchange).not.toHaveBeenCalled()

    await wrapper!.get('[data-testid="tv-auth-refresh"]').trigger('click')
    await flushPromises()
    expect(pairing.start).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-testid="tv-auth-timer"]').exists()).toBe(true)
  })

  it('stops polling when the backend reports the code as gone (410)', async () => {
    pairing.exchange.mockRejectedValueOnce(new PairingError(410, 'PAIRING_EXPIRED'))
    await mountAuth()
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper!.find('[data-testid="tv-auth-expired"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(pairing.exchange).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting through a network error', async () => {
    pairing.exchange.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({ status: 'pending' })
    await mountAuth()
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(pairing.exchange).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-testid="tv-auth-timer"]').exists()).toBe(true)
  })

  it('shows an error with «Обновить код» when the flow cannot start', async () => {
    pairing.start.mockRejectedValueOnce(new PairingError(503, ''))
    await mountAuth()
    expect(wrapper!.find('[data-testid="tv-auth-error"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="tv-auth-refresh"]').exists()).toBe(true)
  })

  it('remote Back returns to the catalogue and stops polling', async () => {
    await mountAuth()
    press('Escape'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('signed in: shows the profile card and the device badge, no pairing', async () => {
    store().token.value = 'existing'
    store().user.value = { username: 'kos', display_name: 'Константин', email: 'kos@example.com' }
    await mountAuth()
    expect(pairing.start).not.toHaveBeenCalled()
    expect(wrapper!.get('#tv-profile-name').text()).toBe('Константин')
    expect(wrapper!.get('[data-testid="tv-device-badge"]').text()).toMatch(/Активно ТВ-устройство \(1 из \d+\)/)
    expect(wrapper!.find('[data-testid="tv-auth-catalog"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="tv-auth-logout"]').exists()).toBe(true)
  })

  it('«Назад в каталог» with OK opens /tv', async () => {
    store().token.value = 'existing'
    await mountAuth()
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('«Выйти из аккаунта» clears the token and starts a new sign-in', async () => {
    store().token.value = 'existing'
    localStorage.setItem(TOKEN_KEY, 'existing')
    await mountAuth()
    await wrapper!.get('[data-testid="tv-auth-logout"]').trigger('click')
    await flushPromises()
    expect(store().logout).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(pairing.start).toHaveBeenCalledTimes(1)
    expect(wrapper!.find('[data-testid="tv-auth-code"]').exists()).toBe(true)
  })
})
