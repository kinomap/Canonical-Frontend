import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CinemaIntro from '@/components/CinemaIntro.vue'
import { attachIntroAudio, fadeInCurve, fadeInFilm, fadeOutCurve, firstFrameWatcher, INTRO_SOURCES, rampVolume, startIntro } from '@/lib/cinemaIntro'

function media(play: () => Promise<void> | undefined) {
  const element = document.createElement('video')
  Object.defineProperty(element, 'play', { configurable: true, value: vi.fn(play) })
  Object.defineProperty(element, 'pause', { configurable: true, value: vi.fn() })
  return element
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('KINOSOTA web intro', () => {
  it('offers VP9/Opus WebM first and H.264/AAC MP4 as the fallback', () => {
    expect(INTRO_SOURCES.map((s) => s.src)).toEqual(['/cinema/intro/kinosota-intro-v1.webm', '/cinema/intro/kinosota-intro-v1.mp4'])
    expect(INTRO_SOURCES[0].type).toContain('vp9')
    expect(INTRO_SOURCES[1].type).toContain('avc1')
  })

  it('starts with sound after the click and falls back to a muted intro under a strict autoplay policy', async () => {
    expect(await startIntro(media(() => Promise.resolve()))).toBe('sound')
    let calls = 0
    const strict = media(() => (++calls === 1 ? Promise.reject(new DOMException('', 'NotAllowedError')) : Promise.resolve()))
    expect(await startIntro(strict)).toBe('muted')
    expect(strict.muted).toBe(true)
    expect(await startIntro(media(() => Promise.reject(new Error('no'))))).toBe('blocked')
    expect(await startIntro(media(() => undefined))).toBe('sound') // Old browsers: play() returns nothing.
  })

  it('uses equal-power curves so the crossfade never dips or clips', () => {
    for (let i = 0; i <= 20; i++) {
      const p = i / 20
      expect(fadeOutCurve(p) ** 2 + fadeInCurve(p) ** 2).toBeCloseTo(1, 10)
    }
    expect(fadeOutCurve(0)).toBe(1)
    expect(fadeOutCurve(1)).toBeCloseTo(0, 10)
    expect(fadeInCurve(2)).toBe(1)
  })

  it('ramps HTML5 volume over the dissolve when Web Audio is unavailable', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] })
    const element = media(() => Promise.resolve())
    element.volume = 1
    const audio = attachIntroAudio(element)
    expect(audio.webAudio).toBe(false)
    const fading = audio.fadeOut(900)
    await vi.advanceTimersByTimeAsync(450)
    expect(element.volume).toBeGreaterThan(0.6)
    expect(element.volume).toBeLessThan(0.8)
    await vi.advanceTimersByTimeAsync(500)
    await fading
    expect(element.volume).toBeCloseTo(0, 5)
    const film = media(() => Promise.resolve())
    const fade = fadeInFilm(film, 900)
    expect(film.volume).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    await fade.done
    expect(film.volume).toBe(1)
    const stopped = rampVolume(film, 900, fadeOutCurve)
    stopped.stop()
    await stopped.done
  })

  it('fades the sound through a Web Audio gain node when the page may run audio', async () => {
    vi.useFakeTimers()
    const curve = vi.fn()
    const gain = { gain: { value: 1, setValueAtTime: vi.fn(), setValueCurveAtTime: curve, linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn() }
    const source = { connect: vi.fn() }
    const close = vi.fn(() => Promise.resolve())
    class FakeContext {
      state = 'running'
      currentTime = 3
      destination = {}
      createMediaElementSource = vi.fn(() => source)
      createGain = vi.fn(() => gain)
      close = close
    }
    vi.stubGlobal('AudioContext', FakeContext)
    const element = media(() => Promise.resolve())
    const audio = attachIntroAudio(element)
    expect(audio.webAudio).toBe(true)
    expect(source.connect).toHaveBeenCalledWith(gain)
    const done = audio.fadeOut(900)
    const [values, start, duration] = curve.mock.calls[0]
    expect(start).toBe(3)
    expect(duration).toBeCloseTo(0.9)
    expect(values[0]).toBe(1)
    expect(values[values.length - 1]).toBeCloseTo(0, 5)
    await vi.advanceTimersByTimeAsync(900)
    await done
    expect(close).toHaveBeenCalled()
  })

  it('keeps a suspended audio context away from the element (no sudden silence)', () => {
    class Suspended { state = 'suspended'; close = vi.fn(() => Promise.resolve()); createMediaElementSource = vi.fn() }
    vi.stubGlobal('AudioContext', Suspended)
    const audio = attachIntroAudio(media(() => Promise.resolve()))
    expect(audio.webAudio).toBe(false)
  })

  it('pauses the intro after its sound faded when it is no longer active', async () => {
    const play = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    const pause = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    const wrapper = mount(CinemaIntro, { props: { active: true, fadeMs: 1 } })
    await vi.waitFor(() => expect(play).toHaveBeenCalled())
    await vi.waitFor(() => expect(wrapper.emitted('started')?.[0]).toEqual(['sound']))
    await wrapper.setProps({ active: false })
    await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(1))
    wrapper.unmount()
    expect(pause).toHaveBeenCalledTimes(1) // end() is idempotent.
  })

  it('holds its final picture while the film still loads instead of meeting black', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    const pause = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    const wrapper = mount(CinemaIntro, { props: { active: true, fadeMs: 1 } })
    const clip = wrapper.get('video')
    let time = 0
    Object.defineProperties(clip.element, { duration: { configurable: true, get: () => 8 }, currentTime: { configurable: true, get: () => time } })
    time = 4
    await clip.trigger('timeupdate')
    expect(wrapper.classes()).not.toContain('is-holding')
    expect(pause).not.toHaveBeenCalled()
    time = 7.8
    await clip.trigger('timeupdate')
    expect(wrapper.classes()).toContain('is-holding')
    expect(pause).toHaveBeenCalledTimes(1)
    await clip.trigger('ended')
    expect(pause).toHaveBeenCalledTimes(1) // Holding already: no second freeze.
    await wrapper.setProps({ active: false })
    await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(2))
    wrapper.unmount()
  })

  it('never holds once the dissolve has begun', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() })
    const wrapper = mount(CinemaIntro, { props: { active: true, fadeMs: 1 } })
    await wrapper.setProps({ active: false })
    await wrapper.get('video').trigger('ended')
    expect(wrapper.classes()).not.toContain('is-holding')
    wrapper.unmount()
  })

  it('lets the film take over only once it shows moving frames', () => {
    const frames = firstFrameWatcher()
    const film = { paused: true, ended: false, videoWidth: 0, videoHeight: 0, currentTime: 0 }
    const check = (patch: Partial<typeof film>) => frames.check(Object.assign(film, patch) as unknown as HTMLVideoElement)
    expect(check({})).toBe(false) // Still buffering, paused.
    expect(check({ paused: false })).toBe(false) // Playing, but no decoded picture yet.
    expect(check({ videoWidth: 1920, videoHeight: 1080, currentTime: 42 })).toBe(false) // A resume position sets the base.
    expect(check({ currentTime: 42.05 })).toBe(false)
    expect(check({ currentTime: 42.15 })).toBe(true)
    expect(check({ currentTime: 10 })).toBe(false) // A seek back resets the base.
    expect(check({ currentTime: 10.2 })).toBe(true)
    expect(check({ ended: true })).toBe(false)
    frames.reset()
    expect(check({ ended: false, currentTime: 11 })).toBe(false)
  })
})
