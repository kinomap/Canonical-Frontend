/**
 * KINOSOTA motion-design prestart for the web: the prepared intro video plays the
 * moment «Смотреть» is pressed and later dissolves into the film (or into the
 * desktop player) while its sound fades out. The sound fade uses a Web Audio
 * GainNode when the page may run an AudioContext (also the only way on iOS,
 * where media volume is read-only) and an HTML5 volume ramp otherwise. Both use
 * equal-power curves, so the intro and the film never dip or clip together.
 */

export const INTRO_POSTER = '/cinema/intro/kinosota-intro-v1.jpg'
export const INTRO_SOURCES = [
  { src: '/cinema/intro/kinosota-intro-v1.webm', type: 'video/webm; codecs="vp9, opus"' },
  { src: '/cinema/intro/kinosota-intro-v1.mp4', type: 'video/mp4; codecs="avc1.640028, mp4a.40.2"' },
] as const
/** Cross-dissolve from the intro to the film (or to the opened desktop player). */
export const DISSOLVE_MS = 900

export type IntroStart = 'sound' | 'muted' | 'blocked'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function attempt(media: HTMLMediaElement): Promise<void> {
  try {
    const played = media.play() as Promise<void> | undefined
    return played && typeof played.then === 'function' ? played : Promise.resolve()
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Play with sound (the click is a user gesture); a stricter autoplay policy gets the muted intro. */
export async function startIntro(media: HTMLMediaElement): Promise<IntroStart> {
  media.muted = false
  try {
    await attempt(media)
    return 'sound'
  } catch {
    media.muted = true
    try {
      await attempt(media)
      return 'muted'
    } catch {
      return 'blocked' // The poster (the intro's first frame) stays: still no black screen.
    }
  }
}

export const fadeOutCurve = (p: number) => Math.cos(Math.min(Math.max(p, 0), 1) * Math.PI / 2)
export const fadeInCurve = (p: number) => Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI / 2)

type Frame = (callback: (time: number) => void) => number
const frame: Frame = (callback) => typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(callback)
  : setTimeout(() => callback(Date.now()), 16) as unknown as number
const cancelFrame = (id: number) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  clearTimeout(id)
}
const now = () => Date.now()

/** Ramp media.volume along a curve; `done` resolves at the end or as soon as `stop()` is called. */
export function rampVolume(media: HTMLMediaElement, ms: number, curve: (p: number) => number, to = 1) {
  let id = 0
  let stopped = false
  let finish = () => {}
  const start = now()
  const done = new Promise<void>((resolve) => {
    finish = resolve
    const step = () => {
      if (stopped) return resolve()
      const p = ms > 0 ? (now() - start) / ms : 1
      try { media.volume = Math.min(Math.max(to * curve(p), 0), 1) } catch { /* read-only volume (iOS) */ }
      if (p >= 1) return resolve()
      id = frame(step)
    }
    step()
  })
  return { done, stop: () => { stopped = true; cancelFrame(id); finish() } }
}

type AudioContextLike = {
  state: string
  currentTime: number
  destination: unknown
  createMediaElementSource(media: HTMLMediaElement): { connect(node: unknown): unknown }
  createGain(): { gain: { value: number; setValueAtTime(v: number, t: number): unknown; setValueCurveAtTime?(c: Float32Array, t: number, d: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; cancelScheduledValues(t: number): unknown }; connect(node: unknown): unknown }
  close?(): Promise<void>
}

function audioContext(): AudioContextLike | null {
  const scope = globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
  const Context = scope.AudioContext ?? scope.webkitAudioContext
  if (!Context) return null
  try { return new Context() } catch { return null }
}

/**
 * Fades one media element's sound out. Call `attachIntroAudio` right after the
 * click (inside the user activation): an AudioContext created later could start
 * suspended, and routing a playing element into it would cut its sound at once.
 */
export interface IntroAudio { fadeOut(ms: number): Promise<void>; webAudio: boolean }

export function attachIntroAudio(media: HTMLMediaElement): IntroAudio {
  const ctx = audioContext()
  if (ctx && ctx.state === 'running') {
    try {
      const source = ctx.createMediaElementSource(media)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      return {
        webAudio: true,
        fadeOut(ms: number) {
          const t = ctx.currentTime
          gain.gain.cancelScheduledValues(t)
          const steps = 32
          const curve = new Float32Array(steps)
          for (let i = 0; i < steps; i++) curve[i] = fadeOutCurve(i / (steps - 1)) * gain.gain.value
          if (typeof gain.gain.setValueCurveAtTime === 'function') gain.gain.setValueCurveAtTime(curve, t, Math.max(ms, 1) / 1000)
          else gain.gain.linearRampToValueAtTime(0, t + Math.max(ms, 1) / 1000)
          return new Promise((resolve) => setTimeout(() => { void ctx.close?.().catch?.(() => {}); resolve() }, ms))
        },
      }
    } catch { /* Element already routed or cross-origin: fall back to volume. */ }
  }
  void ctx?.close?.().catch?.(() => {})
  return {
    webAudio: false,
    fadeOut(ms: number) {
      return rampVolume(media, ms, fadeOutCurve, media.volume).done
    },
  }
}

/** The film's sound comes in under the dissolving intro. */
export function fadeInFilm(media: HTMLMediaElement, ms = DISSOLVE_MS) {
  return rampVolume(media, ms, fadeInCurve, 1)
}
