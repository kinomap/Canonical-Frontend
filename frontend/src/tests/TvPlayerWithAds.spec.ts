import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'

/**
 * TV player commercial cycle: the REAL AdPlaybackContainer (ad plan over the mocked ad API) →
 * the KINOSOTA intro (CinemaIntro, stubbed: its clip needs a media pipeline) → the film.
 */
const api = vi.hoisted(() => ({
  request: vi.fn(),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
  heartbeatPlayback: vi.fn(),
  getMovie: vi.fn(),
  getSeriesDetail: vi.fn(),
  startSeriesPlayback: vi.fn(),
  playbackTicket: vi.fn(),
  sources: vi.fn(),
  detail: vi.fn(),
}))
const intro = vi.hoisted(() => ({ enabled: true }))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    adRequest: api.request,
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
  return { ...actual, torrentPlaybackApi: { playbackTicket: api.playbackTicket, sources: api.sources }, torrentsApi: { detail: api.detail } }
})
vi.mock('@/api/watchHistory', () => ({ createHistoryWriter: () => vi.fn().mockResolvedValue(undefined), getResume: vi.fn().mockResolvedValue({ item: null }) }))
vi.mock('@/stores/auth', async () => {
  const { ref, computed } = await import('vue')
  const token = ref<string | null>(null)
  const store = { token, user: ref(null), isAuthenticated: computed(() => !!token.value) }
  return { useAuthStore: () => store }
})
vi.mock('@/components/CinemaIntro.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({
    name: 'CinemaIntro',
    props: { active: Boolean, target: String },
    emits: ['finished', 'started'],
    setup(props, { expose }) {
      expose({ enabled: intro.enabled })
      return () => h('div', { 'data-testid': 'cinema-intro-stub', 'data-target': props.target, 'data-active': String(props.active) })
    },
  }) }
})

import TvPlayerView from '@/views/tv/TvPlayerView.vue'

const CREATIVE = { delivery_id: 'd1', media_url: 'https://ads.example/preroll.mp4', duration_sec: 15, skip_after: null, cta_url: '', cta_text: '' }
const PRE = { cue_points: [{ id: 'pre1', kind: 'pre', at_sec: 0 }], plan_token: 'plan-1' }
const EMPTY = { cue_points: [], plan_token: null }

let router: Router
let wrapper: VueWrapper | undefined
let play: ReturnType<typeof vi.spyOn>

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

function planWith(plan: unknown) {
  api.request.mockImplementation((url: string) => Promise.resolve(
    url.includes('/ads/plan/') ? plan : url.includes('/ads/prepare') ? { ad: { ...CREATIVE } } : { ok: true },
  ))
}

async function mountPlayer(query: Record<string, string>) {
  await router.push({ path: '/tv/player', query })
  wrapper = mount(TvPlayerView, { global: { plugins: [router] }, attachTo: document.body })
  for (let i = 0; i < 4; i++) { await flushPromises(); await nextTick() }
  return wrapper
}

const film = () => wrapper!.get('[data-testid="tv-video"]')
const adMedia = () => wrapper!.find('[data-testid="ad-media"]')
const introLayer = () => wrapper!.find('[data-testid="tv-intro-layer"]')
const planCalls = () => api.request.mock.calls.map(call => String(call[0])).filter(url => url.includes('/ads/plan/'))

async function finishIntro() {
  wrapper!.findComponent({ name: 'CinemaIntro' }).vm.$emit('finished')
  await flushPromises(); await nextTick(); await flushPromises()
}

