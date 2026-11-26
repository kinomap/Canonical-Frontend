import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
const api=vi.hoisted(()=>({playbackTicket:vi.fn()}))
const {request}=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('@/api/torrents',async(orig)=>({...(await orig<typeof import('@/api/torrents')>()),torrentPlaybackApi:api}))
vi.mock('@/api/client',async(orig)=>({...(await orig<typeof import('@/api/client')>()),adRequest:request}))
import Player from '@/components/TorrentPlayer.vue'
import {ApiError} from '@/api/client'
import {introClock,MIN_INTRO_MS,resetIntroConfigForTests} from '@/lib/cinemaIntro'
import {useNodeIntro} from './nodeIntro'

const ticket={stream_url:'https://media.example/stream/7.mp4',expires_at:'2026-11-20T12:00:00Z'}
const creative={delivery_id:'d1',media_url:'https://media.example/ads/1.mp4',duration_sec:10,skip_after:5,cta_url:'',cta_text:''}
const plan=(cues:any[])=>(url:string)=>Promise.resolve(url.includes('/plan/')?{cue_points:cues,plan_token:cues.length?'plan':null}:url.includes('/prepare')?{ad:{...creative}}:{ok:true})
const options={global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}}
const wrappers:any[]=[]
let clock=0
beforeEach(()=>{
 api.playbackTicket.mockReset();request.mockReset()
 useNodeIntro() // The intro answer App.vue loads at boot: the clip comes from a Media Node.
 // By default every clock read is 5 s later (the intro minimum is over); the min-intro tests drive the clock themselves.
 vi.spyOn(introClock,'now').mockImplementation(()=>(clock+=MIN_INTRO_MS))
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.restoreAllMocks();vi.useRealTimers();resetIntroConfigForTests()})

async function start(extra:any={}){
 api.playbackTicket.mockResolvedValue(ticket)
 const w=mount(Player,{...options,...extra,props:{access:true,accessError:false,kind:'movie',tmdbId:7,ready:true}});wrappers.push(w)
 await w.get('.browser-play').trigger('click')
 return w
}
/** The film gets moving frames under the intro (what the dissolve waits for). */
async function frames(w:any){
 const el=w.get('video.torrent-video'),film=el.element as HTMLVideoElement
 let time=0
 const play=vi.fn(()=>Promise.resolve()),pause=vi.fn()
 Object.defineProperties(film,{play:{configurable:true,value:play},pause:{configurable:true,value:pause},paused:{configurable:true,get:()=>false},currentTime:{configurable:true,get:()=>time},videoWidth:{configurable:true,get:()=>1920},videoHeight:{configurable:true,get:()=>1080}})
 await el.trigger('loadedmetadata');await el.trigger('playing')
 time=0.05;await el.trigger('timeupdate');time=0.3;await el.trigger('timeupdate');await flushPromises()
 return {el,film,play,pause}
}
const overlay=(w:any)=>w.get('[data-testid="launch-overlay"]')

