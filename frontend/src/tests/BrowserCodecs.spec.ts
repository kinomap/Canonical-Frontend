import { describe, it, expect, afterEach, vi } from 'vitest'
import { codecList, missingPicture, missingSound, soundWatcher, unsupportedCodecs } from '@/lib/browserCodecs'

const media = (fields: Record<string, unknown>) => fields as unknown as HTMLVideoElement
afterEach(() => vi.unstubAllGlobals())

describe('browser codec check for a release name', () => {
  it('names the codecs a baseline browser cannot decode, once each and in a stable order', () => {
    expect(unsupportedCodecs('Дюна / Dune (2021) BDRip 1080p | HEVC | D, A | DTS, AC3').map((r) => r.label))
      .toEqual(['HEVC (H.265)', 'Dolby Digital (AC-3)', 'DTS'])
    expect(unsupportedCodecs('Movie.2024.2160p.WEB-DL.x265.10bit.DDP5.1.Atmos').map((r) => r.label))
      .toEqual(['HEVC (H.265)', 'Dolby Digital Plus (E-AC-3)'])
    expect(unsupportedCodecs('Film 1080p H.265 E-AC-3 TrueHD 7.1').map((r) => r.label))
      .toEqual(['HEVC (H.265)', 'Dolby Digital Plus (E-AC-3)', 'Dolby TrueHD'])
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
