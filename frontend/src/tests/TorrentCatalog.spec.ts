import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import View from '@/views/TorrentCatalogView.vue'
import {torrentsApi,torrentPlaybackApi,torrentPath} from '@/api/torrents'
import {openDeepLink,waitForPlayer,DESKTOP_PLAYER_TEXT} from '@/lib/desktopLaunch'
vi.mock('@/api/torrents',async original=>({...await original<any>(),torrentsApi:{access:vi.fn(),list:vi.fn(),genres:vi.fn(),detail:vi.fn()},torrentPlaybackApi:{sources:vi.fn(),prepareSource:vi.fn(),discover:vi.fn(),desktopLaunch:vi.fn(),launchStatus:vi.fn(),playbackTicket:vi.fn(),preparationStatus:vi.fn()}}))
vi.mock('@/lib/desktopLaunch',async original=>({...await original<any>(),openDeepLink:vi.fn(),waitForPlayer:vi.fn()}))
const entry={tmdb_id:1,kind:'movie',title:'Название фильма',year:2026,original_title:'Original',rating:8,overview:'Описание',poster:null,backdrop:null,playback_available:false} as const
const response={provider:'tmdb',mode:'metadata_only',items:[entry],total:65,total_pages:4,page:1} as const
const view=(over:any={})=>({allowed:true,status:{status:'not_queued',playable:false,progress:0,start_ms:null},discovering:false,in_library:false,selected_source_id:null,sources:[],qualities:['2160p','1080p','720p','480p'].map(value=>({value,available:false})),languages:['ru','uk','en'].map(value=>({value,available:false})),episodes:[],...over})
const src=(over:any={})=>({source_id:'s1080',title:'Film 1080p WEB-DL',quality:'1080p',source_type:'WEB-DL',languages:['ru','en'],seeders:25,size_bytes:8e9,state:'ready',progress:100,start_ms:850,default:true,episodes:[],file_count:1,...over})
const mounted:any[]=[]
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
beforeEach(()=>{vi.resetAllMocks();vi.mocked(torrentsApi.access).mockResolvedValue({allowed:true,requirement:'pro',playback_available:false});vi.mocked(torrentsApi.list).mockResolvedValue(response as any);vi.mocked(torrentsApi.genres).mockResolvedValue({items:[{id:18,name:'Драма'}]});vi.mocked(torrentsApi.detail).mockResolvedValue({...entry,genres:[{id:18,name:'Драма'}]});vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view() as any);vi.mocked(torrentPlaybackApi.discover).mockResolvedValue({result:'queued'} as any)})
async function at(path:string){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/torrents',component:View},{path:'/torrents/:kind/:id',component:View},{path:'/',component:{template:'<p>Telegram</p>'}},{path:'/profile',component:{template:'<p>Profile</p>'}}]});await router.push(path);await router.isReady();const w=mount(View,{global:{plugins:[router]}});mounted.push(w);await flushPromises();return{w,router}}
describe('isolated metadata catalogue',()=>{
 it('builds three TMDB rails and keeps every card in torrent namespace',async()=>{const{w}=await at('/torrents');expect(w.findAll('.torrent-rail')).toHaveLength(3);expect(torrentsApi.list).toHaveBeenCalledTimes(4);expect(w.text()).not.toContain('ещё не подключено');expect(w.findAll('.torrent-card-link').every(a=>a.attributes('href')!.startsWith('/torrents/'))).toBe(true);expect(w.find('video').exists()).toBe(false)})
 it('preserves kind, year and genre through pagination',async()=>{const{w,router}=await at('/torrents?kind=tv&genre=18&year=2026&page=2');expect(torrentsApi.list).toHaveBeenLastCalledWith({kind:'tv',page:2,genre:'18',year:'2026'},expect.anything());await w.findAll('.torrent-pagination button')[1].trigger('click');await flushPromises();expect(router.currentRoute.value.query).toMatchObject({kind:'tv',genre:'18',year:'2026',page:'3'})})
 it('has only year and rating controls; no genre/type duplicate',async()=>{const{w}=await at('/torrents?kind=movie');expect(w.findAll('select')).toHaveLength(2);expect(w.findAll('.filter-fields label').map(x=>x.text().split('Все')[0])).toHaveLength(2);expect(w.find('#torrent-year').exists()).toBe(true);expect(w.find('#torrent-rating').exists()).toBe(true);expect(torrentsApi.genres).not.toHaveBeenCalled();expect(w.find('.torrent-filters summary svg').exists()).toBe(true);expect(w.find('details').attributes('open')).toBeUndefined()})
 it('year and rating changes reset page but preserve header navigation',async()=>{const{w,router}=await at('/torrents?kind=tv&genre=18&page=3');await w.find('#torrent-year').setValue('2020');await flushPromises();await w.find('#torrent-rating').setValue('8');await flushPromises();expect(router.currentRoute.value.query).toEqual({kind:'tv',genre:'18',year:'2020',rating:'8'});expect(torrentsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({rating:'8',year:'2020',genre:'18',kind:'tv'}),expect.anything())})
 it('reset preserves kind and genre from header, removes year rating and page',async()=>{const{w,router}=await at('/torrents?kind=tv&genre=18&year=2020&rating=8&page=3');await w.find('.reset-filters').trigger('click');await flushPromises();expect(router.currentRoute.value.query).toEqual({kind:'tv',genre:'18'})})
 it('restores decimal and boundary ratings from shared URLs',async()=>{for(const value of ['0','8.5','10']){const{w}=await at('/torrents?kind=movie&rating='+value);expect((w.find('#torrent-rating').element as HTMLSelectElement).value).toBe(value);expect(torrentsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({rating:value}),expect.anything())}})
 it('rating persists on pagination and browser navigation',async()=>{const{w,router}=await at('/torrents?kind=movie&rating=7&page=2');await w.findAll('.torrent-pagination button')[1].trigger('click');await flushPromises();expect(router.currentRoute.value.query).toEqual({kind:'movie',rating:'7',page:'3'});await router.push('/torrents?kind=tv');await flushPromises();expect((w.find('#torrent-rating').element as HTMLSelectElement).value).toBe('');expect(w.findAll('select')).toHaveLength(2)})
 it('shows metadata count, never source availability',async()=>{const{w}=await at('/torrents?kind=movie');expect(w.text()).toContain('В каталоге TMDB: 65');expect(w.text()).toContain('Не количество доступных раздач')})
 it('opens details with a real watch action and without a stub player',async()=>{const{w}=await at('/torrents/tv/87739');expect(torrentsApi.detail).toHaveBeenCalledWith('tv','87739',expect.anything());expect(torrentPlaybackApi.sources).toHaveBeenCalled();expect(w.text()).not.toContain('ещё не подключено');expect(w.find('[data-testid="watch-button"]').text()).toBe('▶ Смотреть');expect(w.text()).toContain('Добавим в кинотеку и сразу начнём поиск раздач');expect(w.find('[data-testid="torrent-player"]').exists()).toBe(false);expect(w.find('video').exists()).toBe(false);expect(w.findAll('a').some(a=>a.attributes('href')!.includes('/torrents?kind=movie&genre=18'))).toBe(true)})
 it('renders useful empty state',async()=>{vi.mocked(torrentsApi.list).mockResolvedValue({...response,items:[],total:0,total_pages:0} as any);const{w}=await at('/torrents?kind=movie');expect(w.text()).toContain('По этим фильтрам ничего не найдено');expect(w.find('.torrent-pagination').exists()).toBe(false)})
 it('does not show stale counts on errors and supports retry',async()=>{vi.mocked(torrentsApi.list).mockRejectedValueOnce(new Error('503'));const{w}=await at('/torrents?kind=movie');expect(w.find('[role=alert]').exists()).toBe(true);expect(w.text()).not.toContain('В каталоге TMDB:');await w.find('[role=alert] button').trigger('click');await flushPromises();expect(w.find('.torrent-grid').exists()).toBe(true)})
 it('ignores late responses after navigation',async()=>{let resolve:any;vi.mocked(torrentsApi.list).mockImplementationOnce(()=>new Promise(r=>resolve=r));const{w,router}=await at('/torrents?kind=movie');await router.push('/torrents?kind=tv');await flushPromises();resolve({...response,total:999});await flushPromises();expect(w.find('.results-heading').text()).not.toContain('999');expect(w.text()).toContain('Сериалы TMDB')})
 it('shows a useful fallback when a poster fails to load',async()=>{vi.mocked(torrentsApi.list).mockResolvedValue({...response,items:[{...entry,poster:'https://image.tmdb.org/t/p/w342/example.jpg'}]} as any);const{w}=await at('/torrents?kind=movie');await w.find('.torrent-card img').trigger('error');expect(w.find('.poster-missing').text()).toContain('Постер пока недоступен');expect(w.find('.torrent-card img').exists()).toBe(false)})
 it('does not label a historical year as current new releases',async()=>{const{w}=await at('/torrents?kind=movie&year=2020');expect(w.find('h1').text()).toBe('Год 2020 · фильмы');expect(w.find('.torrent-tabs').exists()).toBe(false)})
 it('separates movie and TV identity with equal TMDB number',()=>{expect(torrentPath({...entry,kind:'tv'})).not.toBe(torrentPath(entry))})
})

describe('torrent catalogue redesign',()=>{
 it('contains no implementation-provider wording for users',async()=>{const{w}=await at('/torrents');expect(w.text()).not.toMatch(/Telegram|Телеграм/i);expect(w.find('.torrent-mode,.torrent-tabs,.torrent-notice,.torrent-tools,input').exists()).toBe(false);expect(w.find('.rail-items.torrent-grid').exists()).toBe(true)})
 it('searches by title with honest rating limitation and no duplicate type control',async()=>{const{w,router}=await at('/torrents?kind=movie&q=Palmer&page=2&rating=8');expect(torrentsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({q:'Palmer',kind:'movie',page:2}),expect.anything());expect(vi.mocked(torrentsApi.list).mock.calls.at(-1)![0].rating).toBeUndefined();expect(w.find('#torrent-rating').attributes('disabled')).toBeDefined();expect(w.find('#torrent-year').attributes('disabled')).toBeUndefined();expect(w.text()).toContain('рейтинг в этом режиме не применяется');await w.findAll('.torrent-pagination button')[1].trigger('click');await flushPromises();expect(router.currentRoute.value.query.q).toBe('Palmer')})
 it('clearing title search preserves type and year without a duplicate input',async()=>{const{w,router}=await at('/torrents?kind=tv&q=Lupin&year=2020&page=2');expect(w.find('input').exists()).toBe(false);await w.find('.search-context button').trigger('click');await flushPromises();expect(router.currentRoute.value.query).toEqual({kind:'tv',year:'2020'})})
 it('refreshes hero at server slot boundary without reloading catalogue',async()=>{vi.useFakeTimers();try{vi.setSystemTime(new Date('2026-10-31T03:59:59Z'));let heroCalls=0;vi.mocked(torrentsApi.list).mockImplementation(async filters=>filters.collection?({...response,items:[{...entry,tmdb_id:++heroCalls,title:'Hero '+heroCalls}],refresh_at:heroCalls===1?'2026-10-31T04:00:00Z':'2026-10-31T08:00:00Z'} as any):response as any);const{w}=await at('/torrents');expect(w.find('.hero-copy h2').text()).toBe('Hero 1');await vi.advanceTimersByTimeAsync(1000);await flushPromises();expect(w.find('.hero-copy h2').text()).toBe('Hero 2');expect(w.findAll('.torrent-rail')).toHaveLength(3);w.unmount()}finally{vi.useRealTimers()}})
 it('hero failure does not remove catalogue grids or invent a fallback movie',async()=>{vi.mocked(torrentsApi.list).mockImplementation(async filters=>{if(filters.collection)throw Error('503');return response as any});const{w}=await at('/torrents');expect(w.find('.torrent-hero').exists()).toBe(false);expect(w.findAll('.torrent-rail')).toHaveLength(3)})
})

describe('reference hierarchy',()=>{
 it('uses portrait posters on home and in catalogue',async()=>{vi.mocked(torrentsApi.list).mockResolvedValue({...response,items:[{...entry,poster:'poster.jpg',backdrop:'backdrop.jpg'}]} as any);const{w,router}=await at('/torrents');expect(w.find('.torrent-card img').attributes('src')).toBe('poster.jpg');expect(w.find('.torrent-card .torrent-card-rating').text()).toContain('8');expect(w.find('.hero-copy a').text()).toContain('Смотреть');await router.push('/torrents?kind=movie');await flushPromises();expect(w.find('.torrent-card img').attributes('src')).toBe('poster.jpg');expect(w.find('.torrent-card-landscape').exists()).toBe(false)})
})


describe('torrent PRO message without changing public browsing',()=>{
 it('shows the dedicated PRO message for a free user/guest, while keeping metadata and bookmarks',async()=>{
  vi.mocked(torrentsApi.access).mockResolvedValue({allowed:false,requirement:'pro',playback_available:false});const{w}=await at('/torrents/movie/1');
  expect(w.find('.torrent-detail h1').text()).toBe('Название фильма');expect(w.find('.subscription-player').exists()).toBe(true);
  expect(w.text()).toContain('Фильмы из раздела «Торренты» доступны только с подпиской PRO');expect(w.text()).toContain('без рекламы');expect(w.text()).toContain('Доступные озвучки и качество зависят от конкретной раздачи');
  expect(w.find('.subscription-primary').attributes('href')).toBe('/profile?tab=billing');expect(w.find('.subscription-secondary').attributes('href')).toBe('/torrents');expect(w.find('video').exists()).toBe(false)
 });
 it('does not query rights or block any catalogue section',async()=>{vi.mocked(torrentsApi.access).mockResolvedValue({allowed:false,requirement:'pro',playback_available:false});for(const path of ['/torrents','/torrents?kind=movie','/torrents?kind=tv','/torrents?kind=movie&genre=18']){const{w}=await at(path);expect(w.find('.subscription-player').exists()).toBe(false);expect(w.find('.torrent-grid').exists()).toBe(true)}expect(torrentsApi.access).not.toHaveBeenCalled()});
 it('does not pretend that a PRO account means a playable source exists',async()=>{vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({in_library:true,status:{status:'searching',playable:false,progress:35,start_ms:null}}) as any);const{w}=await at('/torrents/movie/1');expect(w.find('.subscription-player').exists()).toBe(false);expect(w.find('[data-testid="poster-progress"]').text()).toContain('Поиск раздач');expect(w.find('[data-testid="poster-progress"]').text()).toContain('35%');expect(w.find('[data-testid="watch-button"]').attributes('disabled')).toBeDefined();expect(w.find('[data-testid="torrent-player"]').exists()).toBe(false);expect(w.find('video').exists()).toBe(false)});
 it('keeps metadata visible and offers retry after an access check failure',async()=>{vi.mocked(torrentsApi.access).mockRejectedValueOnce(new Error('503'));const{w}=await at('/torrents/movie/1');expect(w.find('.torrent-detail h1').exists()).toBe(true);expect(w.find('[role=alert]').text()).toContain('Не удалось проверить доступ');expect(w.find('.subscription-player').exists()).toBe(false);expect(torrentPlaybackApi.sources).not.toHaveBeenCalled();await w.find('[role=alert] button').trigger('click');await flushPromises();expect(w.find('[role=alert]').exists()).toBe(false);expect(torrentPlaybackApi.sources).toHaveBeenCalledTimes(1);expect(w.find('[data-testid="watch-button"]').attributes('disabled')).toBeUndefined()});
 it('ignores a late access check after navigating back to a catalogue',async()=>{let resolve:any;vi.mocked(torrentsApi.access).mockImplementationOnce(()=>new Promise(r=>resolve=r));const{w,router}=await at('/torrents/movie/1');await router.push('/torrents?kind=tv');await flushPromises();resolve({allowed:false});await flushPromises();expect(w.find('.subscription-player').exists()).toBe(false);expect(w.find('.torrent-grid').exists()).toBe(true)});
})