describe('Web Torrent pre-roll: Intro → Pre-roll → film',()=>{
 it('requests the ad plan at the Play click, before the stream ticket arrives',async()=>{
  request.mockImplementation(plan([{id:'pre',kind:'pre',at_sec:0}]))
  let issue!:(v:unknown)=>void
  api.playbackTicket.mockImplementation(()=>new Promise(r=>{issue=r}))
  const w=mount(Player,{...options,props:{access:true,accessError:false,kind:'tv',tmdbId:9,ready:true,choice:{source_id:'s',season:1,episode:2}}});wrappers.push(w)
  await w.get('.browser-play').trigger('click');await flushPromises()
  const urls=request.mock.calls.map(c=>c[0])
  expect(urls.some((u:string)=>u.startsWith('/ads/plan/torrent/tv/9?surface=torrent_browser&season=1&episode=2'))).toBe(true)
  // The pre-roll is prepared at once too (no impression yet).
  expect(urls.some((u:string)=>u==='/ads/prepare')).toBe(true)
  expect(w.find('video.torrent-video').exists()).toBe(false)
  issue(ticket);await flushPromises()
  expect(w.find('video.torrent-video').exists()).toBe(true)
 })

 it('holds the film paused and muted until the pre-roll ends, then starts it with sound',async()=>{
  request.mockImplementation(plan([{id:'pre',kind:'pre',at_sec:0}]))
  const w=await start();await flushPromises()
  const {film,play,pause}=await frames(w)
  // Muted warm-up under the intro is the only start so far.
  const warmup=play.mock.calls.length
  // The film reached its first frames: it waits, paused and silent, while the pre-roll plays.
  expect(pause).toHaveBeenCalled()
  expect(film.muted).toBe(true)
  const ad=w.get('.ad-playback-container')
  expect(ad.classes()).toContain('visible')
  // Zero-Gap: the intro stays above the ad container until the ad picture really moves...
  expect(overlay(w).classes()).toContain('is-handoff')
  expect(overlay(w).classes()).not.toContain('is-hidden')
  // ...and never shows «Загрузка рекламы…» under it.
  expect(w.text()).not.toContain('Загрузка рекламы')
  const media=ad.get('video')
  // The ad plays WITH sound, never inheriting the muted warm-up of the film.
  expect((media.element as HTMLVideoElement).muted).toBe(false)
  expect((media.element as HTMLVideoElement).volume).toBe(1)
  await media.trigger('playing')
  // The ad really plays: the intro dissolves over it and its layer is done.
  expect(overlay(w).classes()).toContain('is-hidden')
  expect(w.text()).toContain('Реклама')
  expect(play.mock.calls.length).toBe(warmup)
  Object.defineProperty(media.element,'currentTime',{configurable:true,get:()=>10})
  await media.trigger('ended');await flushPromises()
  // Pre-roll over: straight into the film with sound, the intro never comes back.
  expect(play.mock.calls.length).toBeGreaterThan(warmup)
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
 })

 it('the intro always plays 5 s, even when the film is ready at once (no ad)',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
  vi.mocked(introClock.now).mockImplementation(()=>Date.now())
  request.mockImplementation(plan([]))
  const w=await start();await flushPromises()
  const {film,pause}=await frames(w)
  // The film is ready after a moment: it holds, paused and muted, under the intro.
  expect(pause).toHaveBeenCalled()
  expect(film.muted).toBe(true)
  expect(overlay(w).classes()).not.toContain('is-hidden')
  await vi.advanceTimersByTimeAsync(MIN_INTRO_MS-500);await flushPromises()
  expect(overlay(w).classes()).not.toContain('is-hidden')
  await vi.advanceTimersByTimeAsync(600);await flushPromises()
  // 5 s over: the intro dissolves into the film and its sound comes in.
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
 })

 it('a prepared pre-roll takes over after 5 s, and after it the film starts without a second intro',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
  vi.mocked(introClock.now).mockImplementation(()=>Date.now())
  request.mockImplementation(plan([{id:'pre',kind:'pre',at_sec:0}]))
  const w=await start();await flushPromises()
  const ad=w.get('.ad-playback-container')
  // The pre-roll is prepared at once and warms up (rendered, never visibility:hidden) under the intro.
  const media=ad.get('video')
  expect(media.classes()).toContain('preload')
  await media.trigger('canplay')
  expect(ad.classes()).not.toContain('visible')
  expect(overlay(w).classes()).not.toContain('is-hidden')
  await vi.advanceTimersByTimeAsync(MIN_INTRO_MS-500);await flushPromises()
  // The intro runs exactly its 5 s first.
  expect(ad.classes()).not.toContain('visible')
  await vi.advanceTimersByTimeAsync(510);await flushPromises()
  // 5 s: the film is still buffering, the warmed-up ad starts with sound under the intro.
  expect(ad.classes()).toContain('visible')
  expect(overlay(w).classes()).not.toContain('is-hidden')
  expect((media.element as HTMLVideoElement).muted).toBe(false)
  await media.trigger('playing')
  // Its picture moves: the intro dissolves over it (900 ms).
  expect(overlay(w).classes()).toContain('is-hidden')
  const {film,play}=await frames(w)
  Object.defineProperty(media.element,'currentTime',{configurable:true,get:()=>10})
  await media.trigger('ended');await flushPromises()
  // Straight into the film with sound: the intro overlay never shows again.
  expect(play).toHaveBeenCalled()
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
  expect(overlay(w).attributes('aria-hidden')).toBe('true')
 })

 it('without an ad the intro plays on for as long as the film needs, then dissolves into it',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
  vi.mocked(introClock.now).mockImplementation(()=>Date.now())
  request.mockImplementation(plan([]))
  const w=await start();await flushPromises()
  // 9 s and the torrent is still buffering: the intro never stops, never a black screen.
  await vi.advanceTimersByTimeAsync(9000);await flushPromises()
  expect(overlay(w).classes()).not.toContain('is-hidden')
  expect(w.text()).not.toContain('Загрузка рекламы')
  const {film}=await frames(w)
  // First frames decoded: straight into the film with its sound.
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
 })

 it('falls back to a muted ad with «Включить звук» only when the browser refuses its sound',async()=>{
  request.mockImplementation(plan([{id:'pre',kind:'pre',at_sec:0}]))
  let calls=0
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function(this:HTMLMediaElement){
   if(!this.closest('.ad-playback-container'))return Promise.resolve()
   return ++calls===1?Promise.reject(new DOMException('','NotAllowedError')):Promise.resolve()
  })
  const w=await start();await flushPromises()
  await frames(w);await flushPromises()
  const media=w.get('[data-testid="ad-media"]')
  expect((media.element as HTMLVideoElement).muted).toBe(true)
  await media.trigger('playing')
  const button=w.get('[data-testid="ad-sound"]')
  expect(button.text()).toBe('Включить звук')
  await button.trigger('click')
  expect((media.element as HTMLVideoElement).muted).toBe(false)
  expect(w.find('[data-testid="ad-sound"]').exists()).toBe(false)
 })

 it('an empty plan starts the film right after the intro',async()=>{
  request.mockImplementation(plan([]))
  const w=await start();await flushPromises()
  const {film}=await frames(w)
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
  expect(w.get('.ad-playback-container').classes()).not.toContain('visible')
 })

 it('an ad service that never answers lets the film go on after 5 s',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']})
  request.mockImplementation(()=>new Promise(()=>{}))
  const w=await start();await flushPromises()
  const {film}=await frames(w)
  expect(film.muted).toBe(true)
  expect(overlay(w).classes()).not.toContain('is-hidden')
  await vi.advanceTimersByTimeAsync(5010);await flushPromises()
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
 })

 it('a PRO-only torrent opens the PRO checkout instead of an error',async()=>{
  request.mockImplementation(plan([]))
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:any(.*)',component:{template:'<p />'}}]})
  await router.push('/torrents/movie/7');await router.isReady()
  api.playbackTicket.mockRejectedValue(new ApiError(403,'PRO subscription required'))
  const w=mount(Player,{global:{plugins:[router]},props:{access:true,accessError:false,kind:'movie',tmdbId:7,ready:true}});wrappers.push(w)
  await w.get('.browser-play').trigger('click');await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/profile?tab=billing')
 })
})