describe('TV player: pre-roll → KINOSOTA intro → film', () => {
  beforeEach(async () => {
    intro.enabled = true
    Element.prototype.scrollIntoView = vi.fn()
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    for (const fn of Object.values(api)) fn.mockReset()
    planWith(PRE)
    api.startPlayback.mockResolvedValue({ session_id: 'sess-1', media_url: 'https://node.example/m1.mp4', heartbeat_interval_seconds: 30 })
    api.stopPlayback.mockResolvedValue(undefined)
    api.heartbeatPlayback.mockResolvedValue(undefined)
    api.getMovie.mockResolvedValue({ id: 'm1', title: 'Матрица', overview: '', year: 1999, poster: null, backdrop: null })
    api.detail.mockResolvedValue({ title: 'Игра престолов', overview: '', year: 2011, backdrop: null })
    api.sources.mockResolvedValue({ episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }], sources: [] })
    api.playbackTicket.mockResolvedValue({ stream_url: 'https://stream.example/1399.mp4', title: 'Игра престолов' })
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
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('requests the catalogue ad plan first and keeps the film off the screen during the pre-roll', async () => {
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    expect(planCalls()).toEqual(['/ads/plan/movie/m1?surface=telegram_browser'])
    expect(adMedia().exists()).toBe(true)
    expect(adMedia().attributes('src')).toBe(CREATIVE.media_url)
    // the stream is prepared in parallel (zero-gap start) but is not attached to <video> yet
    expect(api.startPlayback).toHaveBeenCalledWith('m1')
    expect(film().attributes('src')).toBeUndefined()
    expect(introLayer().exists()).toBe(false)
    expect(wrapper!.find('[data-testid="tv-player-loading"]').exists()).toBe(false)
  })

  it('after the pre-roll the KINOSOTA intro plays, and only then the film starts', async () => {
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    await adMedia().trigger('playing')
    await adMedia().trigger('ended')
    for (let i = 0; i < 3; i++) { await flushPromises(); await nextTick() }

    expect(introLayer().exists()).toBe(true)
    const stub = wrapper!.get('[data-testid="cinema-intro-stub"]')
    expect(stub.attributes('data-target')).toBe('browser_telegram')
    expect(stub.attributes('data-active')).toBe('true')
    expect(film().attributes('src')).toBeUndefined()
    expect(api.request.mock.calls.some(call => String(call[1]?.body ?? '').includes('impression'))).toBe(true)
    expect(api.request.mock.calls.some(call => String(call[1]?.body ?? '').includes('completion'))).toBe(true)

    await finishIntro()
    expect(introLayer().exists()).toBe(false)
    expect(film().attributes('src')).toBe('https://node.example/m1.mp4')
    expect(play.mock.contexts).toContain(film().element)
  })

  it('torrent episode: plan by kind / TMDB id / season / episode on torrent_browser; the chosen source goes to the ticket', async () => {
    planWith(EMPTY)
    await mountPlayer({ src: 'torrent', kind: 'tv', id: '1399', season: '1', episode: '2', source: 'src-4k' })
    expect(planCalls()).toEqual(['/ads/plan/torrent/tv/1399?surface=torrent_browser&season=1&episode=2'])
    expect(api.playbackTicket).toHaveBeenCalledWith('tv', 1399, { season: 1, episode: 2, source_id: 'src-4k' })
    expect(wrapper!.get('[data-testid="cinema-intro-stub"]').attributes('data-target')).toBe('browser_torrents')
    await finishIntro()
    expect(film().attributes('src')).toBe('https://stream.example/1399.mp4')
  })

  it('PRO / empty plan: no ad media, straight to the intro, then the film', async () => {
    planWith(EMPTY)
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    expect(adMedia().exists()).toBe(false)
    expect(introLayer().exists()).toBe(true)
    expect(film().attributes('src')).toBeUndefined()
    await finishIntro()
    expect(film().attributes('src')).toBe('https://node.example/m1.mp4')
  })

  it('the remote cannot seek, pause or skip the ad; Back leaves the player', async () => {
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    press('ArrowRight'); press('Enter'); press('ArrowDown'); await nextTick()
    expect(wrapper!.find('[data-testid="tv-seek"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="tv-panel"]').exists()).toBe(false)
    expect(adMedia().exists()).toBe(true)
    expect(introLayer().exists()).toBe(false)
    press('Escape'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })

  it('an intro switched off in the admin never holds the film', async () => {
    intro.enabled = false
    planWith(EMPTY)
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    expect(introLayer().exists()).toBe(false)
    expect(film().attributes('src')).toBe('https://node.example/m1.mp4')
  })

  it('a stalled intro hands over to the film after 15 s at most', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    planWith(EMPTY)
    await mountPlayer({ src: 'catalog', kind: 'movie', id: 'm1' })
    expect(introLayer().exists()).toBe(true)
    vi.advanceTimersByTime(15_000)
    await flushPromises(); await nextTick()
    expect(introLayer().exists()).toBe(false)
    expect(film().attributes('src')).toBe('https://node.example/m1.mp4')
  })

  it('never hands the stream to an external player', async () => {
    const source = (await import('@/views/tv/TvPlayerView.vue?raw')).default as string
    expect(source).not.toMatch(/vlc|vimu|intent:|android-app:|external player/i)
  })
})
