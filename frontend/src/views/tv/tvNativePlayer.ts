/**
 * Native Smart TV hardware player adapter for /tv/player (Samsung Tizen AVPlay).
 * On Tizen 5+ TVs, webapis.avplay decodes MKV, AC-3, E-AC-3, DTS and multi-audio
 * tracks directly in hardware, while LG webOS / modern browsers use <video>.
 */

export interface NativeTrackOption {
  index: number
  label: string
  active: boolean
}

export interface NativePlayerCallbacks {
  onCanPlay: () => void
  onPlaying: () => void
  onWaiting: () => void
  onTimeUpdate: (currentSec: number, durationSec: number) => void
  onTracksChanged: (audioTracks: NativeTrackOption[], subtitleTracks: NativeTrackOption[]) => void
  onEnded: () => void
  onError: () => void
}

export interface NativePlayerController {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  isPaused: () => boolean
  getAudioTracks: () => NativeTrackOption[]
  selectAudioTrack: (listIndex: number) => void
  getSubtitleTracks: () => NativeTrackOption[]
  selectSubtitleTrack: (listIndex: number) => void
  destroy: () => void
}

interface AvplayTrackInfo {
  index: string | number
  type: 'VIDEO' | 'AUDIO' | 'TEXT' | string
  extra_info?: string
}

interface TizenAvplayApi {
  open: (url: string) => void
  close: () => void
  prepareAsync: (onSuccess: () => void, onError: (err: unknown) => void) => void
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (ms: number, onSuccess?: () => void, onError?: () => void) => void
  getState: () => string
  getCurrentTime: () => number
  getDuration: () => number
  setDisplayRect: (x: number, y: number, w: number, h: number) => void
  setDisplayMethod: (method: string) => void
  setSilentSubtitle?: (silent: boolean) => void
  setListener: (listener: Record<string, (...args: unknown[]) => void>) => void
  getTotalTrackInfo?: () => AvplayTrackInfo[]
  getCurrentStreamInfo?: () => AvplayTrackInfo[]
  setSelectTrack?: (type: 'AUDIO' | 'TEXT', index: number) => void
}

type TizenWindow = Window & {
  tizen?: unknown
  webapis?: { avplay?: TizenAvplayApi }
}

let webapisLoadPromise: Promise<boolean> | null = null

