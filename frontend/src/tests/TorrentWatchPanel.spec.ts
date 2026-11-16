import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import View from '@/views/TorrentCatalogView.vue'
import {torrentsApi,torrentPlaybackApi} from '@/api/torrents'
import {waitForPlayer} from '@/lib/desktopLaunch'
vi.mock('@/api/torrents',async original=>({...await original<any>(),torrentsApi:{access:vi.fn(),list:vi.fn(),genres:vi.fn(),detail:vi.fn()},torrentPlaybackApi:{sources:vi.fn(),prepareSource:vi.fn(),discover:vi.fn(),desktopLaunch:vi.fn(),launchStatus:vi.fn(),playbackTicket:vi.fn(),preparationStatus:vi.fn()}}))
vi.mock('@/lib/desktopLaunch',async original=>({...await original<any>(),openDeepLink:vi.fn(),waitForPlayer:vi.fn()}))

const entry={tmdb_id:1,kind:'movie',title:'Дюна',year:2021,original_title:'Dune',rating:8,overview:'Описание',poster:null,backdrop:null,playback_available:false} as const
const view=(over:any={})=>({allowed:true,in_library:true,discovering:false,selected_source_id:null,status:{status:'playable',playable:true,progress:100,start_ms:850},sources:[],qualities:[{value:'1080p',available:true}],languages:[{value:'ru',available:true},{value:'en',available:true}],episodes:[],...over})
const src=(over:any={})=>({source_id:'s1',title:'Dune 2021 1080p WEB-DL',quality:'1080p',source_type:'WEB-DL',languages:['ru'],seeders:20,size_bytes:8e9,state:'ready',progress:100,start_ms:850,default:false,episodes:[],file_count:1,...over})
/** The HEVC release carries the dub too, but only the H.264 one with an AAC first track (read from the file) lets the browser play it. */
const releases=[
 src({source_id:'s-hevc',title:'Dune 2021 1080p WEB-DL HEVC',voices:['Дубляж','Original'],languages:['ru','en'],rank:0,seeders:90}),
 src({source_id:'s-avc',title:'Dune 2021 1080p WEB-DL',voices:['Дубляж'],audio_tracks:[{index:1,language:'ru',title:'Дубляж',codec:'aac',channels:2}],rank:1,seeders:40}),
 src({source_id:'s-dts',title:'Dune 2021 1080p BDRip DTS',source_type:'BDRip',voices:['MVO, Jaskier'],rank:2,seeders:12}),
]

const mounted:any[]=[]
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(torrentsApi.access).mockResolvedValue({allowed:true,requirement:'pro',playback_available:false} as any)
 vi.mocked(torrentsApi.list).mockResolvedValue({provider:'tmdb',mode:'metadata_only',items:[entry],total:1,total_pages:1,page:1} as any)
 vi.mocked(torrentsApi.genres).mockResolvedValue({items:[]})
 vi.mocked(torrentsApi.detail).mockResolvedValue(entry as any)
 vi.mocked(torrentPlaybackApi.discover).mockResolvedValue({result:'active'} as any)
})
async function at(){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/torrents/:kind/:id',component:View},{path:'/:any(.*)',component:{template:'<p />'}}]})
 await router.push('/torrents/movie/1');await router.isReady()
 const w=mount(View,{global:{plugins:[router]}});mounted.push(w);await flushPromises();return w
}
async function openAudio(w:any){
 await w.find('[data-testid="audio-track-button"]').trigger('click');await flushPromises()
 return [...document.body.querySelectorAll('.audio-modal-item')] as HTMLElement[]
}
const name=(el:Element)=>el.querySelector('.audio-modal-name')!.textContent
const badge=(el:Element)=>!!el.querySelector('[data-testid="audio-browser-badge"]')
const checked=(el:Element)=>el.querySelector('.audio-modal-check')!.textContent
async function pick(el:Element){el.dispatchEvent(new MouseEvent('click',{bubbles:true}));await flushPromises()}

describe('audio modal: voices of every release with a browser badge',()=>{
 it('lists the voices of all offered releases and marks the ones the browser can play',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-hevc',sources:releases}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж','Original','Английская дорожка','MVO, Jaskier'])
  expect(items.map(checked)).toEqual(['✓','','',''])
  // HEVC / DTS releases and a second track (the browser plays only the first one) get no badge.
  expect(items.map(badge)).toEqual([true,false,false,false])
  const mark=items[0].querySelector('[data-testid="audio-browser-badge"]')!
  expect(mark.getAttribute('title')).toBe('Доступно для просмотра в браузере')
  expect(mark.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  expect(mark.textContent).toBe('Доступно для просмотра в браузере')
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')!.textContent).toContain('Можно смотреть в браузере')
 })

 it('switches the browser stream to the release of the picked voice',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-hevc',sources:releases}) as any)
  vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/avc.mp4',expires_at:'x'} as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').text()).toContain('HEVC (H.265)')
  expect(w.find('.browser-play').exists()).toBe(false)
  await pick((await openAudio(w))[0])
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'s-avc',season:null,episode:null})
  expect(w.find('video').attributes('src')).toBe('https://media.example/avc.mp4')
  const again=await openAudio(w)
  expect(again.map(checked)).toEqual(['✓','','',''])
  expect(badge(again[0])).toBe(true)
 })

 it('keeps the chosen release when it already plays the voice in the browser',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-avc',sources:releases}) as any)
  vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/avc.mp4',expires_at:'x'} as any)
  const w=await at()
  await pick((await openAudio(w))[0])
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'s-avc',season:null,episode:null})
  expect(torrentPlaybackApi.prepareSource).not.toHaveBeenCalled()
 })

 it('warns in the player for a voice the browser cannot decode and hands the release to KINOSOTA Player',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-avc',sources:releases}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-dts',deep_link:'kinosota://watch?launch=id-dts',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  expect(w.find('.browser-play').exists()).toBe(true)
  const items=await openAudio(w)
  expect(name(items[3])).toBe('MVO, Jaskier')
  await pick(items[3])
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.text()).toContain('DTS')
  expect(w.find('.browser-play').exists()).toBe(false)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  await notice.find('[data-testid="codec-notice-desktop"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'s-dts',season:null,episode:null,audio_lang:'ru',audio_track:null})
 })

 it('marks only the first container track of a browser-friendly release',async()=>{
  const tracks=[{index:1,language:'ru',title:'Дубляж',codec:'aac',channels:2},{index:2,language:'en',title:'Original',codec:'aac',channels:2}]
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-mkv',languages:['ru','en'],audio_tracks:tracks,default:true})]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж','Original'])
  expect(items.map(badge)).toEqual([true,false])
 })

 it('shows no badge or legend when no release plays in the browser',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-uhd',title:'Dune 2021 2160p HEVC TrueHD',quality:'2160p',voices:['Дубляж','MVO'],default:true})]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж','MVO'])
  expect(items.map(badge)).toEqual([false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).toBeNull()
 })
})

