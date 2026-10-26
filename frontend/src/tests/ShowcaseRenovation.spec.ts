import {titleSlug,contentPath} from '@/utils/contentPath'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory} from 'vue-router'
import {buildSeo,serializeJsonLd,safeImage} from '@/utils/seo'
import {posterUrl,posterSrcset} from '@/utils/poster'
import SearchBar from '@/components/SearchBar.vue'
import AppHeader from '@/components/AppHeader.vue'
import {apiClient} from '@/api/client'
vi.mock('@/api/client',()=>({apiClient:{searchMoviesQuick:vi.fn(),getMe:vi.fn()}}))
const origin='https://watch.scenrix.com'
const movie={id:'1',title:'История',status:'available',overview:'Описание',poster:'/media/posters/1.jpg',rating:8.5,genres:[{name:'Драма'}]}
function router(){return createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]})}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
describe('Showcase metadata and poster contracts',()=>{
 it('builds readable Cyrillic slugs and preserves the exact API id',()=>{expect(titleSlug('Прошлые жизни')).toBe('proshlye-zhizni');expect(titleSlug('🎬 Дюна / 2021 / MSX storage')).toBe('dyuna');expect(contentPath('movie','fixed-id','Прошлые жизни')).toBe('/movies/fixed-id/proshlye-zhizni')})
 it('uses WebSite/SearchAction only on home',()=>{const data=buildSeo('/',origin);expect(data.type).toBe('website');expect(data.jsonLd[0]?.['@type']).toBe('WebSite');expect(JSON.stringify(data.jsonLd)).toContain('SearchAction')})
 it('whitelists Movie fields and never serializes a playback URL',()=>{const data=buildSeo('/movies/1',origin,{...movie,stream_url:'https://media.invalid/stream/secret'} as any);expect(data.type).toBe('video.movie');expect(data.jsonLd[0]?.['@type']).toBe('Movie');expect(data.jsonLd[1]?.['@type']).toBe('BreadcrumbList');expect(JSON.stringify(data)).not.toContain('secret');expect(JSON.stringify(data)).not.toContain('ratingCount')})
 it('does not index unavailable or failed details',()=>{expect(buildSeo('/movies/1',origin,{...movie,status:'processing'}).robots).toContain('noindex');expect(buildSeo('/series/1',origin).jsonLd).toEqual([])})
 it('uses TVSeries and canonical genres without irrelevant query parameters',()=>{expect(buildSeo('/series/1',origin,movie).jsonLd[0]?.['@type']).toBe('TVSeries');expect(buildSeo('/genres?genre=drama&utm_source=x',origin,undefined,'Драма').canonical).toBe(origin+'/genres?genre=drama')})
 it('rejects media-node and non-image URLs in SEO images',()=>{for(const value of ['https://media.invalid/stream/token','https://media.invalid/poster.jpg','/api/private.jpg','javascript:alert(1)','/video.mp4'])expect(safeImage(value,origin)).toBe(origin+'/cinema/v1/hero-1200.webp');expect(safeImage('/media/posters/1.jpg',origin)).toBe(origin+'/media/posters/1.jpg')})
 it('keeps private routes noindex',()=>{for(const route of ['/api/x','/admin','/login','/auth/callback','/profile'])expect(buildSeo(route,origin).robots).toContain('noindex')})
 it('escapes JSON-LD script termination',()=>{expect(serializeJsonLd({name:'</script><script>alert(1)</script>'})).not.toContain('<');expect(JSON.parse(serializeJsonLd({name:'<x>'}))).toEqual({name:'<x>'})})
 it('does not rewrite unknown or signed poster providers',()=>{expect(posterUrl('https://example.org/p.jpg?token=secret')).toBe('https://example.org/p.jpg?token=secret');expect(posterSrcset('https://example.org/p.jpg')).toBeUndefined();expect(posterSrcset('https://image.tmdb.org/t/p/w500/test.jpg')).toContain('/w185/test.jpg 185w')})
})
describe('Showcase search accessibility',()=>{
 it('debounces 250ms, discards stale results and allows keyboard selection',async()=>{
  vi.useFakeTimers();const r=router();await r.push('/');await r.isReady();let first:(value:any)=>void=()=>{}
  vi.mocked(apiClient.searchMoviesQuick).mockImplementationOnce(()=>new Promise(resolve=>{first=resolve})).mockResolvedValueOnce({items:[{id:'new',title:'Новая история',type:'series'}],total:1} as any)
  const w=mount(SearchBar,{global:{plugins:[r]}});const input=w.find('input');await input.setValue('Старое');await vi.advanceTimersByTimeAsync(249);expect(apiClient.searchMoviesQuick).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(apiClient.searchMoviesQuick).toHaveBeenCalledTimes(1)
  await input.setValue('Новое');await vi.advanceTimersByTimeAsync(250);await flushPromises();first({items:[{id:'old',title:'Старое'}]});await flushPromises();expect(w.text()).toContain('Новая история');expect(w.text()).not.toContain('Старое');await input.trigger('keydown',{key:'ArrowDown'});expect(w.find('[role=option]').attributes('aria-selected')).toBe('true');await input.trigger('keydown',{key:'Enter'});await flushPromises();expect(r.currentRoute.value.path).toBe('/series/new/novaya-istoriya');w.unmount()
 })
 it('focuses the visible search with Ctrl+K and Cmd+K',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));const r=router();await r.push('/');const w=mount(AppHeader,{attachTo:document.body,global:{plugins:[r]}})
  for(const modifier of ['ctrlKey','metaKey']){(document.activeElement as HTMLElement)?.blur();window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',[modifier]:true,cancelable:true}));await flushPromises();expect(document.activeElement).toBe(w.find('input').element)}w.unmount()
 })
})
