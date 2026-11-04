import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {ref,nextTick} from 'vue'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import LibraryButton from '@/components/LibraryButton.vue'
import Card from '@/components/TorrentCard.vue'
import LibraryView from '@/views/LibraryView.vue'
import {libraryApi} from '@/api/library'
import {torrentsApi} from '@/api/torrents'
import {preparationApi} from '@/api/preparation'
const auth=vi.hoisted(()=>({token:null as any,user:null as any,isAuthenticated:null as any}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>auth}))
vi.mock('@/api/library',()=>({libraryApi:{membership:vi.fn(),set:vi.fn(),list:vi.fn()}}))
vi.mock('@/api/torrents',async original=>{const real=await original<any>();return{...real,torrentsApi:{...real.torrentsApi,access:vi.fn()}}})
vi.mock('@/api/preparation',async original=>({...await original<any>(),preparationApi:{status:vi.fn()}}))
const item={tmdb_id:550,kind:'movie',title:'Тестовый фильм',original_title:'Test',year:2026,rating:8,overview:'',poster:null,backdrop:null,playback_available:false} as const
const wrappers:any[]=[]
beforeEach(()=>{if(!auth.token){auth.token=ref(null);auth.user=ref(null);auth.isAuthenticated=ref(true)}auth.token.value='cookie-session';auth.user.value={id:crypto.randomUUID()};auth.isAuthenticated.value=true;vi.mocked(libraryApi.membership).mockResolvedValue({saved:[]});vi.mocked(libraryApi.set).mockResolvedValue({saved:true});vi.mocked(libraryApi.list).mockResolvedValue({items:[item],page:1,total:1,total_pages:1});vi.mocked(torrentsApi.access).mockResolvedValue({allowed:false,requirement:'pro',playback_available:false} as any);vi.mocked(preparationApi.status).mockResolvedValue({statuses:{}} as any)})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.clearAllMocks()})
async function mountAt(component:any,props:any={},path='/torrents') {const router=createRouter({history:createMemoryHistory(),routes:[{path:'/torrents',component:{template:'<p />'}},{path:'/torrents/library',component:LibraryView},{path:'/login',component:{template:'<p />'}}]});await router.push(path);await router.isReady();const w=mount(component,{props,global:{plugins:[router]}});wrappers.push(w);await new Promise(r=>setTimeout(r,10));await flushPromises();return{w,router}}
describe('account-backed library controls',()=>{
 it('saves only after successful API result, fills bookmark and allows removal',async()=>{const{w}=await mountAt(LibraryButton,{item});expect(w.get('button').attributes('aria-pressed')).toBe('false');await w.get('button').trigger('click');await flushPromises();expect(libraryApi.set).toHaveBeenCalledWith('movie',550,true);expect(w.get('button').attributes('aria-pressed')).toBe('true');expect(w.get('svg').attributes('fill')).toBe('currentColor');expect(w.get('button').attributes('title')).toBe('Удалить из кинотеки');vi.mocked(libraryApi.set).mockResolvedValue({saved:false});await w.get('button').trigger('click');await flushPromises();expect(w.get('button').attributes('aria-pressed')).toBe('false')})
 it('shows existing saved state from server without writing',async()=>{vi.mocked(libraryApi.membership).mockResolvedValue({saved:['movie:550']});const{w}=await mountAt(LibraryButton,{item});expect(w.get('button').attributes('aria-pressed')).toBe('true');expect(libraryApi.set).not.toHaveBeenCalled()})
 it('does not fill on mutation failure and prevents duplicate requests',async()=>{let reject:any;vi.mocked(libraryApi.set).mockImplementation(()=>new Promise((_r,j)=>reject=j));const{w}=await mountAt(LibraryButton,{item});await w.get('button').trigger('click');expect(w.get('button').attributes('disabled')).toBeDefined();reject(new Error('503'));await flushPromises();expect(w.get('button').attributes('aria-pressed')).toBe('false');expect(w.get('[role=alert]').text()).toContain('Не удалось сохранить')})
 it('redirects guests to login with return path and performs no writes',async()=>{auth.isAuthenticated.value=false;auth.token.value=null;const{w,router}=await mountAt(LibraryButton,{item});await w.get('button').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/login');expect(router.currentRoute.value.query.redirect).toBe('/torrents');expect(libraryApi.set).not.toHaveBeenCalled()})
 it('keeps movie and TV identities separate and updates duplicate controls together',async()=>{const{w}=await mountAt({components:{LibraryButton},setup:()=>({item}),template:'<div><LibraryButton :item="item"/><LibraryButton :item="item"/><LibraryButton :item="{...item,kind:\'tv\'}"/></div>'});expect(libraryApi.membership).toHaveBeenCalledTimes(1);await w.findAll('button')[0].trigger('click');await flushPromises();expect(w.findAll('button').map(b=>b.attributes('aria-pressed'))).toEqual(['true','true','false'])})
 it('does not nest bookmark buttons inside navigation links',async()=>{const{w}=await mountAt(Card,{item});expect(w.find('a button').exists()).toBe(false);expect(w.get('.card-library button').attributes('title')).toBe('Добавить в кинотеку')})
 it('clears saved flags when the account changes after original controls unmount',async()=>{vi.mocked(libraryApi.membership).mockResolvedValue({saved:['movie:550']});const first=await mountAt(LibraryButton,{item});expect(first.w.get('button').attributes('aria-pressed')).toBe('true');first.w.unmount();auth.user.value={id:'another-account'};vi.mocked(libraryApi.membership).mockResolvedValue({saved:[]});const second=await mountAt(LibraryButton,{item});expect(second.w.get('button').attributes('aria-pressed')).toBe('false')})
 it('loads a paginated saved collection and handles empty state',async()=>{vi.mocked(libraryApi.list).mockResolvedValue({items:[],page:1,total:0,total_pages:1});const{w}=await mountAt(LibraryView,{},'/torrents/library');expect(libraryApi.list).toHaveBeenCalledWith(1);expect(w.text()).toContain('Здесь будет ваша кинотека');expect(w.find('.library-pagination').exists()).toBe(false)})
})

describe('library preparation progress',()=>{
 const pro=()=>vi.mocked(torrentsApi.access).mockResolvedValue({allowed:true,requirement:'pro',playback_available:false} as any)
 const card=(w:any)=>w.find('.torrent-card > [data-testid="card-progress"] .torrent-progress')
 it('shows the live preparation step with percent under a library card',async()=>{pro();vi.mocked(preparationApi.status).mockResolvedValue({statuses:{'movie:550':{status:'loading',playable:false,progress:75}}} as any);const{w}=await mountAt(LibraryView,{},'/torrents/library');expect(preparationApi.status).toHaveBeenCalledWith(['movie:550']);expect(w.find('.torrent-poster [data-testid="card-progress"]').exists()).toBe(false);const bar=card(w);expect(bar.attributes('role')).toBe('progressbar');expect(bar.find('.progress-label').text()).toBe('Проверка потока...');expect(bar.find('.progress-percent').text()).toBe('75%');expect(bar.attributes('data-stage')).toBe('checking');expect(bar.find('.progress-fill').attributes('style')).toContain('width: 75%')})
 it('turns green with the prepared quality once ready',async()=>{pro();vi.mocked(preparationApi.status).mockResolvedValue({statuses:{'movie:550':{status:'playable',playable:true,progress:100,start_ms:640,stage:'ready',label:'Готово',quality:'1080p',source_type:'WEB-DL',seeders:357}}} as any);const{w}=await mountAt(LibraryView,{},'/torrents/library');const bar=card(w);expect(bar.text()).toBe('Готово · 1080p');expect(bar.classes()).toContain('is-ready');expect(bar.find('.progress-percent').exists()).toBe(false)})
 it('falls back to the measured start time when the quality is unknown',async()=>{pro();vi.mocked(preparationApi.status).mockResolvedValue({statuses:{'movie:550':{status:'playable',playable:true,progress:100,start_ms:18416}}} as any);const{w}=await mountAt(LibraryView,{},'/torrents/library');expect(card(w).text()).toBe('Готово · старт 18416 мс')})
 it('names an empty tracker search on the card instead of a percent',async()=>{pro();vi.mocked(preparationApi.status).mockResolvedValue({statuses:{'movie:550':{status:'unavailable',playable:false,progress:0,start_ms:null,stage:'not_found',label:'Раздачи на трекерах пока не найдены',reason:'no_verified_source'}}} as any);const{w}=await mountAt(LibraryView,{},'/torrents/library');const bar=card(w);expect(bar.text()).toBe('Раздачи на трекерах пока не найдены');expect(bar.classes()).toContain('is-warn');expect(bar.find('.progress-track').exists()).toBe(false)})
 it('re-reads the status every 2.5 s through the stages until ready and then stops',async()=>{
  pro()
  const steps=[{status:'queued',playable:false,progress:10,stage:'queued',label:'В очереди...'},{status:'searching',playable:false,progress:42,stage:'searching',label:'Поиск источников...'},{status:'loading',playable:false,progress:81,stage:'checking',label:'Проверка потока...'},{status:'playable',playable:true,progress:100,start_ms:18416,stage:'ready',label:'Готово',quality:'1080p'}]
  let call=0
  vi.mocked(preparationApi.status).mockImplementation(async()=>({statuses:{'movie:550':steps[Math.min(call++,steps.length-1)]}}) as any)
  vi.useFakeTimers()
  try{
   const router=createRouter({history:createMemoryHistory(),routes:[{path:'/torrents',component:{template:'<p />'}},{path:'/torrents/library',component:LibraryView}]})
   await router.push('/torrents/library');await router.isReady()
   const w=mount(LibraryView,{global:{plugins:[router]}});wrappers.push(w);await flushPromises()
   expect(card(w).find('.progress-label').text()).toBe('В очереди...');expect(card(w).find('.progress-percent').text()).toBe('10%')
   await vi.advanceTimersByTimeAsync(2500);await flushPromises()
   expect(card(w).find('.progress-label').text()).toBe('Поиск источников...');expect(card(w).find('.progress-percent').text()).toBe('42%')
   await vi.advanceTimersByTimeAsync(2500);await flushPromises()
   expect(card(w).find('.progress-label').text()).toBe('Проверка потока...');expect(card(w).find('.progress-percent').text()).toBe('81%')
   await vi.advanceTimersByTimeAsync(2500);await flushPromises()
   expect(card(w).text()).toBe('Готово · 1080p');expect(card(w).classes()).toContain('is-ready')
   expect(preparationApi.status).toHaveBeenCalledTimes(4)
   await vi.advanceTimersByTimeAsync(10000);await flushPromises()
   expect(preparationApi.status).toHaveBeenCalledTimes(4)
  }finally{vi.useRealTimers()}
 })
 it('does not ask for preparation without PRO access and shows no progress',async()=>{const{w}=await mountAt(LibraryView,{},'/torrents/library');expect(torrentsApi.access).toHaveBeenCalled();expect(preparationApi.status).not.toHaveBeenCalled();expect(w.find('[data-testid="card-progress"]').exists()).toBe(false);expect(w.find('.torrent-card').exists()).toBe(true)})
})
