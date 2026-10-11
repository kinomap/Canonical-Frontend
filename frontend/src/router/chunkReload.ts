// Recovery from stale lazy-route chunks after a redeploy.
//
// Lazy routes (e.g. /series) are separate hashed chunks. A browser that still runs
// the previous build asks for a chunk that no longer exists; the import fails and
// Vue Router aborts the navigation, so the click "does nothing". We turn that into
// one full page load of the target URL, which fetches the current index.html and
// chunk names. A short-lived guard prevents reload loops: if the same target
// fails again right after the reload, the error is left to surface normally.

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Expected a JavaScript(-or-Wasm)? module script/i,
  /Unable to preload CSS/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
]

export const CHUNK_RELOAD_KEY = 'kinosota:chunk-reload'
const GUARD_MS = 10_000

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')
  return CHUNK_ERROR_PATTERNS.some(re => re.test(msg))
}

export interface ChunkReloadDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: (url: string) => void
  now: () => number
}

function defaultDeps(): ChunkReloadDeps {
  return {
    storage: window.sessionStorage,
    reload: (url: string) => window.location.assign(url),
    now: () => Date.now(),
  }
}

/** Returns true when a full reload of `targetUrl` was triggered. */
export function handleChunkLoadError(err: unknown, targetUrl: string, deps: ChunkReloadDeps = defaultDeps()): boolean {
  if (!isChunkLoadError(err)) return false
  try {
    const prev = JSON.parse(deps.storage.getItem(CHUNK_RELOAD_KEY) || 'null') as { url: string, at: number } | null
    if (prev && prev.url === targetUrl && deps.now() - prev.at < GUARD_MS) {
      console.error('Chunk still failing after reload, not reloading again:', err)
      return false
    }
    deps.storage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ url: targetUrl, at: deps.now() }))
  } catch {
    // storage unavailable: still reload once
  }
  console.warn('Stale application chunk detected, reloading', targetUrl)
  deps.reload(targetUrl)
  return true
}
