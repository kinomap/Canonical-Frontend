import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick, type Ref } from 'vue'

const api = vi.hoisted(() => ({
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
  heartbeatPlayback: vi.fn(),
  getMovie: vi.fn(),
  getSeriesDetail: vi.fn(),
  startSeriesPlayback: vi.fn(),
  playbackTicket: vi.fn(),
  sources: vi.fn(),
  detail: vi.fn(),
  writer: vi.fn(),
  getResume: vi.fn(),
}))
const authMock = vi.hoisted(() => ({ token: null as null | Ref<string | null> }))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    apiClient: {
      startPlayback: api.startPlayback,
      stopPlayback: api.stopPlayback,
      heartbeatPlayback: api.heartbeatPlayback,
      getMovie: api.getMovie,
      getSeriesDetail: api.getSeriesDetail,
      startSeriesPlayback: api.startSeriesPlayback,
    },
  }
})
vi.mock('@/api/torrents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/torrents')>()
  return {
    ...actual,
    torrentPlaybackApi: { playbackTicket: api.playbackTicket, sources: api.sources },
    torrentsApi: { detail: api.detail },
  }
})
vi.mock('@/api/watchHistory', () => ({
  createHistoryWriter: () => api.writer,
  getResume: api.getResume,
}))
vi.mock('@/stores/auth', async () => {
  const { ref, computed } = await import('vue')
  const token = ref<string | null>(null)
  authMock.token = token
  const store = { token, user: ref(null), isAuthenticated: computed(() => !!token.value) }
  return { useAuthStore: () => store }
})

vi.mock('@/components/AdPlaybackContainer.vue', async () => {
  const { defineComponent, h, onMounted } = await import('vue')
  return { default: defineComponent({ name: 'AdPlaybackContainer', inheritAttrs: false, emits: ['settled', 'started'], setup(_, { emit, expose }) {
    expose({ busy: false, tick: () => {}, end: async () => {} })
    onMounted(() => emit('settled'))
    return () => h('div', { 'data-testid': 'ad-stub' })
  } }) }
})
vi.mock('@/components/CinemaIntro.vue', async () => {
  const { defineComponent, h, onMounted } = await import('vue')
  return { default: defineComponent({ name: 'CinemaIntro', inheritAttrs: false, emits: ['finished', 'started'], setup(_, { emit, expose }) {
    expose({ enabled: true })
    onMounted(() => emit('finished'))
    return () => h('div', { 'data-testid': 'intro-stub' })
  } }) }
})

import TvPlayerView from '@/views/tv/TvPlayerView.vue'
import { MIN_INTRO_MS, introClock } from '@/lib/cinemaIntro'

