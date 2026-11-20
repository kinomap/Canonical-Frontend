import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VideoPlayer from '@/components/VideoPlayer.vue'
import { DEFAULT_INTRO, INTRO_CACHE_KEY, INTRO_CACHE_TTL_MS, allTargets, introConfig, loadIntroConfig, resetIntroConfigForTests } from '@/lib/cinemaIntro'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api/client', () => ({ adRequest: mocks.request }))

const stubs = {
  AdPlaybackContainer: { template: '<div />', methods: { end: async () => {}, tick: () => {} } },
  CinemaIntro: { template: '<div data-testid="intro-clip" />' },
}

function answer(browserTelegram: boolean) {
  return { ...DEFAULT_INTRO, targets: { ...allTargets(true), browser_telegram: browserTelegram } }
}
function serve(...bodies: unknown[]) {
  const fetcher = vi.fn()
  for (const body of bodies) fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
function staleTab(browserTelegram: boolean) {
  const config = answer(browserTelegram)
  sessionStorage.setItem(INTRO_CACHE_KEY, JSON.stringify({ at: Date.now(), config }))
  introConfig.value = config
}

let wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => { mocks.request.mockResolvedValue({}); resetIntroConfigForTests() })
afterEach(() => { wrappers.forEach((w) => w.unmount()); wrappers = []; vi.unstubAllGlobals(); vi.restoreAllMocks(); resetIntroConfigForTests() })

describe('Intro config is always fresh (admin checkbox applies at once)', () => {
  it('never trusts a stored answer without asking the server', async () => {
    expect(INTRO_CACHE_TTL_MS).toBe(0)
    staleTab(false)
    const fetcher = serve(answer(true), answer(false))
    expect((await loadIntroConfig()).targets.browser_telegram).toBe(true)
    expect((await loadIntroConfig()).targets.browser_telegram).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(introConfig.value.targets.browser_telegram).toBe(false)
  })

  it('shares one request between concurrent callers and keeps the last answer on network failure', async () => {
    const fetcher = serve(answer(false))
    const [a, b] = await Promise.all([loadIntroConfig(), loadIntroConfig()])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a.targets.browser_telegram).toBe(false); expect(b).toBe(a)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect((await loadIntroConfig({ force: true })).targets.browser_telegram).toBe(false)
  })
})

describe('Telegram web player intro (browser_telegram)', () => {
  it('plays the intro when the tab once saw browser_telegram=false but the admin has turned it on', async () => {
    staleTab(false)
    const fetcher = serve(answer(true), answer(true))
    const w = mount(VideoPlayer, { props: { src: 'https://example.test/film.mp4' }, global: { stubs } }); wrappers.push(w)
    await flushPromises()
    expect(fetcher).toHaveBeenCalled()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(true)
    expect(w.get('video').attributes('autoplay')).toBeUndefined()
  })

  it('holds the film while deciding, then starts it without an intro when the admin turned it off', async () => {
    staleTab(true)
    serve(answer(false), answer(false))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const w = mount(VideoPlayer, { props: { src: 'https://example.test/film.mp4' }, global: { stubs } }); wrappers.push(w)
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)
    expect(play).toHaveBeenCalled()
  })

  it('ignores a late answer that belongs to a previous source', async () => {
    staleTab(false)
    serve(answer(true), answer(true), answer(true))
    const w = mount(VideoPlayer, { props: { src: 'https://example.test/a.mp4' }, global: { stubs } }); wrappers.push(w)
    await w.setProps({ src: '' })
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)
  })

  it('stays silent with a source until the viewer presses Play (requested=false), then plays the intro', async () => {
    staleTab(true)
    const fetcher = serve(answer(true), answer(true))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const w = mount(VideoPlayer, { props: { src: 'https://example.test/episode.mp4', requested: false }, global: { stubs } }); wrappers.push(w)
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)
    expect(w.find('[data-testid="intro-clip"]').exists()).toBe(false)
    expect(w.get('video').attributes('autoplay')).toBeUndefined()
    expect(play).not.toHaveBeenCalled()

    await w.setProps({ requested: true })
    await flushPromises()
    expect(fetcher).toHaveBeenCalled()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(true)
  })

  it('stops the intro at once when playback is withdrawn (requested -> false)', async () => {
    staleTab(true)
    serve(answer(true), answer(true))
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const w = mount(VideoPlayer, { props: { src: 'https://example.test/episode.mp4', requested: true }, global: { stubs } }); wrappers.push(w)
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(true)
    await w.setProps({ requested: false })
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)
  })

  it('never requests or uncovers the ad container while the player has no source', async () => {
    staleTab(true)
    serve(answer(true), answer(true), answer(true))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const AdStub = { name: 'AdPlaybackContainer', props: ['requested', 'covered', 'source'], template: '<div />', methods: { end: async () => {}, tick: () => {} } }
    const w = mount(VideoPlayer, { props: { src: '', requested: true }, global: { stubs: { ...stubs, AdPlaybackContainer: AdStub } } }); wrappers.push(w)
    await flushPromises()
    const ads = () => w.findComponent(AdStub)
    expect(ads().props('requested')).toBe(false)
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(false)

    await w.setProps({ src: 'https://example.test/episode.mp4' })
    // While the intro decision is pending the ad must already count as covered and not requested.
    expect(ads().props('requested')).toBe(false)
    expect(ads().props('covered')).toBe(true)
    await flushPromises()
    expect(w.find('[data-testid="telegram-intro"]').exists()).toBe(true)
    expect(ads().props('requested')).toBe(false)
  })
})
