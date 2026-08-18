/**
 * Tests for the JWT expiry fix:
 * - isTokenExpired() short-circuit (no network call when exp already passed)
 * - Centralized 401 interceptor → auth:expired event
 * - LoginView session_expired banner
 *
 * NOTE: This file does NOT use vi.mock('@/api/client'), so the real client
 * module is exercised. fetch is swapped via globalThis.fetch spy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Helper: build a JWT-shaped string with controllable exp ───────────────────
function buildJwt(exp: number): string {
  const b64u = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: 'u-1', role: 'user', type: 'access', exp })}.fakesig`
}

// ── Suite 1: Real apiClient – token expiry logic ──────────────────────────────
describe('apiClient – expired token handling (real module)', () => {
  const TOKEN_KEY = 'tg_stream_access_token'
  let apiClient: typeof import('@/api/client').apiClient
  const savedFetch = globalThis.fetch

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/api/client')
    apiClient = mod.apiClient
    globalThis.fetch = vi.fn()
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = savedFetch
    localStorage.clear()
  })

  it('dispatches auth:expired AND short-circuits (no fetch) when token is expired', async () => {
    localStorage.setItem(TOKEN_KEY, buildJwt(Math.floor(Date.now() / 1000) - 3600))

    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)

    await expect(apiClient.getMovie('m')).rejects.toMatchObject({ status: 401 })

    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()   // ← short-circuit confirmed

    window.removeEventListener('auth:expired', onExpired)
  })

  it('does NOT dispatch auth:expired when token is valid', async () => {
    localStorage.setItem(TOKEN_KEY, buildJwt(Math.floor(Date.now() / 1000) + 7200))
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'm', title: 'T', original_title: '', status: 'available', genres: [] })
    } as Response)

    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)

    await apiClient.getMovie('m')

    expect(onExpired).not.toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledOnce()

    window.removeEventListener('auth:expired', onExpired)
  })

  it('dispatches auth:expired on backend 401 even when client-side token looks valid', async () => {
    // +60s — passes client-side check but backend rejects (clock skew)
    localStorage.setItem(TOKEN_KEY, buildJwt(Math.floor(Date.now() / 1000) + 60))
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Invalid token: Signature has expired.' })
    } as Response)

    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)

    await expect(apiClient.getMovie('m')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid token: Signature has expired.'
    })

    expect(onExpired).toHaveBeenCalledTimes(1)
    window.removeEventListener('auth:expired', onExpired)
  })

  it('does NOT dispatch auth:expired for non-401 backend errors', async () => {
    localStorage.setItem(TOKEN_KEY, buildJwt(Math.floor(Date.now() / 1000) + 7200))
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ detail: 'No nodes available' })
    } as Response)

    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)

    await expect(apiClient.startPlayback('m')).rejects.toMatchObject({ status: 503 })

    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener('auth:expired', onExpired)
  })
})

// ── Suite 2: LoginView banner (mocked client, no network) ─────────────────────
// Separate describe so vi.mock doesn't bleed into Suite 1
describe('LoginView – session_expired query-param banner', () => {
  function makeRouter(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login',    component: LoginView },
        { path: '/register', component: { template: '<div />' } },
        { path: '/profile',  component: { template: '<div />' } }
      ]
    })
    router.push(path)
    return router
  }

  it('shows amber notice when ?reason=session_expired', async () => {
    const router = makeRouter('/login?reason=session_expired')
    await router.isReady()
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.auth-session-alert').exists()).toBe(true)
    expect(wrapper.text()).toContain('session has expired')
  })

  it('hides session notice when no reason param', async () => {
    const router = makeRouter('/login')
    await router.isReady()
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.auth-session-alert').exists()).toBe(false)
  })
})

// ── Suite 3: SessionExpiredModal component ────────────────────────────────────
import SessionExpiredModal from '@/components/SessionExpiredModal.vue'

describe('SessionExpiredModal', () => {
  it('renders correctly when visible=true', async () => {
    const wrapper = mount(SessionExpiredModal, {
      props: { visible: true, returnUrl: '/movies/abc' }
    })
    await flushPromises()

    expect(wrapper.find('.session-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('Session Expired')
    expect(wrapper.text()).toContain('Sign In Again')
  })

  it('does NOT render overlay when visible=false', async () => {
    const wrapper = mount(SessionExpiredModal, {
      props: { visible: false, returnUrl: '/' }
    })
    await flushPromises()

    expect(wrapper.find('.session-overlay').exists()).toBe(false)
  })

  it('emits confirm when "Sign In Again" button is clicked', async () => {
    const wrapper = mount(SessionExpiredModal, {
      props: { visible: true, returnUrl: '/movies/xyz' }
    })
    await flushPromises()

    await wrapper.find('.session-btn').trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