describe('TvPlayerView Samsung Tizen native AVPlay', () => {
  let router: Router
  let wrapper: VueWrapper | undefined
  let calls: string[] = []
  let listener: Record<string, (...args: unknown[]) => void> = {}
  let avState = 'PLAYING'
  let curMs = 15000

  beforeEach(async () => {
    calls = []
    listener = {}
    avState = 'PLAYING'
    curMs = 15000
    // Not about the intro: every look at its clock is MIN_INTRO_MS later, so the stub's at-once
    // `finished` already satisfies the 5 s minimum (TvPlayerWithAds.spec.ts covers the hold itself).
    let introNow = 0
    vi.spyOn(introClock, 'now').mockImplementation(() => (introNow += MIN_INTRO_MS))
    Element.prototype.scrollIntoView = vi.fn()
    for (const fn of Object.values(api)) fn.mockReset()
    authMock.token!.value = 'jwt'
    api.detail.mockResolvedValue({ title: 'Дюна', overview: '', year: 2024, backdrop: null })
    api.playbackTicket.mockResolvedValue({ stream_url: '/tv-stream/torrent-node-1/abc-123', title: 'Дюна' })
    api.writer.mockResolvedValue(undefined)

    ;(window as unknown as { tizen?: unknown; webapis?: unknown }).tizen = {
      tvinputdevice: {
        registerKeyBatch: (names: string[]) => { calls.push(`keys:${names.join(',')}`) },
        registerKey: (name: string) => { calls.push(`key:${name}`) },
      },
    }
    ;(window as unknown as { webapis?: unknown }).webapis = {
      avplay: {
        open: (url: string) => { calls.push(`open:${url}`) },
        close: () => { calls.push('close') },
        stop: () => { calls.push('stop') },
        play: () => { avState = 'PLAYING'; calls.push('play') },
        pause: () => { avState = 'PAUSED'; calls.push('pause') },
        seekTo: (ms: number) => { curMs = ms; calls.push(`seek:${ms}`) },
        getState: () => avState,
        getCurrentTime: () => curMs,
        getDuration: () => 600000,
        setDisplayRect: (...a: number[]) => { calls.push(`rect:${a.join(',')}`) },
        setDisplayMethod: () => { calls.push('method') },
        setSilentSubtitle: (s: boolean) => { calls.push(`sub-silent:${s}`) },
        setListener: (l: Record<string, (...args: unknown[]) => void>) => { listener = l },
        prepareAsync: (ok: () => void) => { calls.push('prepareAsync'); ok() },
        getTotalTrackInfo: () => [
          { index: 1, type: 'AUDIO', extra_info: JSON.stringify({ language: 'ru', codec: 'ac3' }) },
          { index: 2, type: 'AUDIO', extra_info: JSON.stringify({ language: 'en', codec: 'dts' }) },
        ],
        setSelectTrack: (kind: string, index: number) => { calls.push(`selectTrack:${kind}:${index}`) },
      },
    }

    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv', component: { render: () => null } },
      { path: '/tv/player', component: TvPlayerView },
    ] })
    await router.push('/tv')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.mocked(introClock.now).mockRestore()
    delete (window as unknown as { tizen?: unknown }).tizen
    delete (window as unknown as { webapis?: unknown }).webapis
    document.documentElement.classList.remove('tv-native-plane')
  })

  it('opens /tv-stream via Tizen AVPlay with absolute URL, switches audio track and cleans up on Back', async () => {
    await router.push({ path: '/tv/player', query: { src: 'torrent', kind: 'movie', id: '438631' } })
    wrapper = mount(TvPlayerView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()

    expect(wrapper.find('[data-testid="tv-avplayer"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tv-player"]').classes()).toContain('tv-native-plane')
    expect(wrapper.get('[data-testid="tv-player-engine"]').text()).toBe('Tizen AVPlay')
    expect(calls).toContain('open:http://localhost:3000/tv-stream/torrent-node-1/abc-123')
    expect(calls).toContain('prepareAsync')
    expect(calls).toContain('play')
    // Tizen maps the video plane from a fixed 1920x1080 grid, whatever window.innerWidth is.
    expect(calls).toContain('rect:0,0,1920,1080')
    expect(calls.indexOf('play')).toBeGreaterThan(calls.indexOf('prepareAsync'))
    expect(calls.indexOf('close')).toBeLessThan(calls.indexOf('open:http://localhost:3000/tv-stream/torrent-node-1/abc-123'))
    expect(calls).toContain('keys:MediaPlay,MediaPause,MediaPlayPause,MediaStop,MediaFastForward,MediaRewind,Return,Exit')
    const avObject = wrapper.get('[data-testid="tv-avplayer"]').element as HTMLElement
    expect(avObject.id).toBe('av-player')
    expect(avObject.getAttribute('type')).toBe('application/avplayer')
    expect(avObject.style.position).toBe('fixed')
    expect(avObject.style.zIndex).toBe('-1')

    listener.oncurrentplaytime?.()
    await nextTick()
    expect(wrapper.get('[data-testid="tv-time-current"]').text()).toBe('0:15')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await nextTick()
    expect(wrapper.get('[data-testid="tv-panel-option-0"]').text()).toContain('RU · AC3')
    expect(wrapper.get('[data-testid="tv-panel-option-1"]').text()).toContain('EN · DTS')

    await wrapper.get('[data-testid="tv-panel-option-1"]').trigger('click')
    expect(calls).toContain('selectTrack:AUDIO:2')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(calls).toContain('stop')
    expect(calls).toContain('close')
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('closes AVPlay when the app is hidden (Tizen suspend) and reopens the stream when it is visible again', async () => {
    await router.push({ path: '/tv/player', query: { src: 'torrent', kind: 'movie', id: '438631' } })
    wrapper = mount(TvPlayerView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()
    expect(calls.filter(c => c.startsWith('open:')).length).toBe(1)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(calls).toContain('stop')
    const closesAfterHide = calls.filter(c => c === 'close').length

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()
    expect(closesAfterHide).toBeGreaterThan(0)
    expect(calls.filter(c => c.startsWith('open:')).length).toBe(2)
    delete (document as unknown as { hidden?: boolean }).hidden
  })
})
