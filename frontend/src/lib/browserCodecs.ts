/**
 * What the browser can decode, as opposed to KINOSOTA Player (libmpv), which
 * plays every codec. Browsers only guarantee a baseline (H.264/AAC in MP4,
 * VP8/VP9/Opus in WebM) plus whatever the operating system adds, so a release
 * that names HEVC, AC-3, DTS… is checked against this very browser before the
 * viewer presses play, and the media element is watched for silent failures
 * (no picture / no sound) that it never reports as an error.
 */
import { reactive } from 'vue'

export type CodecKind = 'video' | 'audio'
export type CodecRisk = { label: string; kind: CodecKind }
export type SilentIssue = CodecKind
/** Why the player window shows the incompatibility notice (null: codecs named by the release). */
export type CompatibilityIssue = 'container' | 'codec' | 'pixel' | 'video' | 'audio' | null

type Hint = { re: RegExp; label: string; kind: CodecKind; mime: readonly string[]; audio?: string }

/**
 * MIME/codec strings that ask this browser about one audio codec, keyed by the short name the
 * backend stores for a container track (A_AC3 -> ac3). PCM and MPEG-1 Layer II have no reliable
 * question: they are never trusted in the browser (KINOSOTA Player plays them).
 */
const AUDIO_MIME: Readonly<Record<string, readonly string[]>> = {
  aac: ['audio/mp4; codecs="mp4a.40.2"'],
  mp3: ['audio/mpeg', 'audio/mp4; codecs="mp4a.69"', 'audio/mp4; codecs="mp4a.6B"'],
  opus: ['audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"'],
  vorbis: ['audio/webm; codecs="vorbis"', 'audio/ogg; codecs="vorbis"'],
  flac: ['audio/mp4; codecs="flac"', 'audio/flac'],
  ac3: ['audio/mp4; codecs="ac-3"'],
  eac3: ['audio/mp4; codecs="ec-3"'],
  dts: ['audio/mp4; codecs="dtsc"', 'audio/mp4; codecs="dtse"', 'audio/mp4; codecs="dtsx"'],
  truehd: ['audio/mp4; codecs="mlpa"'],
  pcm: [],
  mp2: [],
}

// Order matters: E-AC-3 is consumed before AC-3 so «E-AC-3» is not reported twice.
const HINTS: readonly Hint[] = [
  { re: /(?:^|[^a-z0-9])(?:hevc|[xh][ .]?265)(?![a-z0-9])/gi, label: 'HEVC (H.265)', kind: 'video', mime: ['video/mp4; codecs="hvc1.1.6.L120.90"', 'video/mp4; codecs="hev1.1.6.L120.90"'] },
  { re: /(?:^|[^a-z0-9])av1(?![a-z0-9])/gi, label: 'AV1', kind: 'video', mime: ['video/mp4; codecs="av01.0.08M.08"'] },
  { re: /(?:^|[^a-z0-9])vc-?1(?![a-z0-9])/gi, label: 'VC-1', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])mpeg-?2(?![a-z0-9])/gi, label: 'MPEG-2', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])(?:xvid|divx)(?![a-z0-9])/gi, label: 'XviD/DivX', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])(?:e-?ac-?3|ddp(?:[ .]?[257][ .]?[01])?|dd\+)(?![a-z0-9])/gi, label: 'Dolby Digital Plus (E-AC-3)', kind: 'audio', mime: [], audio: 'eac3' },
  { re: /(?:^|[^a-z0-9])(?:ac-?3|dd[ .]?[257][ .]?[01]|dolby digital)(?![a-z0-9])/gi, label: 'Dolby Digital (AC-3)', kind: 'audio', mime: [], audio: 'ac3' },
  { re: /(?:^|[^a-z0-9])dts(?![a-z])/gi, label: 'DTS', kind: 'audio', mime: [], audio: 'dts' },
  { re: /(?:^|[^a-z0-9])truehd(?![a-z0-9])/gi, label: 'Dolby TrueHD', kind: 'audio', mime: [], audio: 'truehd' },
]

