/**
 * Detects whether the app is currently running inside a Smart TV portal context
 * (/tv* on Tizen, webOS, Orsay, NetCast or Android Smart TV), so media and ad requests
 * ask the backend for same-origin /tv-stream and /tv-ad relay URLs.
 */
export function isSmartTvClient(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (!window.location.pathname.startsWith('/tv')) return false
  return /tizen|webos|web0s|maple|netcast|smarttv|smart-tv/i.test(navigator.userAgent || '')
}
