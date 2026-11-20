import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import View from '@/views/TorrentCatalogView.vue'
import {markBrowserSilent,releaseBrowserCompatible,releaseName,resetBrowserSilence} from '@/composables/useTorrentWatch'
import {torrentsApi,torrentPlaybackApi} from '@/api/torrents'
import {waitForPlayer} from '@/lib/desktopLaunch'
import {resetAudioCodecKnowledge} from '@/lib/browserCodecs'
vi.mock('@/api/torrents',async original=>({...await original<any>(),torrentsApi:{access:vi.fn(),list:vi.fn(),genres:vi.fn(),detail:vi.fn()},torrentPlaybackApi:{sources:vi.fn(),prepareSource:vi.fn(),discover:vi.fn(),rebuild:vi.fn(),desktopLaunch:vi.fn(),launchStatus:vi.fn(),playbackTicket:vi.fn(),preparationStatus:vi.fn()}}))
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
afterEach(()=>{mounted.splice(0).forEach(w=>w.unmount());vi.unstubAllGlobals();resetAudioCodecKnowledge();resetBrowserSilence()})
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

 it('picking the first track keeps the release: the HEVC release keeps its notice',async()=>{
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

const desktop=(el:Element)=>!!el.querySelector('[data-testid="audio-desktop-badge"]')
/** A browser that really decodes Dolby Digital (Edge, Safari, Chrome with the system decoder). */
const dolbyBrowser=()=>vi.stubGlobal('MediaSource',{isTypeSupported:(type:string)=>type.includes('ac-3')||type.includes('ec-3')})
/** A phone: Dolby is not assumed there, the browser itself is asked. */
const ANDROID_UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
/** Real playback for 5 s of the browser stream with this many decoded audio bytes (0: the browser drops the sound). */
async function playFor(w:any,decoded:number){
 const video=w.find('video.torrent-video');let time=600
 Object.defineProperties(video.element,{paused:{configurable:true,get:()=>false},currentTime:{configurable:true,get:()=>time},webkitAudioDecodedByteCount:{configurable:true,get:()=>decoded},pause:{configurable:true,value:vi.fn()},play:{configurable:true,value:vi.fn(()=>Promise.resolve())}})
 for(const at of [600,603,605]){time=at;await video.trigger('timeupdate')}
 await flushPromises()
}

describe('the 🌐 badge and the ✓ only where the browser really sounds the track',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/ua.mkv',expires_at:'x'} as any)})

 it('an unknown codec of a plain WEB-DL lights no badge: a codec never read from the file is no proof of sound',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[src({source_id:'s-plain',voices:['Дубляж'],default:true})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('.browser-play').exists()).toBe(true)
  expect((await openAudio(w)).map(badge)).toEqual([false])
 })

 it('«Надежда» (TMDB 1058424): a codec never read from the file is no proof, a first track read as AAC or E-AC-3 is',async()=>{
  const hope=src({source_id:'hope',title:'Надежда / Hopeu / Hope (2026) WEB-DL [H.264/1080p]',file_name:'Hopeu.2026.1080p.AMZN.WEB-DL.DDP5.1.H.264.mkv',default:true,
   audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm'},{index:2,language:'ru',title:'HDrezka'}]})
  expect(releaseName(hope)).toContain('DDP5.1')
  expect(releaseBrowserCompatible(hope)).toBe(false)
  expect(releaseBrowserCompatible({...hope,file_name:null,audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm',codec:'aac',channels:2}]})).toBe(true)
  // Chrome skips E-AC-3: an E-AC-3-only file sounds nowhere in it; a browser that decodes Dolby plays it.
  expect(releaseBrowserCompatible({...hope,audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm',codec:'eac3',channels:6}]})).toBe(false)
  dolbyBrowser()
  expect(releaseBrowserCompatible({...hope,audio_tracks:[{index:1,language:'ru',title:'MVO, LostFilm',codec:'eac3',channels:6}]})).toBe(true)
  vi.unstubAllGlobals()
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

 it('«Сердце зверя» (1263337) 1080p in Chrome: the AC-3 first track is skipped, the AAC 2nd track «HDrezka (DUB)» gets 🌐 and ✓ and plays with no warning',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,true,false,false])
  expect(items.map(checked)).toEqual(['','✓','',''])
  expect(items.map(desktop)).toEqual([false,false,false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).not.toBeNull()
  expect(document.body.querySelector('[data-testid="audio-browser-mismatch"]')).toBeNull()
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('a stream that really sounds keeps the 🌐: soundWatcher counts decoded audio bytes',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  await w.find('.browser-play').trigger('click');await flushPromises()
  await playFor(w,512000)
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect((await openAudio(w)).map(badge)).toEqual([false,true,false,false])
 })

 it('only a silence this tab really heard takes the 🌐 away: the modal and the player then say why',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  await w.find('.browser-play').trigger('click');await flushPromises()
  await playFor(w,0)
  // The player pauses and names the codec the browser really dropped.
  expect(w.find('[data-testid="codec-notice"]').text()).toContain('Аудиокодеки этого фильма не поддерживаются вашим браузером: Dolby Digital (AC-3)')
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,false,false,false])
  expect(items.map(checked)).toEqual(['','','',''])
  expect(items.map(desktop)).toEqual([true,false,false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).toBeNull()
  expect(document.body.querySelector('[data-testid="audio-browser-silent"]')!.textContent).toContain('Аудиокодеки этой раздачи (Dolby Digital (AC-3)) не поддерживаются браузером')
  // AC-3 is no longer trusted in this tab: in another build the first AAC track is what sounds.
  expect(releaseBrowserCompatible({...beastAc3,source_id:'b-1080-other'})).toBe(true)
  expect(releaseBrowserCompatible({...beastAc3,source_id:'b-1080-ac3-only',audio_tracks:[t(1,'ru','Продубляж','ac3',6)]})).toBe(false)
 })

 it('a Ukrainian language pick keeps the chosen build: the browser sounds its AAC track «HDrezka (DUB)» 🌐 and says so',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  const banner=w.get('[data-testid="voice-banner"]')
  expect(banner.find('[data-testid="voice-banner-globe"]').exists()).toBe(true)
  expect(banner.text()).toContain('В браузере звучит: «HDrezka (DUB)»')
  expect(banner.text()).toContain('Чтобы слушать выбранную озвучку «LeDoyen», откройте в KINOSOTA Player')
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('LeDoyen leads another ready 1080p build: it carries the 🌐 and picking it switches the browser there',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  let items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,true,true,false])
  expect(items.map(checked)).toEqual(['','✓','',''])
  expect(items.map(desktop)).toEqual([false,false,false,false])
  expect(document.body.querySelector('[data-testid="audio-browser-switch"]')!.textContent).toContain('Или выберите «LeDoyen»')
  await pick(items.find((el)=>name(el)==='LeDoyen')!)
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 5')
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(false)
  items=await openAudio(w)
  expect(items.map(name)).toEqual(['LeDoyen','Продубляж'])
  expect(items.map(checked)).toEqual(['✓',''])
  // «Продубляж» is AC-3 in the 1080p build: Chrome never sounds it there, no build to switch to.
  expect(items.map(badge)).toEqual([true,false])
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-ua',season:null,episode:null})
 })

 it('the banner hands a voice no release leads with to KINOSOTA Player with its own track',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-ua',deep_link:'kinosota://watch?launch=id-ua',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  const banner=w.get('[data-testid="voice-banner"]')
  expect(banner.text()).toContain('«HDrezka (DUB)»')
  expect(banner.text()).toContain('«LeDoyen»')
  await banner.get('[data-testid="voice-banner-desktop"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'b-1080',season:null,episode:null,audio_lang:'uk',audio_track:3})
 })
})

/** Another ready 1080p build of «Сердце зверя» that leads with HDrezka in AAC (sounds in every browser). */
const hdLead=src({source_id:'b-hd',title:'Heart of the Beast 2026 1080p WEB-DL HDrezka',languages:['ru'],rank:5,seeders:8,
 audio_tracks:[t(1,'ru','HDrezka (DUB)','aac'),t(2,'ru','Продубляж','ac3',6)]})
/** A ready 1080p build leading with «Продубляж» in AAC. */
const dubAac=src({source_id:'b-dub-aac',title:'Heart of the Beast 2026 1080p WEBRip',languages:['ru'],rank:6,seeders:6,
 audio_tracks:[t(1,'ru','Продубляж','aac'),t(2,'ru','HDrezka (DUB)','aac')]})

describe('smart voice switch: the browser plays exactly the chosen voice when some ready build of the quality can',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/beast.mkv',expires_at:'x'} as any)})

 it('a voice another ready build leads with in a codec the browser decodes switches to that build',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,hdLead]}) as any)
  const w=await at()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(false)
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 8')
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['HDrezka (DUB)','Продубляж'])
  expect(items.map(checked)).toEqual(['✓',''])
  // «Продубляж» leads the AC-3 build, which sounds in this Dolby browser: its pick switches back there.
  expect(items.map(badge)).toEqual([true,true])
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-hd',season:null,episode:null})
  expect(torrentPlaybackApi.prepareSource).not.toHaveBeenCalled()
 })

 it('a browser that decodes AC-3 keeps the AC-3 build when its first track is picked: it already sounds there',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,dubAac]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='Продубляж')!)
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  const items=await openAudio(w)
  expect(items.map(checked)).toEqual(['✓','','',''])
  expect(items.map(badge)).toEqual([true,false,false,false])
 })

 it('the first track of a build the tab heard play silently switches to a build where the same voice leads in AAC',async()=>{
  markBrowserSilent('b-1080','ac3')
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,dubAac]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='Продубляж')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 6')
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)'])
  expect(items.map(checked)).toEqual(['✓',''])
  expect(items.map(badge)).toEqual([true,false])
 })

 it('picking «Продубляж» again switches back to the AC-3 build that leads with it (a browser that decodes AC-3)',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,hdLead]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 8')
  await pick((await openAudio(w)).find((el)=>name(el)==='Продубляж')!)
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(checked)).toEqual(['✓','','',''])
  expect(items.map(badge)).toEqual([true,true,false,false])
  expect(items.map(desktop)).toEqual([false,false,false,false])
 })

 it('no switch back to a build the tab heard play silently: the ✓ stays on the track that sounds, the pick is marked Player',async()=>{
  markBrowserSilent('b-1080','ac3')
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,hdLead]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  await pick((await openAudio(w)).find((el)=>name(el)==='Продубляж')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 8')
  const items=[...document.body.querySelectorAll('.audio-modal-item')] as HTMLElement[]
  expect(items.map(name)).toEqual(['HDrezka (DUB)','Продубляж'])
  expect(items.map(checked)).toEqual(['✓',''])
  expect(items.map(badge)).toEqual([true,false])
  expect(items.map(desktop)).toEqual([false,true])
  const box=document.body.querySelector('[data-testid="audio-browser-mismatch"]')!
  expect(box.textContent).toContain('В браузере звучит: «HDrezka (DUB)»')
  expect(box.textContent).toContain('Чтобы слушать выбранную озвучку «Продубляж», откройте в KINOSOTA Player')
  expect(box.querySelector('.audio-modal-browser-badge')).not.toBeNull()
  expect(w.find('[data-testid="voice-banner-globe"]').exists()).toBe(true)
 })

 it('in a browser that decodes AC-3 the ✓ stays on the first track 🌐, a later pick is marked Player and explained',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-hd',deep_link:'kinosota://watch?launch=id-hd',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  const items=[...document.body.querySelectorAll('.audio-modal-item')] as HTMLElement[]
  expect(items.map(checked)).toEqual(['✓','','',''])
  expect(items.map(badge)).toEqual([true,false,false,false])
  expect(items.map(desktop)).toEqual([false,true,false,false])
  const box=document.body.querySelector('[data-testid="audio-browser-mismatch"]')!
  expect(box.textContent).toContain('В браузере звучит: «Продубляж»')
  expect(box.textContent).toContain('Чтобы слушать выбранную озвучку «HDrezka (DUB)», откройте в KINOSOTA Player')
  expect(w.get('[data-testid="voice-banner"]').text()).toContain('«HDrezka (DUB)»')
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  ;(box.querySelector('[data-testid="audio-modal-desktop"]') as HTMLElement).click();await flushPromises()
  expect(document.body.querySelector('.audio-modal')).toBeNull()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'b-1080',season:null,episode:null,audio_lang:'ru',audio_track:2})
 })

 it('a build the tab heard play silently, without another build: no ✓ anywhere, the pick is marked Player and the modal says why',async()=>{
  markBrowserSilent('b-1080','ac3')
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  const items=[...document.body.querySelectorAll('.audio-modal-item')] as HTMLElement[]
  expect(items.map(checked)).toEqual(['','','',''])
  expect(items.map(badge)).toEqual([false,false,false,false])
  expect(items.map(desktop)).toEqual([false,true,false,false])
  const silent=document.body.querySelector('[data-testid="audio-browser-silent"]')!
  expect(silent.textContent).toContain('не поддерживаются браузером')
  expect(silent.textContent).toContain('Продолжите в KINOSOTA Player или смотрите без звука')
  expect(document.body.textContent).not.toContain('В браузере звучит:')
 })

 it('a build of another quality never takes over: the switch stays in the chosen quality',async()=>{
  dolbyBrowser()
  const hdUhd={...hdLead,source_id:'b-hd-uhd',quality:'2160p',title:'Heart of the Beast 2026 2160p WEB-DL HDrezka'}
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,hdUhd],qualities:[{value:'1080p',available:true},{value:'2160p',available:true}]}) as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='HDrezka (DUB)')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(document.body.querySelector('[data-testid="audio-browser-mismatch"]')).not.toBeNull()
 })

 it('a build that is not ready, that the browser cannot play, or that the tab heard play silently never takes over',async()=>{
  dolbyBrowser()
  const loading={...hdLead,source_id:'b-hd-wait',state:'queued'}
  const hevc={...hdLead,source_id:'b-hd-hevc',title:'Heart of the Beast 2026 1080p WEB-DL HEVC HDrezka'}
  const dtsHd={...hdLead,source_id:'b-hd-dts',audio_tracks:[t(1,'ru','HDrezka (DUB)','dts',6)]}
  const heardSilent={...hdLead,source_id:'b-hd-eac3',audio_tracks:[t(1,'ru','HDrezka (DUB)','eac3',6)]}
  markBrowserSilent('b-hd-eac3','eac3')
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,loading,hevc,dtsHd,heardSilent]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(badge)).toEqual([true,false,false,false])
  await pick(items.find((el)=>name(el)==='HDrezka (DUB)')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  expect(torrentPlaybackApi.prepareSource).not.toHaveBeenCalled()
  expect(document.body.querySelector('[data-testid="audio-browser-mismatch"]')).not.toBeNull()
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
  expect(at2160.map(checked)).toEqual(['✓',''])
 })

 it('the browser badge belongs to the chosen quality: a voice leading only a 2160p build gives no badge at 1080p',async()=>{
  const uhdLeDoyen={...beastUhd,source_id:'b-2160-ua',audio_tracks:[t(1,'uk','LeDoyen','aac'),t(2,'ru','Кинопоиск HD','aac')]}
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,uhdLeDoyen],qualities:[{value:'1080p',available:true},{value:'2160p',available:true}]}) as any)
  const w=await at()
  const items=await openAudio(w)
  // Only the 1080p AAC track «HDrezka (DUB)» sounds here; LeDoyen leads a 2160p build, never a 1080p one.
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([false,true,false,false])
  await pick(items.find((el)=>name(el)==='LeDoyen')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(document.body.querySelector('[data-testid="audio-browser-switch"]')).toBeNull()
 })

 it('a voice picked at 1080p stays in the 1080p release',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='LeDoyen')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(torrentPlaybackApi.prepareSource).not.toHaveBeenCalled()
 })

 it('UA at 1080p never jumps to 2160p: the browser keeps the 1080p build and sounds its AAC track «HDrezka (DUB)»',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(w.get('[data-testid="voice-banner"]').text()).toContain('В браузере звучит: «HDrezka (DUB)»')
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledTimes(1)
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('RU at 1080p plays the Russian AAC track with sound: no warning, no voice banner',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(twoQualities() as any)
  const w=await at()
  await langPill(w,'Русская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(false)
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('another 1080p build leading with the Ukrainian voice never leaks into the chosen build through the language pill',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3,ukAac,beastUhd],qualities:[{value:'1080p',available:true},{value:'2160p',available:true}],languages:[{value:'ru',available:true},{value:'uk',available:true}]}) as any)
  const w=await at()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  // LeDoyen leads the ready 1080p Ukrainian build: picking it would switch there, so it has the 🌐.
  expect(items.map(badge)).toEqual([false,true,true,false])
  closeAudio();await flushPromises()
  await langPill(w,'Украинская озвучка').trigger('click');await flushPromises()
  expect(w.find('[data-testid="watch-status"]').text()).toContain('1080p')
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 20')
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(true)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  expect((await openAudio(w)).map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
 })
})

