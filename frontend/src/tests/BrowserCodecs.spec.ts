import { describe, it, expect, afterEach, vi } from 'vitest'
import { audioCodecPlayable, browserDecodes, codecList, desktopBrowser, markCodecSilent, missingPicture, missingSound, resetAudioCodecKnowledge, soundWatcher, unsupportedCodecs } from '@/lib/browserCodecs'

const media = (fields: Record<string, unknown>) => fields as unknown as HTMLVideoElement
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetAudioCodecKnowledge() })

describe('canPlayType answers', () => {
  const answer = (fn: (type: string) => CanPlayTypeResult) => vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(fn)

  it('accepts «maybe» as well as «probably» (Chrome, Edge, Safari answer «maybe» for Dolby)', () => {
    answer((type) => (type.includes('ac-3') || type.includes('ec-3') ? 'maybe' : ''))
    expect(browserDecodes(['audio/mp4; codecs="ac-3"'])).toBe(true)
    expect(browserDecodes(['audio/mp4; codecs="ec-3"'])).toBe(true)
    expect(audioCodecPlayable('ac3')).toBe(true)
    expect(audioCodecPlayable('eac3')).toBe(true)
    expect(audioCodecPlayable('dts')).toBe(false)
    expect(unsupportedCodecs('Movie 1080p WEB-DL DDP5.1 AC3 DTS').map((r) => r.label)).toEqual(['DTS'])
  })

  it('accepts «probably» and rejects the empty answer', () => {
    answer((type) => (type.includes('ac-3') ? 'probably' : ''))
    expect(browserDecodes(['audio/mp4; codecs="ac-3"'])).toBe(true)
    expect(browserDecodes(['audio/mp4; codecs="ec-3"'])).toBe(false)
    expect(browserDecodes([])).toBe(false)
  })
})

describe('Dolby Digital (AC-3 / E-AC-3) in the MKV stream of a desktop browser', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

  it('is supported by default although the synthetic MP4 question answers «»', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_CHROME })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => '')
    expect(desktopBrowser()).toBe(true)
    expect(browserDecodes(['audio/mp4; codecs="ac-3"'])).toBe(false)
    expect(audioCodecPlayable('ac3')).toBe(true)
    expect(audioCodecPlayable('eac3')).toBe(true)
    expect(audioCodecPlayable('aac')).toBe(true)
    expect(audioCodecPlayable('mp3')).toBe(true)
    expect(audioCodecPlayable('opus')).toBe(true)
    expect(audioCodecPlayable('vorbis')).toBe(true)
  })

  it('loses the support only after soundWatcher heard it play silently in this tab', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_CHROME })
    expect(audioCodecPlayable('ac3')).toBe(true)
    markCodecSilent('ac3')
    expect(audioCodecPlayable('ac3')).toBe(false)
    expect(audioCodecPlayable('eac3')).toBe(true)
    // The baseline is never revoked: a silent AAC stream is a broken file, not a missing decoder.
    markCodecSilent('aac')
    expect(audioCodecPlayable('aac')).toBe(true)
    resetAudioCodecKnowledge()
    expect(audioCodecPlayable('ac3')).toBe(true)
  })

  it('DTS, TrueHD and FLAC are asked of the browser itself, never assumed', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_CHROME })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => '')
    expect(audioCodecPlayable('dts')).toBe(false)
    expect(audioCodecPlayable('truehd')).toBe(false)
    expect(audioCodecPlayable('flac')).toBe(false)
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockImplementation((type: string) => (type.includes('flac') ? 'maybe' : ''))
    expect(audioCodecPlayable('flac')).toBe(true)
    expect(audioCodecPlayable('dts')).toBe(false)
  })

  it('a phone or tablet is asked like every other codec', () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => '')
    expect(desktopBrowser()).toBe(false)
    expect(audioCodecPlayable('ac3')).toBe(false)
    expect(audioCodecPlayable('aac')).toBe(true)
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockImplementation((type: string) => (type.includes('ac-3') ? 'maybe' : ''))
    expect(audioCodecPlayable('ac3')).toBe(true)
  })

  it('the Dolby names in a release title are no obstacle on a desktop browser', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_CHROME })
    expect(unsupportedCodecs('Heart of the Beast (2026) WEB-DL 1080p | AVC | AC3 5.1, DDP5.1')).toEqual([])
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    expect(unsupportedCodecs('Heart of the Beast (2026) WEB-DL 1080p | AVC | AC3 5.1').map((r) => r.label)).toEqual(['Dolby Digital (AC-3)'])
  })
})

