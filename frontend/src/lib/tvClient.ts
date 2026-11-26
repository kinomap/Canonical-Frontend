/**
 * Detects whether the app is currently running inside a Smart TV portal context
 * (/tv* on Tizen, webOS, Orsay, NetCast or Android Smart TV). Playback requests then send
 * `tv: true`, which only selects TV error codes (409 TV_MEDIA_UNSUPPORTED, no Desktop Player
 * advice). It never changes where media comes from: every client streams directly from the
 * Media Node (https://<node>/...), and it never caps the resolution (4K TVs keep 2160p).
 */
export function isSmartTvClient(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (!window.location.pathname.startsWith('/tv')) return false
  return /tizen|webos|web0s|maple|netcast|smarttv|smart-tv/i.test(navigator.userAgent || '')
}