describe('honest codec detection: the browser itself decides, the 🌐 badge never lies',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/beast.mkv',expires_at:'x'} as any)})

 it('«Сердце зверя» in a browser that decodes AC-3: no false warning, the first track is badged and plays with sound',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','HDrezka (DUB)','LeDoyen','English'])
  expect(items.map(badge)).toEqual([true,false,false,false])
  expect(items.map(checked)).toEqual(['✓','','',''])
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-1080',season:null,episode:null})
 })

 it('Chrome answers «» for AC-3 / E-AC-3 / DTS / TrueHD: only a file with an AAC / MP3 / Opus / Vorbis / FLAC track sounds',async()=>{
  const spy=vi.spyOn(HTMLMediaElement.prototype,'canPlayType').mockImplementation(()=>'')
  try{
   expect(releaseBrowserCompatible(src({source_id:'s-c-1',default:true,audio_tracks:[t(1,'ru','Дубляж','ac3',6)]}))).toBe(false)
   expect(releaseBrowserCompatible(src({source_id:'s-c-2',default:true,audio_tracks:[t(1,'ru','Дубляж','eac3',6)]}))).toBe(false)
   expect(releaseBrowserCompatible(src({source_id:'s-c-3',default:true,audio_tracks:[t(1,'ru','Дубляж','aac')]}))).toBe(true)
   expect(releaseBrowserCompatible(src({source_id:'s-c-4',default:true,audio_tracks:[t(1,'ru','Дубляж','dts',6)]}))).toBe(false)
   expect(releaseBrowserCompatible(src({source_id:'s-c-5',default:true,audio_tracks:[t(1,'ru','Дубляж','truehd',8)]}))).toBe(false)
   expect(releaseBrowserCompatible(src({source_id:'s-c-6',default:true,audio_tracks:[t(1,'ru','Дубляж','flac',2)]}))).toBe(true)
   // The demuxer skips the AC-3 first track and sounds the AAC second one.
   expect(releaseBrowserCompatible(src({source_id:'s-c-7',default:true,audio_tracks:[t(1,'ru','Продубляж','ac3',6),t(2,'ru','WinMedia','aac')]}))).toBe(true)
   expect(releaseBrowserCompatible(src({source_id:'s-c-8',default:true,audio_tracks:[t(1,'ru','Дубляж','ac3',6),t(2,'en','Original','dts',6)]}))).toBe(false)
  }finally{spy.mockRestore()}
 })

 it('MediaCapabilities never lights the 🌐: only what the browser itself says it decodes counts',async()=>{
  vi.stubGlobal('navigator',{userAgent:ANDROID_UA,mediaCapabilities:{decodingInfo:async()=>({supported:true})}})
  const hit=src({source_id:'s-caps',default:true,audio_tracks:[t(1,'ru','Дубляж','ac3',6)]})
  expect(releaseBrowserCompatible(hit)).toBe(false)
  await flushPromises()
  expect(releaseBrowserCompatible(hit)).toBe(false)
 })

 it('«Сердце зверя»: canPlayType answers «maybe» for AC-3, the first track gets the 🌐 badge',async()=>{
  const spy=vi.spyOn(HTMLMediaElement.prototype,'canPlayType').mockImplementation((type:string)=>type.includes('ac-3')||type.includes('ec-3')?'maybe':'')
  try{
   vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastAc3]}) as any)
   const w=await at()
   expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
   const items=await openAudio(w)
   expect(items.map(badge)).toEqual([true,false,false,false])
   expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).not.toBeNull()
  }finally{spy.mockRestore()}
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

