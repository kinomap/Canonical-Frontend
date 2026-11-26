/**
 * KINOSOTA motion-design prestart for the web: the prepared intro video plays the
 * moment «Смотреть» is pressed and later dissolves into the film (or into the
 * desktop player) while its sound fades out. The sound fade uses a Web Audio
 * GainNode when the page may run an AudioContext (also the only way on iOS,
 * where media volume is read-only) and an HTML5 volume ramp otherwise. Both use
 * equal-power curves, so the intro and the film never dip or clip together.
 *
 * ZERO MEDIA ON VPS1/VPS2: the clip is never bundled with the SPA nor served by this site. The
 * Media Nodes serve it (default and admin-uploaded) as https://<node>/intro/<kind>/<file>?token=,
 * and GET /api/v1/cinema/intro names those URLs. No usable answer = no intro, never a VPS URL.
 */
import { ref } from 'vue'

/** Cross-dissolve from the intro to the film (or to the opened desktop player). */
export const DISSOLVE_MS = 900
/** Film progress the dissolve waits for: `playing` alone can come before the first presented frame. */
export const FIRST_FRAME_PROGRESS_S = 0.1
/** Ambient hold: this close to its end the intro freezes on its final picture while the film still loads. */
export const HOLD_LEAD_S = 0.25
/**
 * The intro always stays on screen at least this long, however fast the film or the pre-roll is ready
 * (its maximum is the clip itself). Intro (>= 5 s) → Pre-roll → film, or Intro (>= 5 s) → film.
 */
export const MIN_INTRO_MS = 5000
/** Clock of the intro minimum (`Date.now`); a seam for tests. */
export const introClock = { now: () => Date.now() }
/** How long the intro started at `startedAt` must still play before it may give way (0: it may now). */
export function introRemaining(startedAt: number, now = introClock.now()): number {
  return Math.max(0, MIN_INTRO_MS - (now - startedAt))
}

/**
 * Dynamic intro (admin «Видео и Реклама» → «Интро престарта»): GET /api/v1/cinema/intro says
 * whether the intro is on and which node serves the active clip. Fail-safe: any error keeps the
 * last good answer, else no intro at all (the film is never blocked). The last answer is kept in
 * sessionStorage only as the instant fallback value: every load revalidates with the server
 * (Cache-Control: no-cache + ETag, a cheap 304 while unchanged), so an admin checkbox change
 * applies to the very next start, never 60 s later.
 */
/** Where the intro plays (admin «Интро престарта» checkboxes). The intro is a brand bumper, not an ad. */
export const INTRO_TARGETS = ['browser_telegram', 'player_telegram', 'browser_torrents', 'player_torrents', 'tv_telegram', 'tv_torrent'] as const
export type IntroTarget = typeof INTRO_TARGETS[number]
export type IntroTargets = Record<IntroTarget, boolean>
/** Smart TV targets saved before they existed follow their browser counterpart (same rule as the backend). */
export const TV_TARGET_PARENTS: Readonly<Partial<Record<IntroTarget, IntroTarget>>> = Object.freeze({ tv_telegram: 'browser_telegram', tv_torrent: 'browser_torrents' })
export interface IntroConfig {
  enabled: boolean
  targets: IntroTargets
  version: string
  /** https://<node>/intro/<kind>/<file>?token=… ('' while no node serves an intro). */
  video_url: string
  webm_url: string | null
  still_url: string
  poster_url: string
  duration_ms: number
  is_custom: boolean
}
export const allTargets = (on: boolean): IntroTargets =>
  Object.fromEntries(INTRO_TARGETS.map((key) => [key, on])) as IntroTargets
/** Old backends (or caches) without `targets`: every target follows `enabled`; missing TV targets follow their browser parent. */
export function normalizeTargets(raw: unknown, fallback: boolean): IntroTargets {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const own = (key: IntroTarget): boolean | undefined => (typeof data[key] === 'boolean' ? data[key] as boolean : undefined)
  return Object.fromEntries(INTRO_TARGETS.map((key) => {
    const parent = TV_TARGET_PARENTS[key]
    return [key, own(key) ?? (parent ? own(parent) : undefined) ?? fallback]
  })) as IntroTargets
}
/** Should the intro play on this surface? Never without a node URL to play it from. */
export function introEnabledFor(config: Pick<IntroConfig, 'enabled'> & { targets?: Partial<IntroTargets>; video_url?: string }, target: IntroTarget): boolean {
  if (typeof config.video_url === 'string' && !config.video_url) return false
  const value = config.targets?.[target]
  return typeof value === 'boolean' ? value : !!config.enabled
}
export type IntroSource = { src: string; type: string }
export const INTRO_ENDPOINT = '/api/v1/cinema/intro'
/** v2: v1 answers held same-origin /cinema/intro/ and /media/cinema-intro/ paths, which no longer exist. */
export const INTRO_CACHE_KEY = 'kinosota.cinema-intro.v2'
/** 0: a stored answer is never trusted without asking the server (it only bridges network errors). */
export const INTRO_CACHE_TTL_MS = 0
/** Length of the bundled node default clip (kinosota-intro-v1), used when the server omits it. */
export const DEFAULT_INTRO_DURATION_MS = 14933
/** Until the server names a node that serves the intro there is no intro: never a URL on this site. */
export const NO_INTRO: IntroConfig = Object.freeze({
  enabled: false,
  targets: Object.freeze(allTargets(false)),
  version: 'none',
  video_url: '',
  webm_url: null,
  still_url: '',
  poster_url: '',
  duration_ms: DEFAULT_INTRO_DURATION_MS,
  is_custom: false,
})
/** The node intro routes (kinomap/node media-nginx.conf): /intro/<default|custom>/<version><suffix>. */
const NODE_INTRO_PATH = /^\/intro\/(?:default|custom)\/[0-9A-Za-z]{1,64}(?:\.mp4|\.webm|\.jpg|-still\.jpg|-poster\.jpg)$/
const TOKEN = /^[A-Za-z0-9._-]{1,4096}$/

