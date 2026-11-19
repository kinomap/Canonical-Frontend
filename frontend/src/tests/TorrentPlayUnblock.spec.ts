import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import View from '@/views/TorrentCatalogView.vue'
import {ACCESS_TIMEOUT_MS,WAIT_STALL_MS} from '@/composables/useTorrentWatch'
import {torrentsApi,torrentPlaybackApi} from '@/api/torrents'
vi.mock('@/api/torrents',async original=>({...await original<any>(),torrentsApi:{access:vi.fn(),list:vi.fn(),genres:vi.fn(),detail:vi.fn()},torrentPlaybackApi:{sources:vi.fn(),prepareSource:vi.fn(),discover:vi.fn(),desktopLaunch:vi.fn(),launchStatus:vi.fn(),playbackTicket:vi.fn(),preparationStatus:vi.fn()}}))
vi.mock('@/lib/desktopLaunch',async original=>({...await original<any>(),openDeepLink:vi.fn(),waitForPlayer:vi.fn()}))

const movie={tmdb_id:1,kind:'movie',title:'Дюна',year:2021,original_title:'Dune',rating:8,overview:'',poster:null,backdrop:null,playback_available:false} as const
const show={...movie,tmdb_id:2,kind:'tv',title:'Сериал',season_list:[{season:1,episodes:3},{season:2,episodes:2}]} as const
const view=(over:any={})=>({allowed:true,in_library:true,discovering:false,selected_source_id:null,status:{status:'playable',playable:true,progress:100,start_ms:850},sources:[],qualities:[{value:'1080p',available:true}],languages:[{value:'ru',available:true}],episodes:[],...over})
const src=(over:any={})=>({source_id:'s1',title:'Release 1080p WEB-DL',quality:'1080p',source_type:'WEB-DL',languages:['ru'],seeders:20,size_bytes:8e9,state:'ready',progress:100,start_ms:850,default:false,episodes:[],file_count:1,...over})
const mounted:any[]=[]
afterEach(()=>{mounted.splice(0).forEach(w=>w.unmount());vi.useRealTimers()})
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(torrentsApi.access).mockResolvedValue({allowed:true,requirement:'pro',playback_available:false} as any)
 vi.mocked(torrentsApi.list).mockResolvedValue({provider:'tmdb',mode:'metadata_only',items:[],total:0,total_pages:1,page:1} as any)
 vi.mocked(torrentsApi.genres).mockResolvedValue({items:[]})
 vi.mocked(torrentsApi.detail).mockResolvedValue(movie as any)
 vi.mocked(torrentPlaybackApi.discover).mockResolvedValue({result:'queued'} as any)
 vi.mocked(torrentPlaybackApi.prepareSource).mockResolvedValue({} as any)
})
async function at(path='/torrents/movie/1'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/torrents/:kind/:id',component:View},{path:'/:any(.*)',component:{template:'<p />'}}]})
 await router.push(path);await router.isReady()
 const w=mount(View,{global:{plugins:[router]}});mounted.push(w);await flushPromises();return {w,router}
}
const button=(w:any)=>w.get('[data-testid="watch-button"]')

describe('Web Torrent: the Play button is never permanently disabled',()=>{
 it('a hung access check turns into a clickable retry after 5 s',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']})
  vi.mocked(torrentsApi.access).mockReturnValue(new Promise(()=>{}) as any)
  const {w}=await at()
  expect(button(w).attributes('disabled')).toBeDefined()
  expect(w.get('[data-testid="watch-hint"]').text()).toContain('Проверяем доступ')
  expect(w.find('[data-testid="watch-hint-spinner"]').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(ACCESS_TIMEOUT_MS+10);await flushPromises()
  expect(button(w).attributes('disabled')).toBeUndefined()
  expect(button(w).text()).toContain('Повторить')
  vi.mocked(torrentsApi.access).mockResolvedValue({allowed:true,requirement:'pro',playback_available:false} as any)
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src()]}) as any)
  await button(w).trigger('click');await flushPromises()
  expect(torrentsApi.access).toHaveBeenCalledTimes(2)
  expect(button(w).text()).toContain('Смотреть')
  expect(button(w).attributes('disabled')).toBeUndefined()
 })

 it('a failed access check offers a retry at once',async()=>{
  vi.mocked(torrentsApi.access).mockRejectedValue(new Error('network'))
  const {w}=await at()
  expect(button(w).text()).toContain('Повторить')
  expect(button(w).attributes('disabled')).toBeUndefined()
 })

 it('a ready release is always playable',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src()]}) as any)
  const {w}=await at()
  expect(button(w).text()).toContain('Смотреть')
  expect(button(w).attributes('disabled')).toBeUndefined()
 })

 it('series: switches to the release that carries the chosen episode',async()=>{
  vi.mocked(torrentsApi.detail).mockResolvedValue(show as any)
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-s2',episodes:[{season:1,episode:1},{season:2,episode:1}],sources:[
   src({source_id:'s-s2',episodes:[{season:2,episode:1}]}),
   src({source_id:'s-s1',state:'candidate',progress:0,episodes:[{season:1,episode:1},{season:1,episode:2}],seeders:5}),
  ]}) as any)
  const {w}=await at('/torrents/tv/2')
  // S1E1 is preselected; only the not-yet-prepared release has it: «Подготовить раздачу», clickable.
  expect(button(w).text()).toContain('Подготовить раздачу')
  expect(button(w).attributes('disabled')).toBeUndefined()
  await button(w).trigger('click');await flushPromises()
  expect(torrentPlaybackApi.prepareSource).toHaveBeenCalledWith('s-s1')
 })

 it('series: an episode no release carries offers «Найти раздачи» instead of a dead button',async()=>{
  vi.mocked(torrentsApi.detail).mockResolvedValue(show as any)
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({episodes:[{season:1,episode:1}],sources:[src({source_id:'s-s2',episodes:[{season:2,episode:1}]})]}) as any)
  const {w}=await at('/torrents/tv/2')
  expect(button(w).text()).toContain('Найти раздачи')
  expect(button(w).attributes('disabled')).toBeUndefined()
  expect(w.get('[data-testid="watch-hint"]').text()).toContain('Этой серии пока нет')
  await button(w).trigger('click');await flushPromises()
  expect(torrentPlaybackApi.discover).toHaveBeenCalledWith('tv',2)
 })

 it('a preparation stuck in queue offers a forced restart after the timeout',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']})
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({status:{status:'queued',playable:false,progress:10},sources:[src({state:'queued',progress:10})]}) as any)
  const {w}=await at()
  expect(button(w).attributes('disabled')).toBeDefined()
  expect(w.find('[data-testid="watch-hint-spinner"]').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(WAIT_STALL_MS+10);await flushPromises()
  expect(button(w).text()).toContain('Запустить заново')
  expect(button(w).attributes('disabled')).toBeUndefined()
  await button(w).trigger('click');await flushPromises()
  expect(torrentPlaybackApi.prepareSource).toHaveBeenCalledWith('s1')
 })

})