/** «Сердце зверя» on production: an AC-3 dub first, WinMedia in AAC second. */
const beastWinMedia=src({source_id:'b-wm',title:'Heart of the Beast [2026, WEB-DL 1080p]',file_name:'Heart.of.the.Beast.2026.1080p.WEB-DL.mkv',languages:['ru','en'],default:true,
 audio_tracks:[t(1,'ru','Продубляж','ac3',6),t(2,'ru','WinMedia','aac'),t(3,'en','English','ac3',6)]})
/** «Терминатор 2» (280): every track AC-3 / DTS — Chrome plays it without sound. */
const terminator=src({source_id:'t2',title:'Terminator 2: Judgment Day (1991) BDRip 1080p',file_name:'Terminator.2.1991.1080p.BDRip.mkv',languages:['ru','en'],default:true,
 audio_tracks:[t(1,'ru','Дубляж','ac3',6),t(2,'ru','MVO','dts',6),t(3,'en','Original','dts',6)]})

describe('honest prestart sound check for MKV: the first track of a codec this browser decodes is what sounds',()=>{
 beforeEach(()=>{vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/film.mkv',expires_at:'x'} as any)})

 it('«Сердце зверя»: the 🌐 and the ✓ sit on WinMedia (2nd, AAC), the AC-3 tracks get none, Play streams this build with no warning',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastWinMedia]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(false)
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Продубляж','WinMedia','English'])
  expect(items.map(badge)).toEqual([false,true,false])
  expect(items.map(checked)).toEqual(['','✓',''])
  expect(items.map(desktop)).toEqual([false,false,false])
  closeAudio();await flushPromises()
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'b-wm',season:null,episode:null})
 })

 it('«Сердце зверя»: picking the AC-3 «Продубляж» says honestly what the browser sounds and hands the pick to KINOSOTA Player',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastWinMedia]}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-wm',deep_link:'kinosota://watch?launch=id-wm',expires_at:'x'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const w=await at()
  await pick((await openAudio(w)).find((el)=>name(el)==='Продубляж')!)
  const items=[...document.body.querySelectorAll('.audio-modal-item')] as HTMLElement[]
  expect(items.map(badge)).toEqual([false,true,false])
  expect(items.map(checked)).toEqual(['','✓',''])
  expect(items.map(desktop)).toEqual([true,false,false])
  const box=document.body.querySelector('[data-testid="audio-browser-mismatch"]')!
  expect(box.textContent).toContain('В браузере звучит: «WinMedia»')
  expect(box.querySelector('.audio-modal-browser-badge')).not.toBeNull()
  expect(box.textContent).toContain('Чтобы слушать выбранную озвучку «Продубляж», откройте в KINOSOTA Player')
  expect(w.get('[data-testid="voice-banner"]').text()).toContain('В браузере звучит: «WinMedia»')
  ;(box.querySelector('[data-testid="audio-modal-desktop"]') as HTMLElement).click();await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'b-wm',season:null,episode:null,audio_lang:'ru',audio_track:1})
 })

 it('«Терминатор 2»: no track has a codec the browser decodes — no 🌐 anywhere and the warning shows before Play',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[terminator]}) as any)
  const w=await at()
  const notice=w.get('[data-testid="codec-notice"]')
  expect(notice.text()).toContain('Аудиокодеки этого фильма не поддерживаются вашим браузером: Dolby Digital (AC-3) и DTS')
  expect(notice.text()).toContain('продолжите в KINOSOTA Player или смотрите без звука')
  expect(notice.get('[data-testid="codec-notice-browser"]').text()).toBe('Смотреть в браузере без звука')
  expect(w.find('.browser-play').exists()).toBe(false)
  expect(torrentPlaybackApi.playbackTicket).not.toHaveBeenCalled()
  const items=await openAudio(w)
  expect(items.map(name)).toEqual(['Дубляж','MVO','Original'])
  expect(items.map(badge)).toEqual([false,false,false])
  expect(items.map(checked)).toEqual(['','',''])
  expect(document.body.querySelector('[data-testid="audio-browser-legend"]')).toBeNull()
  expect(document.body.querySelector('[data-testid="audio-browser-silent"]')!.textContent).toContain('не поддерживаются браузером')
  expect(document.body.textContent).not.toContain('В браузере звучит:')
 })

 it('«Терминатор 2» in a browser that decodes AC-3 (Safari, Edge): the AC-3 dub gets the 🌐 and plays without a warning',async()=>{
  dolbyBrowser()
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[terminator]}) as any)
  const w=await at()
  expect(w.find('[data-testid="codec-notice"]').exists()).toBe(false)
  const items=await openAudio(w)
  expect(items.map(badge)).toEqual([true,false,false])
  expect(items.map(checked)).toEqual(['✓','',''])
 })

 it('smart switch: a voice that sounds first in another ready build of the quality carries the 🌐 there',async()=>{
  const prodAac=src({source_id:'b-prod-aac',title:'Heart of the Beast 2026 1080p WEBRip',file_name:'Heart.of.the.Beast.2026.1080p.WEBRip.mkv',languages:['ru'],rank:6,seeders:6,
   audio_tracks:[t(1,'ru','Продубляж','aac')]})
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({sources:[beastWinMedia,prodAac]}) as any)
  const w=await at()
  const items=await openAudio(w)
  // «Продубляж» is AC-3 here, but it is the sounding (AAC) track of the other ready 1080p build.
  expect(items.map(badge)).toEqual([true,true,false])
  await pick(items.find((el)=>name(el)==='Продубляж')!)
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 6')
  expect(w.find('[data-testid="voice-banner"]').exists()).toBe(false)
 })
})