/** «Сердце зверя» on production: every release leads with an AC-3 dub, the Ukrainian voice is a later track. */
const t=(index:number,language:string,title:string,codec:string|null,channels=2)=>({index,language,title,codec,channels})
const beastAc3=src({source_id:'b-1080',title:'Heart of the Beast [2026, WEB-DL 1080p] Dub + Dub (Ukr) + Original Eng',languages:['ru','uk','en'],default:true,
 audio_tracks:[t(1,'ru','Продубляж','ac3',6),t(2,'ru','HDrezka (DUB)','aac'),t(3,'uk','LeDoyen','eac3',6),t(4,'en','English','eac3',6)]})
const ukAac=src({source_id:'b-ua',title:'Heart of the Beast 2026 1080p WEB-DL Ukr',languages:['uk','ru'],rank:3,seeders:5,
 audio_tracks:[t(1,'uk','LeDoyen','aac'),t(2,'ru','Продубляж','aac')]})
const langPill=(w:any,title:string)=>w.findAll('.watch-pill').find((b:any)=>b.attributes('title')===title)

describe('browser plays the chosen voice with sound, or says it cannot',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/ua.mkv',expires_at:'x'} as any)})

 it('an unknown codec of a plain WEB-DL keeps the badge: the browser plays it without a warning',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-plain',voices:['Дубляж'],default:true})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('.browser-play').exists()).toBe(true)
  expect((await openAudio(w)).map(badge)).toEqual([true])
 })

 it('«Сердце зверя» cached before the codec parser: the leading Russian track keeps the badge the player honours',async()=>{
  const legacy=src({source_id:'b-legacy',title:'Heart of the Beast [2026, WEB-DL 1080p] Dub + Dub (Ukr) + Original Eng',languages:['ru','uk','en'],default:true,
   audio_tracks:[{index:1,language:'ru',title:'Продубляж'},{index:2,language:'uk',title:'LeDoyen',codec:null},{index:3,language:'en',title:'English'}]})
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[legacy]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('.browser-play').exists()).toBe(true)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','LeDoyen','English'])
  expect(items.map(badge)).toEqual([true,false,false])
 })

 it('an unknown codec of a release naming AC-3 / DTS gets no badge and the player warns',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-dts',title:'Dune 2021 1080p BDRip DTS',voices:['Дубляж'],default:true})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').text()).toContain('DTS')
  expect((await openAudio(w)).map(badge)).toEqual([false])
 })

 it('a known AAC first track keeps the badge even when the title also names AC-3',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-mix',title:'Dune 2021 1080p WEB-DL AC3',default:true,audio_tracks:[t(1,'ru','Дубляж','aac'),t(2,'en','Original','ac3',6)]})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect((await openAudio(w)).map(badge)).toEqual([true,false])
 })

 it('gives no badge to an AC-3 first track and warns before a silent film plays',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  expect((await openAudio(w)).map(badge)).toEqual([false,false,false,false])
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.text()).toContain('Dolby Digital (AC-3)')
  expect(notice.find('[data-testid="codec-notice-browser"]').text()).toBe('Смотреть в браузере без звука')
  expect(w.find('.browser-play').exists()).toBe(false)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
 })

 it('a Ukrainian pick opens the release where the Ukrainian voice leads with AAC',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('[data-testid="browser-note"]').text()).toContain('«LeDoyen» — основная дорожка')
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-ua',season:null,episode:null})
  expect(w.find('video').attributes('src')).toBe('https://media.example/ua.mkv')
 })

 it('a Ukrainian pick no release leads with is never played as a Russian dub in the browser',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-ua',deep_link:'kinosota://watch?launch=id-ua',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('«LeDoyen» звучит только в KINOSOTA Player')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('«Продубляж»')
  expect(w.find('.browser-play').exists()).toBe(false)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  await notice.find('[data-testid="codec-notice-desktop"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'b-1080',season:null,episode:null,audio_lang:'uk',audio_track:3})
 })

 it('a studio picked in «Аудио» is matched exactly, not by its language',async()=>{
  const other=src({source_id:'b-ru',title:'Heart of the Beast 2026 1080p WEB-DL',languages:['ru'],rank:4,audio_tracks:[t(1,'ru','WinMedia','aac')]})
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,other]}) as any)
  const w=await at()
  const items=await openAudio(w)
  await pick(items.find((el)=>name(el)==='HDrezka (DUB)')!)
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('«HDrezka (DUB)»')
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
 })
})