/**
 * Only a Media Node intro URL is accepted: https, a real host other than this site (VPS 2 never
 * serves media), the node intro route and its signed `token`. Paths on this site are refused.
 */
export function safeIntroUrl(value: unknown, pageHost: string | null = currentHost()): string | null {
  if (typeof value !== 'string' || !value || !value.startsWith('https://')) return null
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
  if (pageHost && url.host.toLowerCase() === pageHost.toLowerCase()) return null
  if (!NODE_INTRO_PATH.test(url.pathname)) return null
  const token = url.searchParams.get('token')
  if (!token || !TOKEN.test(token) || [...url.searchParams.keys()].some((key) => key !== 'token')) return null
  return url.href
}

function currentHost(): string | null {
  try { return typeof location === 'undefined' ? null : location.host || null } catch { return null }
}

export function sanitizeIntroConfig(raw: unknown): IntroConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.enabled !== 'boolean') return null
  const targets = normalizeTargets(data.targets, data.enabled)
  const playsSomewhere = Object.values(targets).some(Boolean)
  if (!data.enabled && !playsSomewhere) return { ...NO_INTRO, targets, version: typeof data.version === 'string' ? data.version.slice(0, 64) : NO_INTRO.version }
  const video = safeIntroUrl(data.video_url)
  const still = safeIntroUrl(data.still_url)
  if (!video || !still) return null
  return {
    enabled: playsSomewhere,
    targets,
    version: typeof data.version === 'string' ? data.version.slice(0, 64) : 'unknown',
    video_url: video,
    webm_url: safeIntroUrl(data.webm_url),
    still_url: still,
    poster_url: safeIntroUrl(data.poster_url) ?? still,
    duration_ms: typeof data.duration_ms === 'number' && data.duration_ms > 0 ? data.duration_ms : DEFAULT_INTRO_DURATION_MS,
    is_custom: data.is_custom === true,
  }
}

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null }
}

function readCached(now = Date.now()): { config: IntroConfig; fresh: boolean } | null {
  try {
    const raw = storage()?.getItem(INTRO_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; config?: unknown }
    const config = sanitizeIntroConfig(parsed.config)
    if (!config) return null
    return { config, fresh: typeof parsed.at === 'number' && now - parsed.at < INTRO_CACHE_TTL_MS }
  } catch { return null }
}

/** The active intro, available synchronously (cached answer, or no intro until the server answers). */
export const introConfig = ref<IntroConfig>(readCached()?.config ?? { ...NO_INTRO })
let inflight: Promise<IntroConfig> | null = null

export function loadIntroConfig(options: { force?: boolean; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<IntroConfig> {
  const cached = readCached()
  if (cached?.fresh && !options.force) {
    introConfig.value = cached.config
    return Promise.resolve(cached.config)
  }
  if (inflight && !options.force) return inflight
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetcher) return Promise.resolve(introConfig.value)
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 3000) : undefined
  inflight = (async () => {
    try {
      const response = await fetcher(INTRO_ENDPOINT, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller?.signal })
      if (!response.ok) throw new Error(`intro ${response.status}`)
      const config = sanitizeIntroConfig(await response.json())
      if (!config) throw new Error('intro config rejected')
      introConfig.value = config
      try { storage()?.setItem(INTRO_CACHE_KEY, JSON.stringify({ at: Date.now(), config })) } catch { /* private mode */ }
      return config
    } catch {
      // Network/server problem: keep the last known answer, else no intro. Never block the film.
      introConfig.value = cached?.config ?? introConfig.value ?? { ...NO_INTRO }
      return introConfig.value
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      inflight = null
    }
  })()
  return inflight
}

export function introSources(config: IntroConfig): IntroSource[] {
  if (!config.video_url) return []
  const sources: IntroSource[] = []
  if (config.webm_url) sources.push({ src: config.webm_url, type: 'video/webm' })
  sources.push({ src: config.video_url, type: 'video/mp4' })
  return sources
}

/** Test helper: forget the cached answer. */
export function resetIntroConfigForTests() {
  inflight = null
  try { storage()?.removeItem(INTRO_CACHE_KEY) } catch { /* ignore */ }
  introConfig.value = { ...NO_INTRO }
}

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

/**
 * The film's sound comes in under the dissolving intro. The film warms up muted (muted autoplay
 * is never blocked, so it starts without a second click); here it turns audible from silence.
 */
export function fadeInFilm(media: HTMLMediaElement, ms = DISSOLVE_MS) {
  try { media.volume = 0 } catch { /* read-only volume (iOS) */ }
  media.muted = false
  return rampVolume(media, ms, fadeInCurve, 1)
}

/**
 * True once the film really shows moving pictures: it plays, has a picture size and its clock
 * advanced FIRST_FRAME_PROGRESS_S past where it started (a resume position or a seek back resets
 * the base). `canplay` never qualifies: it fires on the first container bytes, long before a
 * torrent stream has decoded frames.
 */
export function firstFrameWatcher(progress = FIRST_FRAME_PROGRESS_S) {
  let base: number | null = null
  return {
    reset() { base = null },
    check(video: HTMLVideoElement): boolean {
      if (video.paused || video.ended || !video.videoWidth || !video.videoHeight) return false
      if (base === null || video.currentTime < base) { base = video.currentTime; return false }
      return video.currentTime - base >= progress
    },
  }
}