describe('torrent watch panel and live preparation',()=>{
 const ready=(over:any={})=>view({in_library:true,status:{status:'playable',playable:true,progress:100,start_ms:850},sources:[src()],qualities:[{value:'2160p',available:false},{value:'1080p',available:true},{value:'720p',available:false},{value:'480p',available:false}],languages:[{value:'ru',available:true},{value:'uk',available:false},{value:'en',available:true}],...over})
 it('shows the preparation steps under the poster and a green ready state with the start time',async()=>{
  for(const [status,progress,label] of [['queued',10,'В очереди'],['searching',35,'Поиск раздач'],['loading',75,'Проверка и буферизация']] as const){
   vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(view({in_library:true,status:{status,playable:false,progress,start_ms:null}}) as any)
   const{w}=await at('/torrents/movie/1');const bar=w.find('[data-testid="poster-progress"]')
   expect(bar.find('.progress-label').text()).toBe(label);expect(bar.find('.progress-percent').text()).toBe(progress+'%');expect(bar.attributes('aria-valuenow')).toBe(String(progress))
   expect(w.find('[data-testid="watch-button"]').attributes('disabled')).toBeDefined()
  }
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(ready() as any)
  const{w}=await at('/torrents/movie/1');const bar=w.find('[data-testid="poster-progress"]')
  expect(bar.text()).toBe('Готово · старт 850 мс');expect(bar.classes()).toContain('is-ready');expect(bar.find('.progress-percent').exists()).toBe(false)
 })
 it('puts «▶ Смотреть» next to the bookmark with the chosen source and quality / language pills',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(ready({sources:[src(),src({source_id:'s720',title:'Film 720p',quality:'720p',source_type:'WEBRip',languages:['uk'],seeders:40,state:'candidate',progress:0,start_ms:null,default:false})],qualities:[{value:'2160p',available:false},{value:'1080p',available:true},{value:'720p',available:true},{value:'480p',available:false}],languages:[{value:'ru',available:true},{value:'uk',available:true},{value:'en',available:true}]}) as any)
  vi.mocked(torrentPlaybackApi.prepareSource).mockResolvedValue({} as any)
  const{w}=await at('/torrents/movie/1');const panel=w.find('[data-testid="watch-panel"]')
  expect(panel.find('.watch-actions [data-testid="watch-button"]').text()).toBe('▶ Смотреть');expect(panel.find('.watch-actions .library-button').exists()).toBe(true)
  expect(panel.find('[data-testid="watch-button"]').attributes('disabled')).toBeUndefined()
  expect(panel.find('[data-testid="watch-selected"]').text()).toBe('✓ Выбрано: 1080p WEB-DL · ▲ 25 сид')
  expect(panel.text()).toContain('КАЧЕСТВО');expect(panel.text()).toContain('ЯЗЫК')
  const pills=panel.findAll('.watch-pill');expect(pills.map(p=>p.text())).toEqual(['2160p','1080p','720p','480p','RU','UA','EN']);expect(pills[4].find('.watch-flag.flag-ru').exists()).toBe(true);expect(pills[5].find('.watch-flag.flag-uk').exists()).toBe(true);expect(pills[6].find('.watch-flag').exists()).toBe(false);expect(pills[4].attributes('title')).toBe('Русская озвучка')
  expect(pills[0].attributes('disabled')).toBeDefined();expect(pills[1].attributes('aria-pressed')).toBe('true');expect(pills[4].attributes('aria-pressed')).toBe('true')
  expect(w.find('.browser-play').text()).toBe('▶ Смотреть в браузере')
  await pills[2].trigger('click');await flushPromises()
  expect(torrentPlaybackApi.prepareSource).toHaveBeenCalledWith('s720')
  expect(panel.find('[data-testid="watch-selected"]').text()).toBe('✓ Выбрано: 720p WEBRip · ▲ 40 сид');expect(panel.findAll('.watch-pill')[5].attributes('aria-pressed')).toBe('true')
  expect(w.find('[data-testid="poster-progress"]').text()).toContain('Раздача не подготовлена');expect(w.find('[data-testid="watch-button"]').text()).toBe('▶ Подготовить раздачу')
  expect(w.find('[data-testid="torrent-player"]').exists()).toBe(false)
 })
 it('opens KINOSOTA Player through a one-time launch link and offers the install dialog when nothing answered',async()=>{
  expect(DESKTOP_PLAYER_TEXT).toBe('Для просмотра фильмов в максимальном качестве и со всеми аудиодорожками скачайте и установите приложение KINOSOTA Player. Плеер уже доступен для скачивания в вашем Профиле')
  const launch='0f6c1e8e-1b2c-4d3e-8f00-000000000155'
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(ready() as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:launch,deep_link:'kinosota://watch?launch='+launch,expires_at:'2026-11-03T12:00:00Z'} as any)
  vi.mocked(torrentPlaybackApi.playbackTicket).mockResolvedValue({stream_url:'https://media.example/s.mp4',expires_at:'2026-11-03T12:00:00Z'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(false)
  const{w}=await at('/torrents/movie/1')
  await w.find('[data-testid="watch-button"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'movie',tmdb_id:1,source_id:'s1080',season:null,episode:null,audio_lang:'ru'})
  expect(openDeepLink).toHaveBeenCalledWith('kinosota://watch?launch='+launch);expect(vi.mocked(waitForPlayer).mock.calls[0][0]).toBe(launch)
  const modal=document.body.querySelector('[data-testid="desktop-player-modal"]')!
  expect(modal.querySelector('#desktop-modal-text')!.textContent).toBe(DESKTOP_PLAYER_TEXT)
  expect(modal.querySelector('a.desktop-modal-primary')!.getAttribute('href')).toBe('/profile?tab=player')
  ;(modal.querySelector('.desktop-modal-secondary') as HTMLButtonElement).click();await flushPromises()
  expect(document.body.querySelector('[data-testid="desktop-player-modal"]')).toBeNull()
  expect(torrentPlaybackApi.playbackTicket).toHaveBeenCalledWith('movie',1,{source_id:'s1080',season:null,episode:null})
  expect(w.find('video').attributes('src')).toBe('https://media.example/s.mp4')
 })
 it('confirms the hand-off when the installed player picked the launch up',async()=>{
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(ready() as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-1',deep_link:'kinosota://watch?launch=id-1',expires_at:'2026-11-03T12:00:00Z'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const{w}=await at('/torrents/movie/1')
  await w.find('[data-testid="watch-button"]').trigger('click');await flushPromises()
  expect(w.find('.watch-message').text()).toBe('Открыто в KINOSOTA Player');expect(document.body.querySelector('[data-testid="desktop-player-modal"]')).toBeNull()
 })
 it('lets a series pick season and episode and launches exactly that episode',async()=>{
  vi.mocked(torrentsApi.detail).mockResolvedValue({...entry,kind:'tv',tmdb_id:7,season_list:[{season:1,episodes:8,name:'S1'},{season:2,episodes:6,name:'S2'}],genres:[]} as any)
  const eps=[{season:1,episode:1},{season:1,episode:2}]
  vi.mocked(torrentPlaybackApi.sources).mockResolvedValue(ready({status:{status:'partial',playable:true,progress:100,start_ms:640},sources:[src({episodes:eps,file_count:2})],episodes:eps}) as any)
  vi.mocked(torrentPlaybackApi.desktopLaunch).mockResolvedValue({launch_id:'id-2',deep_link:'kinosota://watch?launch=id-2',expires_at:'2026-11-03T12:00:00Z'} as any)
  vi.mocked(waitForPlayer).mockResolvedValue(true)
  const{w}=await at('/torrents/tv/7')
  expect(w.findAll('#watch-season option').map(o=>o.text())).toEqual(['Сезон 1','Сезон 2 · нет раздачи'])
  const episodes=w.findAll('#watch-episode option');expect(episodes).toHaveLength(8);expect(episodes[1].text()).toBe('Серия 2');expect(episodes[2].text()).toBe('Серия 3 · нет в раздачах')
  await w.find('#watch-episode').setValue('2');await flushPromises()
  await w.find('[data-testid="watch-button"]').trigger('click');await flushPromises()
  expect(torrentPlaybackApi.desktopLaunch).toHaveBeenCalledWith({kind:'tv',tmdb_id:7,source_id:'s1080',season:1,episode:2,audio_lang:'ru'})
  await w.find('#watch-episode').setValue('3');await flushPromises()
  expect(w.find('[data-testid="watch-button"]').attributes('disabled')).toBeDefined();expect(w.text()).toContain('Этой серии пока нет в найденных раздачах')
 })
})