describe('browser codec check for a release name', () => {
  it('names the codecs a baseline browser cannot decode, once each and in a stable order', () => {
    expect(unsupportedCodecs('Дюна / Dune (2021) BDRip 1080p | HEVC | D, A | DTS, AC3').map((r) => r.label))
      .toEqual(['HEVC (H.265)', 'DTS'])
    expect(unsupportedCodecs('Movie.2024.2160p.WEB-DL.x265.10bit.DDP5.1.Atmos').map((r) => r.label))
      .toEqual(['HEVC (H.265)'])
    expect(unsupportedCodecs('Film 1080p H.265 E-AC-3 TrueHD 7.1').map((r) => r.label))
      .toEqual(['HEVC (H.265)', 'Dolby TrueHD'])
    expect(unsupportedCodecs('Old.Film.1999.DVDRip.XviD.MP3').map((r) => r.kind)).toEqual(['video'])
  })

  it('stays quiet for the browser baseline and for words that merely contain the letters', () => {
    expect(unsupportedCodecs('Фильм (2020) WEB-DL 1080p | AVC | AAC 2.0')).toEqual([])
    expect(unsupportedCodecs('The Shadows (2019) WEBRip 720p | AAC')).toEqual([])
    expect(unsupportedCodecs('')).toEqual([])
    expect(unsupportedCodecs(undefined)).toEqual([])
  })

  it('trusts this very browser: a codec it reports as playable is not a risk', () => {
    vi.stubGlobal('MediaSource', { isTypeSupported: (type: string) => type.includes('hvc1') || type.includes('ac-3') })
    expect(unsupportedCodecs('Movie 2160p HEVC AC3 DTS').map((r) => r.label)).toEqual(['DTS'])
  })

  it('joins the labels for the notice', () => {
    expect(codecList([])).toBe('')
    expect(codecList([{ label: 'DTS', kind: 'audio' }])).toBe('DTS')
    expect(codecList([{ label: 'A', kind: 'video' }, { label: 'B', kind: 'audio' }, { label: 'C', kind: 'audio' }])).toBe('A, B и C')
  })
})

describe('silent playback failures', () => {
  it('detects a missing picture only once metadata is known', () => {
    expect(missingPicture(media({ readyState: 1, videoWidth: 0, videoHeight: 0 }))).toBe(true)
    expect(missingPicture(media({ readyState: 0, videoWidth: 0, videoHeight: 0 }))).toBe(false)
    expect(missingPicture(media({ readyState: 4, videoWidth: 1920, videoHeight: 800 }))).toBe(false)
  })

  it('detects missing sound from the engine counters and never accuses engines without them', () => {
    expect(missingSound(media({ paused: false, webkitAudioDecodedByteCount: 0 }))).toBe(true)
    expect(missingSound(media({ paused: false, webkitAudioDecodedByteCount: 4096 }))).toBe(false)
    expect(missingSound(media({ paused: false, mozHasAudio: false }))).toBe(true)
    expect(missingSound(media({ paused: false, mozHasAudio: true }))).toBe(false)
    expect(missingSound(media({ paused: true, webkitAudioDecodedByteCount: 0 }))).toBe(false)
    expect(missingSound(media({ paused: false }))).toBe(false)
  })

  it('asks once, after seconds of real playback counted from where playback started', () => {
    const watcher = soundWatcher(4)
    const video = { paused: false, currentTime: 1200, webkitAudioDecodedByteCount: 0 }
    expect(watcher.check(media(video))).toBe(false) // resume position: the count starts here
    video.currentTime = 1203
    expect(watcher.check(media(video))).toBe(false)
    video.currentTime = 1204.5
    expect(watcher.check(media(video))).toBe(true)
    video.currentTime = 1300
    expect(watcher.check(media(video))).toBe(false)
    watcher.reset()
    video.currentTime = 10
    expect(watcher.check(media(video))).toBe(false)
    watcher.finish()
    video.currentTime = 20
    expect(watcher.check(media(video))).toBe(false)
  })
})
