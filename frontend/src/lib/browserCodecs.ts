/**
 * What the browser can decode, as opposed to KINOSOTA Player (libmpv), which
 * plays every codec. Browsers only guarantee a baseline (H.264/AAC in MP4,
 * VP8/VP9/Opus in WebM) plus whatever the operating system adds, so a release
 * that names HEVC, AC-3, DTS… is checked against this very browser before the
 * viewer presses play, and the media element is watched for silent failures
 * (no picture / no sound) that it never reports as an error.
 */
export type CodecKind = 'video' | 'audio'
export type CodecRisk = { label: string; kind: CodecKind }
export type SilentIssue = CodecKind
/** Why the player window shows the incompatibility notice (null: codecs named by the release). */
export type CompatibilityIssue = 'container' | 'codec' | 'pixel' | 'video' | 'audio' | null

type Hint = { re: RegExp; label: string; kind: CodecKind; mime: readonly string[] }

// Order matters: E-AC-3 is consumed before AC-3 so «E-AC-3» is not reported twice.
const HINTS: readonly Hint[] = [
  { re: /(?:^|[^a-z0-9])(?:hevc|[xh][ .]?265)(?![a-z0-9])/gi, label: 'HEVC (H.265)', kind: 'video', mime: ['video/mp4; codecs="hvc1.1.6.L120.90"', 'video/mp4; codecs="hev1.1.6.L120.90"'] },
  { re: /(?:^|[^a-z0-9])av1(?![a-z0-9])/gi, label: 'AV1', kind: 'video', mime: ['video/mp4; codecs="av01.0.08M.08"'] },
  { re: /(?:^|[^a-z0-9])vc-?1(?![a-z0-9])/gi, label: 'VC-1', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])mpeg-?2(?![a-z0-9])/gi, label: 'MPEG-2', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])(?:xvid|divx)(?![a-z0-9])/gi, label: 'XviD/DivX', kind: 'video', mime: [] },
  { re: /(?:^|[^a-z0-9])(?:e-?ac-?3|ddp(?:[ .]?[257][ .]?[01])?|dd\+)(?![a-z0-9])/gi, label: 'Dolby Digital Plus (E-AC-3)', kind: 'audio', mime: ['audio/mp4; codecs="ec-3"'] },
  { re: /(?:^|[^a-z0-9])(?:ac-?3|dd[ .]?[257][ .]?[01]|dolby digital)(?![a-z0-9])/gi, label: 'Dolby Digital (AC-3)', kind: 'audio', mime: ['audio/mp4; codecs="ac-3"'] },
  { re: /(?:^|[^a-z0-9])dts(?![a-z])/gi, label: 'DTS', kind: 'audio', mime: [] },
  { re: /(?:^|[^a-z0-9])truehd(?![a-z0-9])/gi, label: 'Dolby TrueHD', kind: 'audio', mime: [] },
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
    if (!browserDecodes(hint.mime) && !found.some((r) => r.label === hint.label)) found.push({ label: hint.label, kind: hint.kind })
  }
  return found
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

/** Human list: «HEVC (H.265) и DTS». */
export function codecList(risks: readonly CodecRisk[]): string {
  const labels = risks.map((r) => r.label)
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} и ${labels[labels.length - 1]}`
}
