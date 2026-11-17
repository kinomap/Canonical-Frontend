import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import View from '@/views/TorrentCatalogView.vue'
import {markBrowserSilent,releaseBrowserCompatible,releaseName} from '@/composables/useTorrentWatch'
import {torrentsApi,torrentPlaybackApi} from '@/api/torrents'
import {waitForPlayer} from '@/lib/desktopLaunch'
import {resetAudioCodecKnowledge} from '@/lib/browserCodecs'
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
afterEach(()=>{mounted.splice(0).forEach(w=>w.unmount());vi.unstubAllGlobals();resetAudioCodecKnowledge()})
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

describe('audio modal: only the tracks of the chosen release, badged when the browser plays them',()=>{
 it('lists only the tracks of the chosen release, never a voice of another release of the quality',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-hevc',sources:releases}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж','Original','Английская дорожка'])
  expect(items.map(checked)).toEqual(['✓','',''])
  // HEVC release: the browser shows no picture, no track gets the badge.
  expect(items.map(badge)).toEqual([false,false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).toBeNull()
 })

 it('badges the first track of a release the browser plays with sound',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-avc',sources:releases}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж'])
  expect(items.map(badge)).toEqual([true])
  const mark=items[0].querySelector('[data-testid="audio-browser-badge"]')!
  expect(mark.getAttribute('title')).toBe('Доступно для просмотра в браузере')
  expect(mark.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  expect(mark.textContent).toBe('Доступно для просмотра в браузере')
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')!.textContent).toContain('Можно смотреть в браузере')
 })

 it('a voice pick never switches the release: the HEVC release keeps its notice',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-hevc',sources:releases}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').text()).toContain('HEVC (H.265)')
  expect(w.find('.browser-play').exists()).toBe(false)
  await pick((await openAudio(w))[0])
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="codec-notice"]').text()).toContain('HEVC (H.265)')
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  const again=await openAudio(w)
  expect(again.map(name)).toEqual(['Дубляж','Original','Английская дорожка'])
  expect(again.map(checked)).toEqual(['✓','',''])
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
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-dts',sources:releases}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-dts',deep_link:'kinosota://watch?launch=id-dts',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['MVO, Jaskier'])
  expect(items.map(badge)).toEqual([false])
  await pick(items[0])
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

 it('an unknown codec of a plain WEB-DL lights no badge: a codec never read from the file is no proof of sound',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-plain',voices:['Дубляж'],default:true})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('.browser-play').exists()).toBe(true)
  expect((await openAudio(w)).map(badge)).toEqual([false])
 })

 it('«Надежда» (TMDB 1058424): a WEB-DL whose file names DDP 5.1 is never badged, a proven AAC release is',async()=>{
  const hope=src({source_id:'hope',title:'Надежда / Hopeu / Hope (2026) WEB-DL [H.264/1080p]',file_name:'Hopeu.2026.1080p.AMZN.WEB-DL.DDP5.1.H.264.mkv',default:true,
   audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm'},{index:2,language:'ru',title:'HDrezka'}]})
  expect(releaseName(hope)).toContain('DDP5.1')
  expect(releaseBrowserCompatible(hope)).toBe(false)
  expect(releaseBrowserCompatible({...hope,file_name:null,audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm',codec:'aac',channels:2}]})).toBe(true)
  expect(releaseBrowserCompatible({...hope,audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm',codec:'eac3',channels:6}]})).toBe(false)
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[hope]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['MVO, LostFilm','HDrezka'])
  expect(items.map(badge)).toEqual([false,false])
 })

 it('a release the browser played silently loses its badge for the rest of the tab',async()=>{
  const aac=src({source_id:'s-silent',default:true,audio_tracks:[{index:1,language:'ru',title:'Дубляж',codec:'aac',channels:2}]})
  expect(releaseBrowserCompatible(aac)).toBe(true)
  markBrowserSilent('s-silent')
  expect(releaseBrowserCompatible(aac)).toBe(false)
  expect(releaseBrowserCompatible({...aac,source_id:'s-other'})).toBe(true)
 })

 it('«Сердце зверя» cached before the codec parser: no track is badged until its codec is read',async()=>{
  const legacy=src({source_id:'b-legacy',title:'Heart of the Beast [2026, WEB-DL 1080p] Dub + Dub (Ukr) + Original Eng',languages:['ru','uk','en'],default:true,
   audio_tracks:[{index:1,language:'ru',title:'Продубляж'},{index:2,language:'uk',title:'LeDoyen',codec:null},{index:3,language:'en',title:'English'}]})
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[legacy]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('.browser-play').exists()).toBe(true)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,false,false])
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

 it('a Ukrainian pick stays in the chosen build: its later track runs muted, never another build',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  expect((await openAudio(w)).map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  closeAudio();await flushPromises()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('«LeDoyen» звучит только в KINOSOTA Player')
  await notice.find('[data-testid="codec-notice-browser"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
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

/** The 2160p release of «Сердце зверя» leads with a Ukrainian AAC voice; at 1080p it must never leak in. */
const beastUhd=src({source_id:'b-2160',title:'Heart of the Beast 2026 2160p WEB-DL',quality:'2160p',languages:['uk','ru'],rank:1,seeders:50,
 audio_tracks:[t(1,'uk','UKR 4K Studio','aac'),t(2,'ru','Кинопоиск HD','aac')]})
const twoQualities=()=>view({sources:[beastAc3,beastUhd],qualities:[{value:'1080p',available:true},{value:'2160p',available:true}],languages:[{value:'ru',available:true},{value:'uk',available:true}]})
const qualityPill=(w:any,q:string)=>w.findAll('.watch-pill').find((b:any)=>b.text().startsWith(q))
function closeAudio(){(document.body.querySelector('.audio-modal-close') as HTMLElement).click()}

describe('the chosen quality strictly filters voices, badges and the browser release',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/beast.mkv',expires_at:'x'} as any)})

 it('the audio modal lists only the voices of the chosen quality',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  const at1080=await openAudio(w)
  expect(at1080.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  closeAudio();await flushPromises()
  await qualityPill(w,'2160p').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('2160p')
  const at2160=await openAudio(w)
  expect(at2160.map(name)).toEqual(['UKR 4K Studio','Кинопоиск HD'])
  expect(at2160.map(badge)).toEqual([true,false])
 })

 it('the browser badge belongs to the chosen quality: a 2160p voice gives no badge at 1080p',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  const items=await openAudio(w)
  // Every 1080p voice: the first track is AC-3 and the rest are later tracks — none sounds in the browser.
  expect(items.map(badge)).toEqual([false,false,false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).toBeNull()
 })

 it('a voice picked at 1080p stays in the 1080p release',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='LeDoyen')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(torrentPlaybackApi.prepareSource).not.toHaveBeenCalled()
 })

 it('UA at 1080p never jumps to 2160p and never sounds the Russian first track: it plays muted',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('«LeDoyen» звучит только в KINOSOTA Player')
  expect(notice.find('[data-testid="codec-notice-voice"]').text()).toContain('только без звука')
  const browse=notice.find('[data-testid="codec-notice-browser"]')
  expect(browse.text()).toBe('Смотреть в браузере без звука')
  expect(notice.text()).not.toContain('Смотреть в браузере с')
  await browse.trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledTimes(1)
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
  const film=w.get('video').element as HTMLVideoElement
  expect(film.muted).toBe(true)
  // The native volume control cannot bring the Russian first track in.
  film.muted=false;await w.get('video').trigger('volumechange')
  expect(film.muted).toBe(true)
 })

 it('RU at 1080p plays the Russian first track: only its codec may silence it, no voice notice',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await langPill(w,'Русская озвучка').trigger('click');await flushPromises()
  const notice=w.find('[data-testid="codec-notice"]')
  expect(notice.text()).toContain('Dolby Digital (AC-3)')
  expect(notice.find('[data-testid="codec-notice-voice"]').exists()).toBe(false)
  await notice.find('[data-testid="codec-notice-browser"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('another 1080p build leading with the Ukrainian voice never leaks into the chosen build',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac,beastUhd],qualities:[{value:'1080p',available:true},{value:'2160p',available:true}],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,false,false,false])
  closeAudio();await flushPromises()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(w.find('[data-testid="codec-notice-voice"]').exists()).toBe(true)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
 })
})

/** A browser that really decodes Dolby Digital (Edge, Safari, Chrome with the system decoder). */
const dolbyBrowser=()=>vi.stubGlobal('MediaSource',{isTypeSupported:(type:string)=>type.includes('ac-3')||type.includes('ec-3')})

describe('honest codec detection: the browser itself decides, the 🌐 badge never lies',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/beast.mkv',expires_at:'x'} as any)})

 it('«Сердце зверя» in a browser that decodes AC-3: no false warning, the first track is badged and plays with sound',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  // Only the first track: the browser never switches to a later one.
  expect(items.map(badge)).toEqual([true,false,false,false])
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('MediaCapabilities can confirm a codec the synchronous checks deny',async()=>{
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 Chrome/131.0',mediaCapabilities:{decodingInfo:async(c:any)=>({supported:String(c.audio?.contentType).includes('ac-3')})}})
  const hit=src({source_id:'s-caps',default:true,audio_tracks:[t(1,'ru','Дубляж','ac3',6)]})
  expect(releaseBrowserCompatible(hit)).toBe(false)
  await flushPromises()
  expect(releaseBrowserCompatible(hit)).toBe(true)
 })

 it('a codec the tab heard play silently is never badged again, whatever the browser claims',async()=>{
  dolbyBrowser()
  const one=src({source_id:'s-ac3-a',default:true,audio_tracks:[t(1,'ru','Дубляж','ac3',6)]})
  expect(releaseBrowserCompatible(one)).toBe(true)
  markBrowserSilent('s-ac3-a','ac3')
  expect(releaseBrowserCompatible({...one,source_id:'s-ac3-b'})).toBe(false)
 })

 it('no badge in a browser that cannot open the file: MKV in Safari, AVI anywhere',async()=>{
  const mkv=src({source_id:'s-mkv',default:true,file_name:'Film.2026.1080p.WEB-DL.mkv',audio_tracks:[t(1,'ru','Дубляж','aac')]})
  expect(releaseBrowserCompatible(mkv)).toBe(true)
  expect(releaseBrowserCompatible({...mkv,file_name:'Film.2026.DVDRip.avi'})).toBe(false)
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'})
  expect(releaseBrowserCompatible(mkv)).toBe(false)
 })
})
