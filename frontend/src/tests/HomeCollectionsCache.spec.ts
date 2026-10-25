import { afterEach, beforeEach, it, expect, vi } from 'vitest'
import { apiClient, clearClientCache } from '@/api/client'
beforeEach(() => { clearClientCache(); localStorage.clear() })
afterEach(() => { clearClientCache(); vi.unstubAllGlobals() })
it('background refresh bypasses only home cache and stores fresh collections', async () => {
 const old = { newest: [{ id: 'old' }] }, updated = { newest: [{ id: 'new' }] }
 const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => old }).mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'genre' }] }).mockResolvedValueOnce({ ok: true, json: async () => updated })
 vi.stubGlobal('fetch', fetcher)
 expect(await apiClient.getHomeCollections()).toEqual(old)
 await apiClient.listGenres(); expect(await apiClient.getHomeCollections()).toEqual(old)
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect(await apiClient.getHomeCollections(true)).toEqual(updated)
 expect(await apiClient.getHomeCollections()).toEqual(updated)
 await apiClient.listGenres(); expect(fetcher).toHaveBeenCalledTimes(3)
})