export function toAbsoluteMediaUrl(url: string): string {
  if (!url) return ''
  if (typeof window === 'undefined' || !window.location) return url
  const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const host = window.location.host
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `${proto}//${host}${url}`
  }
  try {
    const parsed = new URL(url)
    if (host && parsed.hostname === window.location.hostname && parsed.protocol !== proto) {
      return `${proto}//${host}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch { /* keep raw */ }
  return url
}

export function hasTizenAvplay(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as TizenWindow
  return Boolean(win.webapis?.avplay && typeof win.webapis.avplay.open === 'function')
}

export function loadTizenWebApis(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
  if (hasTizenAvplay()) return Promise.resolve(true)
  const win = window as TizenWindow
  const ua = (navigator.userAgent || '').toLowerCase()
  if (!ua.includes('tizen') && !win.tizen && !win.webapis) return Promise.resolve(false)
  if (webapisLoadPromise) return webapisLoadPromise
  webapisLoadPromise = new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(hasTizenAvplay())
    }
    const existing = document.querySelector('script[src*="$WEBAPIS/webapis/webapis.js"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener('error', finish, { once: true })
      setTimeout(finish, 1800)
      return
    }
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = '$WEBAPIS/webapis/webapis.js'
    script.onload = finish
    script.onerror = finish
    ;(document.head || document.body || document.documentElement).appendChild(script)
    setTimeout(finish, 2500)
  })
  return webapisLoadPromise
}

function parseExtra(raw?: string): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function createTizenAvplayController(
  streamUrl: string,
  callbacks: NativePlayerCallbacks,
): NativePlayerController | null {
  if (!hasTizenAvplay()) return null
  const avplay = (window as TizenWindow).webapis!.avplay!
  let destroyed = false
  let prepared = false
  let activeAudioIndex = 0
  let activeSubIndex = 0

  function refreshActiveIndices() {
    try {
      const current = avplay.getCurrentStreamInfo?.() ?? []
      for (const info of current) {
        if (info.type === 'AUDIO') activeAudioIndex = Number(info.index) || 0
        if (info.type === 'TEXT') activeSubIndex = Number(info.index) || 0
      }
    } catch { /* optional API */ }
  }

  function safeTimeSec(): number {
    if (destroyed || !prepared) return 0
    try { return Math.max(0, (avplay.getCurrentTime() || 0) / 1000) } catch { return 0 }
  }

  function safeDurationSec(): number {
    if (destroyed || !prepared) return 0
    try { return Math.max(0, (avplay.getDuration() || 0) / 1000) } catch { return 0 }
  }

  function listTracks(kind: 'AUDIO' | 'TEXT'): NativeTrackOption[] {
    if (destroyed || !prepared) return []
    try {
      const all = avplay.getTotalTrackInfo?.() ?? []
      const filtered = all.filter(item => item.type === kind)
      if (kind === 'AUDIO') {
        return filtered.map((item, i) => {
          const extra = parseExtra(item.extra_info)
          const idx = Number(item.index)
          const lang = (extra.language || '').trim().toUpperCase()
          const codec = (extra.codec || '').trim().toUpperCase()
          const detail = [lang, codec].filter(Boolean).join(' · ')
          return {
            index: idx,
            label: detail ? `Дорожка ${i + 1} (${detail})` : `Дорожка ${i + 1}`,
            active: idx === activeAudioIndex || (!activeAudioIndex && i === 0),
          }
        })
      }
      const subs: NativeTrackOption[] = [{ index: -1, label: 'Выкл', active: activeSubIndex <= 0 }]
      filtered.forEach((item, i) => {
        const extra = parseExtra(item.extra_info)
        const idx = Number(item.index)
        const lang = (extra.track_lang || extra.language || '').trim().toUpperCase()
        subs.push({
          index: idx,
          label: lang ? `Субтитры ${i + 1} (${lang})` : `Субтитры ${i + 1}`,
          active: idx === activeSubIndex,
        })
      })
      return subs
    } catch {
      return kind === 'TEXT' ? [{ index: -1, label: 'Выкл', active: true }] : []
    }
  }

  const controller: NativePlayerController = {
    play() {
      if (destroyed || !prepared) return
      try { avplay.play(); callbacks.onPlaying() } catch { /* ignored */ }
    },
    pause() {
      if (destroyed || !prepared) return
      try { avplay.pause() } catch { /* ignored */ }
    },
    seekTo(seconds: number) {
      if (destroyed || !prepared) return
      try {
        avplay.seekTo(Math.max(0, Math.round(seconds * 1000)))
        callbacks.onTimeUpdate(safeTimeSec(), safeDurationSec())
      } catch { /* ignored */ }
    },
    getCurrentTime: safeTimeSec,
    getDuration: safeDurationSec,
    isPaused() {
      if (destroyed || !prepared) return true
      try { return avplay.getState() === 'PAUSED' } catch { return false }
    },
    getAudioTracks: () => listTracks('AUDIO'),
    selectAudioTrack(listIndex: number) {
      const tracks = listTracks('AUDIO')
      const picked = tracks[listIndex]
      if (!picked || destroyed || !prepared) return
      try {
        avplay.setSelectTrack?.('AUDIO', picked.index)
        activeAudioIndex = picked.index
        callbacks.onTracksChanged(listTracks('AUDIO'), listTracks('TEXT'))
      } catch { /* ignored */ }
    },
    getSubtitleTracks: () => listTracks('TEXT'),
    selectSubtitleTrack(listIndex: number) {
      const subs = listTracks('TEXT')
      const picked = subs[listIndex]
      if (!picked || destroyed || !prepared) return
      try {
        if (picked.index < 0) {
          avplay.setSilentSubtitle?.(true)
          activeSubIndex = 0
        } else {
          avplay.setSilentSubtitle?.(false)
          avplay.setSelectTrack?.('TEXT', picked.index)
          activeSubIndex = picked.index
        }
        callbacks.onTracksChanged(listTracks('AUDIO'), listTracks('TEXT'))
      } catch { /* ignored */ }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      prepared = false
      try { avplay.stop() } catch { /* ignored */ }
      try { avplay.close() } catch { /* ignored */ }
    },
  }

  try {
    avplay.open(toAbsoluteMediaUrl(streamUrl))
    const width = window.innerWidth || 1920
    const height = window.innerHeight || 1080
    avplay.setDisplayRect(0, 0, width, height)
    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')
    try { avplay.setSilentSubtitle?.(false) } catch { /* optional */ }
    avplay.setListener({
      onbufferingstart() {
        if (!destroyed) callbacks.onWaiting()
      },
      onbufferingcomplete() {
        if (!destroyed) callbacks.onPlaying()
      },
      oncurrentplaytime() {
        if (!destroyed) callbacks.onTimeUpdate(safeTimeSec(), safeDurationSec())
      },
      onstreamcompleted() {
        if (destroyed) return
        try { avplay.stop() } catch { /* ignored */ }
        callbacks.onEnded()
      },
      onerror() {
        if (!destroyed) callbacks.onError()
      },
    })
    avplay.prepareAsync(() => {
      if (destroyed) return
      prepared = true
      refreshActiveIndices()
      callbacks.onCanPlay()
      callbacks.onTracksChanged(listTracks('AUDIO'), listTracks('TEXT'))
      try {
        avplay.play()
        callbacks.onPlaying()
      } catch {
        callbacks.onError()
      }
    }, () => {
      if (!destroyed) callbacks.onError()
    })
    return controller
  } catch {
    controller.destroy()
    return null
  }
}
