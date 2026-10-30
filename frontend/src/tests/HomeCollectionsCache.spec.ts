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
it('shares simultaneous uncancelled metadata loads and retries failures',async()=>{
 let release!: (value:any)=>void
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve})).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({id:'retry'})})
 vi.stubGlobal('fetch',fetcher)
 const first=apiClient.getMovie('shared'),second=apiClient.getMovie('shared');expect(fetcher).toHaveBeenCalledTimes(1);release({ok:true,json:async()=>({id:'shared'})});expect(await first).toEqual(await second)
 await expect(apiClient.getMovie('retry')).rejects.toThrow('offline');expect(await apiClient.getMovie('retry')).toEqual({id:'retry'})
})
it('does not share abortable listing requests or playback writes',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[]})});vi.stubGlobal('fetch',fetcher)
 await Promise.all([apiClient.listMovies({},new AbortController().signal),apiClient.listMovies({},new AbortController().signal)]);expect(fetcher).toHaveBeenCalledTimes(2)
 await Promise.all([apiClient.startPlayback('a'),apiClient.startPlayback('a')]);expect(fetcher).toHaveBeenCalledTimes(4)
})
