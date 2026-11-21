/**
 * Spotlight hero of the TV layer: the same server rotation as the «Торренты» banner
 * (TorrentCatalogView). The server picks the title and says when the next one is due
 * (`refresh_at`); the TV refreshes then, never later than every 4 hours.
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { torrentsApi, type TorrentItem } from '@/api/torrents'

export const SPOTLIGHT_MAX_DELAY_MS = 4 * 3600 * 1000
export const SPOTLIGHT_MIN_DELAY_MS = 1000
export const SPOTLIGHT_RETRY_DELAY_MS = 60_000

/** Delay until the next hero refresh, clamped to [1 s, 4 h]; a missing/invalid `refresh_at` waits the full 4 h. */
export function spotlightDelay(refreshAt: string | null | undefined, now = Date.now()): number {
  const delay = Date.parse(refreshAt || '') - now
  if (!Number.isFinite(delay)) return SPOTLIGHT_MAX_DELAY_MS
  return Math.max(SPOTLIGHT_MIN_DELAY_MS, Math.min(delay, SPOTLIGHT_MAX_DELAY_MS))
}

export function useTvSpotlight() {
  const hero = ref<TorrentItem | null>(null)
  const loading = ref(true)
  const failed = ref(false)
  const controller = new AbortController()
  let heroTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  function schedule(delay: number) {
    clearTimeout(heroTimer)
    heroTimer = setTimeout(() => { void refreshHero() }, delay)
  }

  async function refreshHero() {
    if (stopped) return
    clearTimeout(heroTimer)
    try {
      const result = await torrentsApi.list({ kind: 'movie', collection: 'spotlight' }, controller.signal)
      if (stopped) return
      hero.value = result.items[0] ?? null
      failed.value = false
      schedule(spotlightDelay(result.refresh_at))
    } catch {
      if (stopped || controller.signal.aborted) return
      // Keep the current banner on screen and try again in a minute.
      failed.value = true
      schedule(SPOTLIGHT_RETRY_DELAY_MS)
    } finally {
      if (!stopped) loading.value = false
    }
  }

  function stop() {
    stopped = true
    controller.abort()
    clearTimeout(heroTimer)
  }

  if (getCurrentInstance()) onBeforeUnmount(stop)

  return { hero, loading, failed, refreshHero, stop }
}
