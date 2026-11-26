import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TIZEN_DISPLAY_GRID,
  createTizenAvplayAdapter,
  normalizeTvMediaUrl,
  registerTizenMediaKeys,
  releaseVideoElement,
  toAbsoluteMediaUrl,
} from '@/views/tv/tvNativePlayer'
import {
  handleTvDebugKey,
  installTvDebugConsole,
  isTvDebugOpen,
  tvDebugFatal,
  tvDebugLines,
  tvDebugLog,
} from '@/views/tv/tvDebugConsole'

type Win = Window & { tizen?: unknown; webapis?: unknown }

describe('TV player factory helpers', () => {
  afterEach(() => {
    delete (window as Win).tizen
    delete (window as Win).webapis
  })

  it('pins the Tizen display grid to 1920x1080', () => {
    expect(TIZEN_DISPLAY_GRID).toEqual({ width: 1920, height: 1080 })
  })

  it('plays https links to our own TV host over http on an HTTP page, leaves others alone', () => {
    expect(normalizeTvMediaUrl('https://watch.scenrix.com/media/posters/a.jpg?v=2')).toBe('http://watch.scenrix.com/media/posters/a.jpg?v=2')
    expect(normalizeTvMediaUrl('https://cdn.example.com/a.mp4')).toBe('https://cdn.example.com/a.mp4')
    expect(normalizeTvMediaUrl('/media/m1.mp4')).toBe('/media/m1.mp4')
    expect(toAbsoluteMediaUrl('https://watch.scenrix.com/media/posters/a.jpg')).toBe('http://watch.scenrix.com/media/posters/a.jpg')
  })

  it('never downgrades a Media Node: films, ads and the intro stay https:// (port 80 on the nodes is closed)', () => {
    for (const url of [
      'https://tg-node-1.scenrix.com/stream/abc?token=t',
      'https://torrent-node-2.scenrix.com/stream/x/0?token=t',
      'https://node-3.scenrix.com/ads/creative.mp4?token=t',
      'https://tg-node-1.scenrix.com/intro/default/v1.mp4?token=t',
    ]) {
      expect(normalizeTvMediaUrl(url)).toBe(url)
      expect(toAbsoluteMediaUrl(url)).toBe(url)
    }
  })

  it('registers the media key pack with registerKeyBatch and falls back to registerKey on Tizen 2.x–3.x', () => {
    const batch = vi.fn()
    const single = vi.fn()
    ;(window as Win).tizen = { tvinputdevice: { registerKeyBatch: batch, registerKey: single } }
    expect(registerTizenMediaKeys()).toBe('batch')
    expect(batch.mock.calls[0][0]).toEqual(['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'Return', 'Exit'])

    const old = vi.fn()
    ;(window as Win).tizen = { tvinputdevice: { registerKey: old } }
    expect(registerTizenMediaKeys()).toBe('single')
    expect(old.mock.calls.map(c => c[0])).toContain('MediaPlayPause')
    expect(old.mock.calls.map(c => c[0])).toContain('Return')

    delete (window as Win).tizen
    expect(registerTizenMediaKeys()).toBe('none')
  })

  it('frees a <video> decoder slot', () => {
    const video = document.createElement('video')
    video.setAttribute('src', '/media/intro.mp4')
    video.pause = vi.fn()
    video.load = vi.fn()
    releaseVideoElement(video)
    expect(video.getAttribute('src')).toBeNull()
    expect(video.load).toHaveBeenCalled()
  })

  it('exposes the PlayerAdapter contract over Tizen AVPlay and closes the previous clip on open()', () => {
    const calls: string[] = []
    ;(window as Win).webapis = {
      avplay: {
        open: (u: string) => calls.push(`open:${u}`),
        close: () => calls.push('close'),
        stop: () => calls.push('stop'),
        play: () => calls.push('play'),
        pause: () => calls.push('pause'),
        seekTo: (ms: number) => calls.push(`seek:${ms}`),
        getState: () => 'PLAYING',
        getCurrentTime: () => 0,
        getDuration: () => 0,
        setDisplayRect: (...a: number[]) => calls.push(`rect:${a.join(',')}`),
        setDisplayMethod: () => {},
        setListener: () => {},
        prepareAsync: (ok: () => void) => { calls.push('prepareAsync'); ok() },
        getTotalTrackInfo: () => [],
        setSelectTrack: () => {},
      },
    }
    const adapter = createTizenAvplayAdapter({
      onCanPlay: () => {}, onPlaying: () => {}, onWaiting: () => {}, onTimeUpdate: () => {},
      onTracksChanged: () => {}, onEnded: () => {}, onError: () => {},
    })
    expect(adapter).not.toBeNull()
    expect(adapter!.engine).toBe('Tizen AVPlay')
    expect(adapter!.open('https://tg-node-1.scenrix.com/ads/ad.mp4?token=a1')).toBe(true)
    expect(calls).toContain('rect:0,0,1920,1080')
    calls.length = 0
    adapter!.open('https://tg-node-1.scenrix.com/stream/film?token=f1')
    expect(calls.indexOf('stop')).toBeGreaterThan(-1)
    expect(calls.indexOf('stop')).toBeLessThan(calls.indexOf('open:https://tg-node-1.scenrix.com/stream/film?token=f1'))
    expect(adapter!.getTracks()).toEqual({ audio: [], text: [{ index: -1, label: 'Выкл', active: true }] })
    adapter!.stop()
    expect(calls).toContain('close')
  })
})

describe('/tv on-screen debug console', () => {
  let dispose: () => void = () => {}
  beforeEach(() => { dispose = installTvDebugConsole() })
  afterEach(() => { dispose() })

  const key = (keyCode: number) => handleTvDebugKey(new KeyboardEvent('keydown', { keyCode } as KeyboardEventInit))

  it('logs the environment and console output', () => {
    tvDebugLog('info', 'factory', { engine: 'Tizen AVPlay' })
    const text = tvDebugLines().join('\n')
    expect(text).toContain('UA:')
    expect(text).toContain('factory {"engine":"Tizen AVPlay"}')
  })

  it('toggles with Info and with three Red presses', () => {
    expect(isTvDebugOpen()).toBe(false)
    expect(key(457)).toBe(true)
    expect(isTvDebugOpen()).toBe(true)
    expect(document.querySelector('[data-testid="tv-debug-console"]')?.textContent).toContain('UA:')
    key(457)
    expect(isTvDebugOpen()).toBe(false)
    key(403); key(403)
    expect(isTvDebugOpen()).toBe(false)
    key(403)
    expect(isTvDebugOpen()).toBe(true)
    expect(key(13)).toBe(false)
  })

  it('opens by itself on a fatal playback error on a TV only', () => {
    tvDebugFatal('boom')
    expect(isTvDebugOpen()).toBe(false)
    const ua = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) Chrome/94.0 TV' })
    try {
      tvDebugFatal('decoder failed')
      expect(isTvDebugOpen()).toBe(true)
      expect(tvDebugLines().join('\n')).toContain('decoder failed')
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
    }
  })
})
