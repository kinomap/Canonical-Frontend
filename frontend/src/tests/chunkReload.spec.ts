import { describe, it, expect, vi } from 'vitest'
import { isChunkLoadError, handleChunkLoadError, CHUNK_RELOAD_KEY } from '@/router/chunkReload'

function memoryDeps(now = 1_000_000) {
  const store = new Map<string, string>()
  const deps = {
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } },
    reload: vi.fn(),
    now: () => now,
  }
  return { store, deps, setNow: (n: number) => { now = n } }
}

describe('stale chunk recovery', () => {
  it('recognises the browser errors of a missing/HTML-served lazy chunk', () => {
    // Chrome: missing module; Chrome: index.html served instead of JS; Firefox; Safari
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://localhost:8888/assets/SeriesCatalogView-n3pupHlP.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/SeriesCatalogView-C4hjhYHO.css'))).toBe(true)
    expect(isChunkLoadError(new Error('Network error'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })

  it('reloads the navigation target once', () => {
    const { deps, store } = memoryDeps()
    const err = new TypeError('Failed to fetch dynamically imported module: /assets/SeriesCatalogView-old.js')
    expect(handleChunkLoadError(err, '/series', deps)).toBe(true)
    expect(deps.reload).toHaveBeenCalledWith('/series')
    expect(JSON.parse(store.get(CHUNK_RELOAD_KEY)!).url).toBe('/series')
  })

  it('does not loop when the same target fails again right after the reload', () => {
    const { deps, setNow } = memoryDeps()
    const err = new TypeError('Failed to fetch dynamically imported module')
    expect(handleChunkLoadError(err, '/series', deps)).toBe(true)
    setNow(1_000_000 + 2_000)
    expect(handleChunkLoadError(err, '/series', deps)).toBe(false)
    expect(deps.reload).toHaveBeenCalledTimes(1)
    setNow(1_000_000 + 60_000)
    expect(handleChunkLoadError(err, '/series', deps)).toBe(true)
  })

  it('ignores ordinary navigation errors', () => {
    const { deps } = memoryDeps()
    expect(handleChunkLoadError(new Error('boom'), '/series', deps)).toBe(false)
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
