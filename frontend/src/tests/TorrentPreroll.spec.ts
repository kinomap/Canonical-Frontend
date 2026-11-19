import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
const api=vi.hoisted(()=>({playbackTicket:vi.fn()}))
const {request}=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('@/api/torrents',async(orig)=>({...(await orig<typeof import('@/api/torrents')>()),torrentPlaybackApi:api}))
vi.mock('@/api/client',async(orig)=>({...(await orig<typeof import('@/api/client')>()),adRequest:request}))
import Player from '@/components/TorrentPlayer.vue'
import {ApiError} from '@/api/client'

const ticket={stream_url:'https://media.example/stream/7.mp4',expires_at:'2026-11-20T12:00:00Z'}
const creative={delivery_id:'d1',media_url:'https://media.example/ads/1.mp4',duration_sec:10,skip_after:5,cta_url:'',cta_text:''}
const plan=(cues:any[])=>(url:string)=>Promise.resolve(url.includes('/plan/')?{cue_points:cues,plan_token:cues.length?'plan':null}:url.includes('/prepare')?{ad:{...creative}}:{ok:true})
const options={global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}}
const wrappers:any[]=[]
beforeEach(()=>{
 api.playbackTicket.mockReset();request.mockReset()
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.restoreAllMocks();vi.useRealTimers()})

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
  expect(overlay(w).classes()).not.toContain('is-hidden')
  const ad=w.get('.ad-playback-container')
  expect(ad.classes()).toContain('visible')
  const media=ad.get('video')
  await media.trigger('playing')
  expect(w.text()).toContain('Реклама')
  expect(play.mock.calls.length).toBe(warmup)
  Object.defineProperty(media.element,'currentTime',{configurable:true,get:()=>10})
  await media.trigger('ended');await flushPromises()
  // Pre-roll over: the intro gives way to the film and its sound comes in.
  expect(play.mock.calls.length).toBeGreaterThan(warmup)
  expect(film.muted).toBe(false)
  expect(overlay(w).classes()).toContain('is-hidden')
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