describe('rebuild: the spinner next to «Смотреть» and the dead-source warning',()=>{
 const healthy=src({source_id:'s-ok',title:'Как Витька Чеснок вёз Лёху Штыря в дом инвалидов 2017 1080p WEB-DL',seeders:30,health:'healthy',warning:null,default:true})
 const stalled=src({source_id:'s-dead',title:'Как Витька Чеснок вёз Лёху Штыря в дом инвалидов 2017 1080p WEB-DL',seeders:5,health:'degraded',warning:'Мало раздающих или поток медленно отвечает. Можно пересобрать источник',default:true})
 it('renders a round RefreshCw button right next to «Смотреть» with its tooltip',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-ok',sources:[healthy],health:'healthy',warning:null}) as any)
  const w=await at()
  const actions=w.find('.watch-actions')
  const button=actions.find('[data-testid="rebuild-button"]')
  expect(button.exists()).toBe(true)
  expect(button.attributes('title')).toBe('Пересобрать источник (подобрать рабочую раздачу)')
  expect(button.attributes('aria-label')).toBe('Пересобрать источник (подобрать рабочую раздачу)')
  expect(button.find('svg').exists()).toBe(true)
  expect(button.attributes('aria-busy')).toBe('false')
  expect(actions.find('[data-testid="watch-button"]').exists()).toBe(true)
  // A healthy release: no warning, green seeders.
  expect(w.find('[data-testid="source-warning"]').exists()).toBe(false)
  expect(w.find('[data-testid="watch-seeders"]').classes()).not.toContain('warn')
 })

 it('a click spins the icon, says «Подбираем рабочий источник…» and swaps in the working release from the answer',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-dead',sources:[stalled],health:'degraded',warning:stalled.warning}) as any)
  let answer:(v:any)=>void=()=>{}
  vi.mocked(torrentPlaybackApi.rebuild).mockReturnValue(new Promise(r=>{answer=r}) as any)
  const w=await at()
  await w.find('[data-testid="rebuild-button"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.rebuild).toHaveBeenCalledWith('movie',1,'s-dead')
  const busy=w.find('[data-testid="rebuild-button"]')
  expect(busy.attributes('aria-busy')).toBe('true')
  expect(busy.find('svg').classes()).toContain('spinning')
  expect(w.find('[data-testid="watch-hint"]').text()).toBe('Подбираем рабочий источник…')
  expect(w.find('[data-testid="watch-hint-spinner"]').exists()).toBe(true)
  const fresh={...stalled,source_id:'s-new',seeders:42,health:'healthy',warning:null,default:true}
  answer(view({selected_source_id:'s-new',sources:[fresh,{...stalled,default:false,health:'dead'}],health:'healthy',warning:null,rebuild:'promoted'}))
  await flushPromises()
  const done=w.find('[data-testid="rebuild-button"]')
  expect(done.attributes('aria-busy')).toBe('false')
  expect(done.find('svg').classes()).not.toContain('spinning')
  expect(w.find('[data-testid="watch-status"]').text()).toContain('▲ 42')
  expect(w.find('[data-testid="source-warning"]').exists()).toBe(false)
  expect(w.text()).toContain('Источник пересобран: подставлена рабочая раздача')
  expect(torrentPlaybackApi.rebuild).toHaveBeenCalledTimes(1)
 })

 it.each([['degraded','text-amber'],['dead','text-red']])('a %s release shows the warning badge under «Смотреть» and amber seeders',async(health,tone)=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-dead',sources:[{...stalled,health}],health,warning:stalled.warning}) as any)
  const w=await at()
  const badge=w.find('[data-testid="source-warning"]')
  expect(badge.exists()).toBe(true)
  expect(badge.classes()).toContain('source-warning-badge')
  expect(badge.classes()).toContain(tone)
  expect(badge.find('svg').exists()).toBe(true)
  expect(badge.text()).toBe('Раздача может не запуститься. Нажмите 🔄 рядом со «Смотреть», чтобы пересобрать')
  expect(w.find('[data-testid="watch-seeders"]').classes()).toContain('warn')
 })

 it('few seeders light the seeders amber even before the health check judged the release',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s1',sources:[src({seeders:3})]}) as any)
  const w=await at()
  expect(w.find('[data-testid="watch-seeders"]').classes()).toContain('warn')
  expect(w.find('[data-testid="watch-status"]').text()).toBe('✓ Выбрано: 1080p WEB-DL · ▲ 3 сида · 7,5 ГБ')
 })

 it('a failed rebuild stops the spinner and says why',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({selected_source_id:'s-dead',sources:[stalled],health:'degraded'}) as any)
  vi.mocked(torrentPlaybackApi.rebuild).mockRejectedValue(new Error('network'))
  const w=await at()
  await w.find('[data-testid="rebuild-button"]').trigger('click');await flushPromises()
  expect(w.find('[data-testid="rebuild-button"]').attributes('aria-busy')).toBe('false')
  expect(w.text()).toContain('Не удалось пересобрать источник. Повторите попытку.')
 })
})