/** True when this browser reports it can decode one of the MIME/codec strings. */
export function browserDecodes(mime: readonly string[]): boolean {
  const source = (globalThis as { MediaSource?: { isTypeSupported?: (type: string) => boolean } }).MediaSource
  let probe: HTMLVideoElement | null = null
  for (const type of mime) {
    try { if (source?.isTypeSupported?.(type)) return true } catch { /* engine without MSE */ }
    try {
      probe ??= typeof document === 'undefined' ? null : document.createElement('video')
      if (probe?.canPlayType(type) === 'probably') return true
    } catch { /* no media element */ }
  }
  return false
}

/** Codecs named in a release title that this browser cannot decode (empty: no known obstacle). */
export function unsupportedCodecs(name: string | null | undefined): CodecRisk[] {
  let rest = ` ${String(name || '').slice(0, 500)} `
  const found: CodecRisk[] = []
  for (const hint of HINTS) {
    hint.re.lastIndex = 0
    if (!hint.re.test(rest)) continue
    rest = rest.replace(hint.re, ' ')
    const decodes = hint.audio ? audioCodecPlayable(hint.audio) === true : browserDecodes(hint.mime)
    if (!decodes && !found.some((r) => r.label === hint.label)) found.push({ label: hint.label, kind: hint.kind })
  }
  return found
}

