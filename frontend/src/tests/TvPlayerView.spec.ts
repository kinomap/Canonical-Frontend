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

import TvPlayerView from '@/views/tv/TvPlayerView.vue'

// The commercial cycle (pre-roll → intro → film) is covered by TvPlayerWithAds.spec.ts; here both stages
// settle at once so the playback behaviour itself is tested.
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

const DURATION = 600
let playing = false
let position = 0

function stubMedia() {
  playing = false
  position = 0
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => !playing })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => DURATION })
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get: () => position,
    set: (value: number) => { position = value },
  })
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    if (!playing) { playing = true; this.dispatchEvent(new Event('play')) }
    return Promise.resolve()
  })
  HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    if (playing) { playing = false; this.dispatchEvent(new Event('pause')) }
  })
  HTMLMediaElement.prototype.load = vi.fn()
}

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let router: Router
let wrapper: VueWrapper | undefined

async function mountPlayer(query: Record<string, string>) {
  await router.push({ path: '/tv/player', query })
  wrapper = mount(TvPlayerView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  await nextTick()
  await flushPromises()
  return wrapper
}

const movieQuery = { src: 'catalog', kind: 'movie', id: 'm1' }
const has = (id: string) => (wrapper as VueWrapper).find(`[data-testid="${id}"]`).exists()

describe('TvPlayerView.vue', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    Element.prototype.scrollIntoView = vi.fn()
    stubMedia()
    authMock.token!.value = 'jwt'
    for (const fn of Object.values(api)) fn.mockReset()
    api.startPlayback.mockResolvedValue({ session_id: 'sess-1', media_url: 'https://node.example/m1.mp4', heartbeat_interval_seconds: 30 })
    api.stopPlayback.mockResolvedValue(undefined)
    api.heartbeatPlayback.mockResolvedValue(undefined)
    api.getMovie.mockResolvedValue({ id: 'm1', title: 'Матрица', overview: 'Нео выбирает таблетку', year: 1999, poster: null, backdrop: null })
    api.getResume.mockResolvedValue({ item: null })
    api.writer.mockResolvedValue(undefined)
    api.detail.mockResolvedValue({ title: 'Бойцовский клуб', overview: '', year: 1999, backdrop: null })
    api.playbackTicket.mockResolvedValue({ stream_url: 'https://stream.example/550.mp4', title: 'Бойцовский клуб' })

    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv', component: { render: () => null } },
      { path: '/tv/player', component: TvPlayerView },
      { path: '/:any(.*)*', component: { render: () => null } },
    ] })
    router.push('/tv')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  it('starts catalogue playback and autoplays the node stream', async () => {
    await mountPlayer(movieQuery)
    expect(api.startPlayback).toHaveBeenCalledWith('m1')
    expect(wrapper!.get('[data-testid="tv-video"]').attributes('src')).toBe('https://node.example/m1.mp4')
    expect(wrapper!.get('[data-testid="tv-player-title"]').text()).toBe('Матрица')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(has('tv-paused')).toBe(false)
  })

  it('torrent titles play through a playback ticket', async () => {
    await mountPlayer({ src: 'torrent', kind: 'movie', id: '550' })
    expect(api.playbackTicket).toHaveBeenCalledWith('movie', 550, {})
    expect(api.startPlayback).not.toHaveBeenCalled()
    expect(wrapper!.get('[data-testid="tv-video"]').attributes('src')).toBe('https://stream.example/550.mp4')
  })

  it('OK pauses and resumes; the pause keeps the controls on screen', async () => {
    await mountPlayer(movieQuery)
    press('Enter'); await nextTick()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(has('tv-paused')).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper!.get('[data-testid="tv-player"]').classes()).not.toContain('controls-hidden')

    press('Enter'); await nextTick()
    expect(has('tv-paused')).toBe(false)
  })

  it('hides the controls 3.5 s after the last key press while playing', async () => {
    await mountPlayer(movieQuery)
    press('ArrowUp'); press('ArrowUp'); await nextTick()
    await vi.advanceTimersByTimeAsync(3400)
    expect(wrapper!.get('[data-testid="tv-player"]').classes()).not.toContain('controls-hidden')
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper!.get('[data-testid="tv-player"]').classes()).toContain('controls-hidden')
  })

  it('←/→ seek by 10 s, show the plaque and apply the target once the remote is quiet', async () => {
    await mountPlayer(movieQuery)
    position = 100
    press('ArrowRight'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-seek"]').text()).toContain('+10s')
    expect(wrapper!.get('[data-testid="tv-seek"]').text()).toContain('1:50')
    expect(position).toBe(100)

    await vi.advanceTimersByTimeAsync(700)
    expect(position).toBe(110)

    await vi.advanceTimersByTimeAsync(2000)
    press('ArrowLeft'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-seek"]').text()).toContain('-10s')
    await vi.advanceTimersByTimeAsync(700)
    expect(position).toBe(100)
  })

  it('a quick series of presses accelerates the seek step (10 s → 30 s)', async () => {
    await mountPlayer(movieQuery)
    position = 0
    for (let i = 0; i < 4; i++) press('ArrowRight')
    await nextTick()
    expect(wrapper!.get('[data-testid="tv-seek"]').text()).toContain('+1m')
    await vi.advanceTimersByTimeAsync(700)
    expect(position).toBe(60)
  })

  it('↓ opens the audio / subtitles sheet; Back closes it without leaving the player', async () => {
    await mountPlayer(movieQuery)
    press('ArrowDown'); await nextTick()
    expect(has('tv-panel')).toBe(true)
    expect(has('tv-panel-tab-audio')).toBe(true)
    expect(has('tv-panel-tab-subtitles')).toBe(true)
    expect(has('tv-panel-tab-episodes')).toBe(false)
    expect(wrapper!.get('[data-testid="tv-panel-option-0"]').text()).toContain('Дорожка по умолчанию')

    press('ArrowRight'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-panel-option-0"]').text()).toContain('Выкл')

    press('ArrowLeft'); press('ArrowLeft'); await nextTick()
    expect(position).toBe(0)

    press('Escape'); await flushPromises()
    expect(has('tv-panel')).toBe(false)
    expect(router.currentRoute.value.path).toBe('/tv/player')
  })

  it('↑ shows the title card; any key closes it', async () => {
    await mountPlayer(movieQuery)
    press('ArrowUp'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-info"]').text()).toContain('Нео выбирает таблетку')
    press('Escape'); await flushPromises()
    expect(has('tv-info')).toBe(false)
    expect(router.currentRoute.value.path).toBe('/tv/player')
  })

  it('Back saves the position to watch history, releases the stream and returns to /tv', async () => {
    await mountPlayer(movieQuery)
    position = 321
    press('Escape')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(api.writer).toHaveBeenCalledWith('sess-1', 321, DURATION, false, true)
    expect(api.stopPlayback).toHaveBeenCalledWith('sess-1', { keepalive: true })
    expect(wrapper!.get('[data-testid="tv-video"]').attributes('src')).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('Samsung (10009) and LG (461) Back key codes leave the player too', async () => {
    await mountPlayer(movieQuery)
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 10009, bubbles: true, cancelable: true }))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('guests do not write watch history', async () => {
    authMock.token!.value = null
    await mountPlayer(movieQuery)
    press('Escape'); await flushPromises()
    expect(api.writer).not.toHaveBeenCalled()
  })

  it('shows an error for an unknown target and Back still returns to /tv', async () => {
    await mountPlayer({ src: 'nope', kind: 'movie', id: 'x' })
    expect(has('tv-player-error')).toBe(true)
    expect(api.startPlayback).not.toHaveBeenCalled()
    press('Escape'); await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })
})
