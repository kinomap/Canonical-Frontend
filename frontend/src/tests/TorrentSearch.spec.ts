import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import SearchBar from '@/components/SearchBar.vue'
import Header from '@/components/AppHeader.vue'
import {apiClient} from '@/api/client'
import {torrentsApi} from '@/api/torrents'
vi.mock('@/api/torrents',async original=>({...await original<any>(),torrentsApi:{list:vi.fn()}}))
const quick=vi.spyOn(apiClient,'searchMoviesQuick')
const wrappers:any[]=[]
const item=(kind:'movie'|'tv',id:number)=>({tmdb_id:id,kind,title:kind==='tv'?'Люпен':'Палмер',original_title:'',year:2021,overview:'',poster:null,backdrop:null,rating:8,playback_available:false})
async function at(component:any,path='/torrents',props:any={torrent:true,debounceMs:1}){const router=createRouter({history:createMemoryHistory(),routes:['/','/movies','/series','/genres','/torrents','/torrents/:kind/:id','/login','/register'].map(path=>({path,component:{template:'<p />'}}))});await router.push(path);await router.isReady();const w=mount(component,{props,global:{plugins:[router]}});wrappers.push(w);return{w,router}}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(torrentsApi.list).mockImplementation(async f=>({provider:'tmdb',mode:'metadata_only',items:[item(f.kind,1),item(f.kind,2)],page:1,total:2,total_pages:1} as any))})
afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()))
async function type(w:any,text:string){await w.find('input').setValue(text);await new Promise(r=>setTimeout(r,20));await flushPromises()}
describe('torrent search namespace and keyboard behavior',()=>{
 it('queries movie and TV metadata only and interleaves both kinds',async()=>{const{w}=await at(SearchBar);await type(w,'Lupin');expect(quick).not.toHaveBeenCalled();expect(torrentsApi.list).toHaveBeenCalledWith({kind:'movie',q:'Lupin'},expect.any(AbortSignal));expect(torrentsApi.list).toHaveBeenCalledWith({kind:'tv',q:'Lupin'},expect.any(AbortSignal));expect(w.findAll('.suggestion-item')).toHaveLength(4);expect(w.findAll('.suggestion-item')[1].text()).toContain('Люпен')})
 it('keyboard selection keeps equal film/TV IDs in separate namespaces',async()=>{const{w,router}=await at(SearchBar);await type(w,'Lupin');await w.find('input').trigger('keydown.down');await w.find('input').trigger('keydown.down');await w.find('input').trigger('keydown.enter');await flushPromises();expect(router.currentRoute.value.path).toBe('/torrents/tv/1')})
 it('does not allow late main-engine suggestions after switching mode',async()=>{let resolve:any;quick.mockImplementationOnce(()=>new Promise(r=>resolve=r));const{w}=await at(SearchBar,'/',{torrent:false,debounceMs:1});await type(w,'Palmer');await w.setProps({torrent:true});resolve({items:[{id:'old',title:'OLD_MAIN_ENGINE',type:'movie'}]});await flushPromises();expect(w.text()).not.toContain('OLD_MAIN_ENGINE');expect(w.find('.search-dropdown').exists()).toBe(false)})
 it('shows useful unavailable state without switching engines',async()=>{vi.mocked(torrentsApi.list).mockRejectedValue(Error('503'));const{w}=await at(SearchBar);await type(w,'Palmer');expect(w.text()).toContain('Поиск временно недоступен');expect(quick).not.toHaveBeenCalled()})
 it('header submits title to torrent catalogue, never main movies',async()=>{const{w,router}=await at(Header,'/torrents',{});const input=w.find('.header-search input');await input.setValue('Палмер');await input.trigger('keydown.enter');await flushPromises();expect(router.currentRoute.value.path).toBe('/torrents');expect(router.currentRoute.value.query).toMatchObject({q:'Палмер',kind:'movie'});expect(w.text()).not.toMatch(/Telegram|Телеграм/i)})
 it('encodes query data rather than interpreting query parameters',async()=>{const spy=vi.spyOn(apiClient,'getTorrentMetadata').mockResolvedValue({} as any);const{torrentsApi:real}=await vi.importActual<typeof import('@/api/torrents')>('@/api/torrents');await real.list({kind:'movie',q:' a&kind=tv '});const path=String(spy.mock.calls[0][0]);const q=new URLSearchParams(path.split('?')[1]);expect(q.get('q')).toBe('a&kind=tv');expect(q.get('kind')).toBe('movie');spy.mockRestore()})
})