const userAgent = () => String((globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '')
function canPlay(type: string): boolean {
  try {
    const probe = typeof document === 'undefined' ? null : document.createElement('video')
    return !!probe && (probe.canPlayType(type) || '') !== ''
  } catch { return false }
}
/**
 * The <video> element of this browser demuxes a Matroska file. Chromium engines (Chrome, Edge,
 * Opera, Yandex, Android) do; Safari and every iOS browser (all WebKit) do not; Firefox only
 * in the versions that answer for video/x-matroska.
 */
export function matroskaPlayable(): boolean {
  const ua = userAgent()
  const webkitOnly = /iP(?:hone|ad|od)/.test(ua) || (/Safari\//.test(ua) && !/(?:Chrome|Chromium|CriOS|Edg|OPR|YaBrowser)\//.test(ua))
  if (!webkitOnly && !/Firefox\//.test(ua)) return true
  return canPlay('video/x-matroska') || canPlay('video/x-matroska; codecs="avc1.640028, mp4a.40.2"')
}
/** File formats no browser <video> element plays progressively. */
const NO_BROWSER_CONTAINER = new Set(['avi', 'wmv', 'flv', 'vob', 'mpg', 'mpeg', 'ts', 'm2ts', 'mts'])
/**
 * The file this release streams (its name ends the release name) is in a format this browser
 * cannot open at all: then no track sounds in the browser, whatever its codec.
 */
export function containerRisk(name: string | null | undefined): CodecRisk | null {
  const m = /\.([a-z0-9]{2,5})\s*$/i.exec(String(name || '').slice(-400))
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'mkv' || ext === 'mk3d') return matroskaPlayable() ? null : { label: 'формат файла MKV (Matroska)', kind: 'video' }
  if (NO_BROWSER_CONTAINER.has(ext)) return { label: `формат файла ${ext.toUpperCase()}`, kind: 'video' }
  return null
}

type MediaExtras = HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean }

/** Picture missing although metadata arrived: the video track could not be decoded. */
export function missingPicture(video: HTMLVideoElement): boolean {
  return video.readyState >= 1 && video.videoWidth === 0 && video.videoHeight === 0
}

/**
 * Sound missing while the video plays: the audio track could not be decoded
 * (Chromium/Safari count decoded audio bytes, Firefox reports mozHasAudio).
 * Engines exposing neither are never accused.
 */
export function missingSound(video: HTMLVideoElement): boolean {
  const media = video as MediaExtras
  if (media.paused) return false
  if (typeof media.mozHasAudio === 'boolean') return !media.mozHasAudio
  if (typeof media.webkitAudioDecodedByteCount === 'number') return media.webkitAudioDecodedByteCount === 0
  return false
}

/**
 * Asks missingSound once, after `seconds` of real playback (a resume position or
 * a seek restarts the count, so a fresh decoder is never mistaken for a silent one).
 */
export function soundWatcher(seconds = 4) {
  let base: number | null = null
  let done = false
  return {
    reset() { base = null; done = false },
    /** Stop asking for this source (the viewer chose to continue as is). */
    finish() { done = true },
    /** True exactly once when the sound is missing. */
    check(video: HTMLVideoElement): boolean {
      if (done || video.paused) return false
      if (base === null || video.currentTime < base) { base = video.currentTime; return false }
      if (video.currentTime - base < seconds) return false
      done = true
      return missingSound(video)
    },
  }
}

/**
 * Audio codecs every browser that opens the file plays with sound: AAC and MP3 (Opus / Vorbis
 * too). Every other codec (AC-3, E-AC-3, FLAC, DTS…) is asked of this very browser —
 * MediaSource.isTypeSupported, HTMLMediaElement.canPlayType and MediaCapabilities: Edge, Safari
 * and Chrome with the system Dolby decoder play AC-3 / E-AC-3, the others drop it.
 */
const BROWSER_AUDIO: ReadonlySet<string> = new Set(['aac', 'mp3', 'opus', 'vorbis'])
/** Codecs MediaCapabilities.decodingInfo confirmed for this browser (filled once per tab). */
const confirmedAudio = reactive(new Set<string>())
/** Codecs this tab already heard play silently: never trusted again, whatever the browser claims. */
const silentAudio = reactive(new Set<string>())
let capabilityProbe: Promise<void> | null = null

type DecodingInfo = { supported?: boolean }
type Capabilities = { decodingInfo?: (config: unknown) => Promise<DecodingInfo> }
/** Asks MediaCapabilities once per tab about every non-baseline audio codec (5.1, 48 kHz). */
export function probeAudioCodecs(): Promise<void> {
  if (capabilityProbe) return capabilityProbe
  const caps = (globalThis as { navigator?: { mediaCapabilities?: Capabilities } }).navigator?.mediaCapabilities
  if (!caps?.decodingInfo) return (capabilityProbe = Promise.resolve())
  const ask = async (codec: string, types: readonly string[]) => {
    for (const contentType of types) {
      try {
        const info = await caps.decodingInfo!({ type: 'file', audio: { contentType, channels: '6', bitrate: 640000, samplerate: 48000 } })
        if (info?.supported) { confirmedAudio.add(codec); return }
      } catch { /* malformed for this engine */ }
    }
  }
  capabilityProbe = Promise.all(Object.entries(AUDIO_MIME).filter(([c]) => !BROWSER_AUDIO.has(c)).map(([c, t]) => ask(c, t))).then(() => undefined)
  return capabilityProbe
}
/** Tests: forget what this tab learned. */
export function resetAudioCodecKnowledge(): void {
  confirmedAudio.clear()
  silentAudio.clear()
  capabilityProbe = null
}
/** The browser played a track of this codec without sound: it never gets the browser badge again in this tab. */
export function markCodecSilent(codec: string | null | undefined): void {
  const c = String(codec ?? '').trim().toLowerCase()
  if (c && !BROWSER_AUDIO.has(c)) silentAudio.add(c)
}
const AUDIO_LABELS: Readonly<Record<string, string>> = {
  ac3: 'Dolby Digital (AC-3)', eac3: 'Dolby Digital Plus (E-AC-3)', dts: 'DTS', truehd: 'Dolby TrueHD',
  flac: 'FLAC', pcm: 'PCM', mp2: 'MPEG Audio Layer II',
}
/** true: this browser plays this container audio codec with sound; false: it does not; null: codec unknown. */
export function audioCodecPlayable(codec: string | null | undefined): boolean | null {
  const c = String(codec ?? '').trim().toLowerCase()
  if (!c) return null
  if (BROWSER_AUDIO.has(c)) return true
  if (silentAudio.has(c)) return false
  if (confirmedAudio.has(c)) return true
  void probeAudioCodecs()
  return browserDecodes(AUDIO_MIME[c] ?? [])
}
/** «Dolby Digital (AC-3)» for ac3; the codec itself in upper case otherwise. */
export function audioCodecLabel(codec: string | null | undefined): string {
  const c = String(codec ?? '').trim().toLowerCase()
  return AUDIO_LABELS[c] ?? c.toUpperCase()
}

/** Human list: «HEVC (H.265) и DTS». */
export function codecList(risks: readonly CodecRisk[]): string {
  const labels = risks.map((r) => r.label)
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} и ${labels[labels.length - 1]}`
}
