/**
 * Hand a server-issued launch over to KINOSOTA Player via the kinosota:// scheme.
 *
 * Browsers do not tell a page whether a custom-scheme handler exists, so the
 * site asks the backend whether the desktop app redeemed the launch. No
 * credentials ever travel in the link: it only carries a short-lived launch id
 * that the app redeems with its own signed-in session.
 */
import { torrentPlaybackApi } from '@/api/torrents'

/** Exact wording requested for the "player is not installed" dialog. */
export const DESKTOP_PLAYER_TEXT = 'Для просмотра фильмов в максимальном качестве и со всеми аудиодорожками скачайте и установите приложение KINOSOTA Player. Плеер уже доступен для скачивания в вашем Профиле'

export const DEEP_LINK_RE = /^kinosota:\/\/watch\?launch=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Chromium keeps the page when no handler exists; Firefox/Safari would show an error page, so use a frame. */
export function openDeepLink(url: string): void {
  if (!DEEP_LINK_RE.test(url)) throw new Error('Unexpected launch link')
  const chromium = /\b(Chrome|Chromium|Edg|OPR|YaBrowser)\//.test(navigator.userAgent)
  if (chromium) {
    window.location.href = url
    return
  }
  const frame = document.createElement('iframe')
  frame.style.display = 'none'
  frame.setAttribute('aria-hidden', 'true')
  frame.src = url
  document.body.appendChild(frame)
  setTimeout(() => frame.remove(), 5000)
}

export type WaitOptions = { signal?: AbortSignal; quietMs?: number; focusLostMs?: number; intervalMs?: number }

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

/**
 * Resolves true once KINOSOTA Player redeemed the launch. Without any sign of
 * an external app (the page kept focus) the answer is "not installed" after
 * `quietMs`; when focus moved away (browser prompt / app window) we wait longer.
 */
export async function waitForPlayer(launchId: string, options: WaitOptions = {}): Promise<boolean> {
  const { signal, quietMs = 7000, focusLostMs = 30000, intervalMs = 1000 } = options
  let focusLost = false
  const lost = () => { focusLost = true }
  const hidden = () => { if (document.visibilityState === 'hidden') focusLost = true }
  window.addEventListener('blur', lost)
  window.addEventListener('pagehide', lost)
  document.addEventListener('visibilitychange', hidden)
  const started = Date.now()
  try {
    while (!signal?.aborted) {
      await sleep(intervalMs, signal)
      if (signal?.aborted) break
      try {
        const state = await torrentPlaybackApi.launchStatus(launchId, signal)
        if (state.opened) return true
        if (state.expired) return false
      } catch { /* transient network error: keep waiting until the deadline */ }
      if (Date.now() - started >= (focusLost ? focusLostMs : quietMs)) return false
    }
    return false
  } finally {
    window.removeEventListener('blur', lost)
    window.removeEventListener('pagehide', lost)
    document.removeEventListener('visibilitychange', hidden)
  }
}
