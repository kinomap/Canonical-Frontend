<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { adRequest } from '@/api/client'
import { isSmartTvClient } from '@/lib/tvClient'
import { pendingCues, resolvedCues, type Cue } from '@/utils/adTimeline'
/**
 * surface: where this playback happens (Ad Studio «Среды показа»); the plan holds only ads enabled there.
 * Torrent streams have no catalogue id: torrentKind + tmdbId (+ season / episode) name the title.
 * requested=false holds the pre-roll (e.g. while the prestart intro plays): Intro → Pre-roll → film.
 * hostStarts: the host player starts the film itself; the container then resumes `main` only after it
 * actually paused it for an ad, and never plays or pauses it on its own otherwise. A host-started
 * container fetches the plan as soon as it mounts (at the Play click), before `main` exists.
 * `settled` fires once the opening phase is over: the pre-roll ended / was skipped, or the plan
 * is empty, failed or timed out (5 s) — the host may start the film with sound only then.
 * Sound: an ad is a commercial and always starts WITH sound at full volume (the «Смотреть» click is the
 * user gesture), never inheriting the muted warm-up state of the film. Only a NotAllowedError from a
 * strict autoplay policy falls back to muted playback with an «Включить звук» button.
 * Warm-up: the prepared pre-roll is rendered (opacity, never visibility:hidden, so the browser decodes
 * its frames) and `preroll` turns 'ready' only once it can play (canplay / readyState >= 3).
 * `playing` (and the `started` event) mark the real start of the ad picture: a host intro dissolves on it.
 * covered: a host intro is above the container; no «Загрузка рекламы…» caption then.
 */
type AdSurface='telegram_browser'|'torrent_browser'
const props=withDefaults(defineProps<{main:HTMLVideoElement|null; targetId?:string; targetType?:'movie'|'episode'; source:string;requested?:boolean;surface?:AdSurface;torrentKind?:'movie'|'tv';tmdbId?:number;season?:number;episode?:number;hostStarts?:boolean;covered?:boolean}>(),{requested:true,hostStarts:false,covered:false,surface:'telegram_browser',targetId:undefined,targetType:undefined,torrentKind:undefined,tmdbId:undefined,season:undefined,episode:undefined})
const planPath=computed(()=>{
 const surface='surface='+encodeURIComponent(props.surface)
 if(props.torrentKind&&props.tmdbId){const extra=props.season!=null&&props.episode!=null?'&season='+props.season+'&episode='+props.episode:'';return '/ads/plan/torrent/'+props.torrentKind+'/'+props.tmdbId+'?'+surface+extra}
 return props.targetId?'/ads/plan/'+(props.targetType||'movie')+'/'+props.targetId+'?'+surface:''
})
type Ad={cache_ttl_ms?:number;delivery_id:string;media_url:string;duration_sec:number;skip_after:number|null;cta_url:string;cta_text:string}
const media=ref<HTMLVideoElement|null>(null), active=ref(false), loading=ref(false), ad=ref<Ad|null>(null), elapsed=ref(0), blocked=ref(false)
/** The ad's own sound state: false (with sound) unless the browser refused an audible start. */
const adMuted=ref(false)
/** The ad picture is really moving (its `playing` event fired). */
const playing=ref(false)
/** While `requested` is false (the intro plays): is a pre-roll prepared ('ready'), or is there none ('none')? */
const preroll=ref<'pending'|'ready'|'none'>('pending')
/** A pre-roll that never reports canplay is still offered after this long (the host keeps its intro over it until `playing`). */
const WARM_TIMEOUT_MS=8000
let warmingPre:string|null=null, warmTimer:ReturnType<typeof setTimeout>|undefined
const emit=defineEmits<{settled:[];started:[]}>()
const requested=computed(()=>props.requested!==false)
let settledSent=false
function settle(g:number){if(g!==generation||disposed||settledSent)return;settledSent=true;emit('settled')}
const busy=computed(()=>active.value||loading.value)
const remaining=computed(()=>Math.max(0,Math.ceil((ad.value?.duration_sec||0)-elapsed.value)))
const canSkip=computed(()=>ad.value?.skip_after!=null&&elapsed.value>=ad.value.skip_after)
let cues:Cue[]=[], token='', played=new Set<string>(), generation=0, disposed=false, finish:(()=>void)|null=null, watchdog:ReturnType<typeof setTimeout>|null=null, started=false
let initialReady:Promise<void>=Promise.resolve(),preStarted=false
let running:Promise<unknown>=Promise.resolve()
let prepared:{id:string;at:number;maxAge:number;value:Promise<Ad|null>}|null=null
function clearTimer(){if(watchdog)clearTimeout(watchdog);watchdog=null}
function arm(){clearTimer();watchdog=setTimeout(()=>complete('error'),20000)}
let telemetry:Promise<void>=Promise.resolve()
function event(kind:string){const id=ad.value?.delivery_id;if(!id)return Promise.resolve();telemetry=telemetry.then(async()=>{try{await adRequest('/ads/events/'+id,{method:'POST',body:JSON.stringify({event:kind}),signal:AbortSignal.timeout(5000)})}catch{/* Never fake completion or interrupt the movie on telemetry failure. */}});return telemetry}
function prepare(cue:Cue):Promise<Ad|null>{
 if(!prepared||prepared.id!==cue.id||Date.now()-prepared.at>=prepared.maxAge){
  const t=token
  prepared={id:cue.id,at:Date.now(),maxAge:30000,value:adRequest<{ad:Ad|null}>('/ads/prepare',{method:'POST',body:JSON.stringify({plan_token:t,cue_id:cue.id,...(isSmartTvClient()?{tv:true}:{})}),signal:AbortSignal.timeout(6000)}).then(x=>{if(prepared?.id===cue.id)prepared.maxAge=Math.max(1,Math.min(30000,x.ad?.cache_ttl_ms??30000));return x.ad}).catch(()=>null)}
 }
 return prepared.value
}
async function preload(cue:Cue){const g=generation;const value=await prepare(cue);if(g!==generation||busy.value)return;ad.value=value;await nextTick();try{media.value?.load()}catch{/* jsdom */}}
/** The pre-roll counts as ready only once its first frames are decoded, so the intro hands over to a moving picture. */
function markWarm(g:number){
 if(g!==generation)return
 if(!ad.value){warmingPre=null;preroll.value='none';return}
 if((media.value?.readyState??0)>=3)return warmed()
 clearTimeout(warmTimer);warmTimer=setTimeout(()=>{if(g===generation)warmed()},WARM_TIMEOUT_MS)
}
function warmed(){clearTimeout(warmTimer);if(!warmingPre)return;warmingPre=null;if(preroll.value==='pending'&&ad.value)preroll.value='ready'}
function onCanPlay(){if(warmingPre&&ad.value&&!active.value)warmed()}
function onMediaError(){
 // A creative that fails while warming up is dropped: no pre-roll, and it is never tried over the film later.
 if(warmingPre&&!active.value){played.add(warmingPre);warmingPre=null;clearTimeout(warmTimer);if(preroll.value==='pending')preroll.value='none';return}
 complete('error')
}
/** Starts the ad with sound; a refused audible start (NotAllowedError) falls back to muted + «Включить звук». */
function start(){
 const m=media.value
 if(!m)return
 m.muted=adMuted.value
 try{m.volume=1}catch{/* read-only volume (iOS) */}
 const refused=()=>{blocked.value=true;clearTimer()}
 let p:Promise<void>|undefined
 try{p=m.play() as Promise<void>|undefined}catch{return}
 p?.catch?.((e:DOMException)=>{
  if(e?.name!=='NotAllowedError')return complete('error')
  if(m.muted)return refused()
  adMuted.value=true;m.muted=true
  try{(m.play() as Promise<void>|undefined)?.catch?.(refused)}catch{refused()}
 })
}
/** «Включить звук»: the tap is a user gesture, the ad sound comes in at full volume. */
function unmute(){const m=media.value;adMuted.value=false;if(!m)return;m.muted=false;try{m.volume=1}catch{/* iOS */}if(m.paused)play()}
/** Plays the listed cues; true when it paused `main` for them (so the caller must resume it). */
async function run(list:Cue[],g:number):Promise<boolean>{
 if(!list.length)return false
 loading.value=true;props.main?.pause()
 for(const cue of list){
  if(disposed||g!==generation)break
  played.add(cue.id)
  const value=await prepare(cue)
  if(disposed||g!==generation)break
  if(!value)continue
  ad.value=value;elapsed.value=0;started=false;blocked.value=false;playing.value=false;active.value=true;loading.value=false
  await nextTick()
  await new Promise<void>(resolve=>{finish=resolve;arm();start()})
  if(g!==generation)break
  active.value=false;playing.value=false;ad.value=null;prepared=null;loading.value=true
 }
 if(g===generation){loading.value=false;active.value=false}
 return true
}
async function initialize(){
 const g=++generation;preStarted=false;settledSent=false;clearTimer();finish?.();finish=null;played=new Set();cues=[];token='';prepared=null;ad.value=null;active.value=false;playing.value=false;adMuted.value=false;warmingPre=null;clearTimeout(warmTimer);preroll.value='pending'
 const path=planPath.value
 if(!path){loading.value=false;preroll.value='none';settle(g);return}
 loading.value=requested.value;if(!props.hostStarts)props.main?.pause()
 try{
  const p=await adRequest<{cue_points:Cue[];plan_token:string|null}>(path,{signal:AbortSignal.timeout(5000)})
  if(g!==generation||disposed)return
  cues=p.cue_points;token=p.plan_token||''
  if(requested.value)await startInitial(g)
  else {const first=cues.find(c=>c.kind==='pre');if(first){warmingPre=first.id;await preload(first)}markWarm(g)}
 }catch{/* Ad service failure must not take down main playback. */if(g===generation)preroll.value='none';settle(g)}
 if(g===generation&&!disposed){loading.value=false;if(props.source&&requested.value&&!props.hostStarts)props.main?.play()?.catch(()=>{})}
}
async function startInitial(g:number){
 if(preStarted||g!==generation||disposed||!requested.value)return
 preStarted=true
 let paused=false
 await (running=run(cues.filter(c=>c.kind==='pre'&&!played.has(c.id)),g).then(x=>{paused=x}))
 if(g===generation&&!disposed&&requested.value){loading.value=false;if(props.source&&(paused||!props.hostStarts))props.main?.play()?.catch(()=>{})}
 settle(g)
}
function tick(){
 if(!requested.value||!props.main||busy.value)return
 const time=props.main.currentTime,duration=props.main.duration
 const due=pendingCues(cues,played,time,duration)
 if(due.length){void (running=run(due,generation)).then(()=>{if(!disposed&&!busy.value&&props.source)props.main?.play()?.catch(()=>{})});return}
 const next=resolvedCues(cues,duration).filter(c=>c.kind==='mid'&&!played.has(c.id)&&c.at_sec>time&&c.at_sec-time<=15&&(!Number.isFinite(duration)||c.at_sec<duration)).sort((a,b)=>a.at_sec-b.at_sec)[0]
 if(next&&prepared?.id!==next.id)void preload(next)
}
async function end(){await running;if(disposed)return;const duration=props.main?.duration||Infinity;await (running=run([...pendingCues(cues,played,duration,duration),...cues.filter(c=>c.kind==='post'&&!played.has(c.id))],generation))}
function onPlaying(){blocked.value=false;if(!active.value)return;playing.value=true;arm();if(!started){started=true;void event('impression');emit('started')}}
function progress(){elapsed.value=media.value?.currentTime||0;if(!media.value?.paused)arm()}
function complete(kind:'completion'|'skip'|'error'){
 if(kind==='skip'&&!canSkip.value)return
 clearTimer();media.value?.pause();if(kind!=='error'&&started)void event(kind)
 const done=finish;finish=null;done?.()
}
function play(){try{void (media.value?.play() as Promise<void>|undefined)?.catch?.(()=>{blocked.value=true})}catch{blocked.value=true}}
// Main URL is resolved independently; changing it must not restart pre-roll.
// A host-started film may mount later than the plan: the plan is requested at once and `main` is read lazily.
watch(()=>[planPath.value,props.hostStarts?null:props.main],()=>{if(props.main||props.hostStarts)initialReady=initialize()},{immediate:true,flush:'post'})
watch(()=>props.source,()=>{if(props.source&&requested.value&&!busy.value&&!props.hostStarts)props.main?.play()?.catch(()=>{})},{flush:'post'})
watch(requested,value=>{if(!value){media.value?.pause();props.main?.pause();return}if(active.value){start();return}if(preStarted&&props.source){if(!props.hostStarts)props.main?.play()?.catch(()=>{});return}void initialReady.then(()=>startInitial(generation))},{flush:'post'})
onBeforeUnmount(()=>{disposed=true;generation++;clearTimer();clearTimeout(warmTimer);finish?.();media.value?.pause()})
defineExpose({busy,active,playing,blocked,adMuted,preroll,tick,end})
</script>
<template>
 <div class="ad-playback-container" :class="{visible:busy}" :aria-hidden="!busy" @click.stop>
  <video v-if="ad" ref="media" :src="ad.media_url" preload="auto" playsinline :muted="adMuted" :volume="1" :class="{preload:!active}" data-testid="ad-media" @canplay="onCanPlay" @canplaythrough="onCanPlay" @playing="onPlaying" @timeupdate="progress" @waiting="arm" @error="onMediaError" @ended="complete('completion')"></video>
  <div v-if="loading && !covered" class="ad-loading">Загрузка рекламы…</div>
  <div v-if="active" class="ad-label" role="status">Реклама · осталось {{remaining}} сек</div>
  <button v-if="blocked" class="ad-play" @click="play">Продолжить просмотр рекламы</button>
  <button v-if="active && adMuted && !blocked" class="ad-sound" data-testid="ad-sound" @click="unmute">Включить звук</button>
  <div v-if="active" class="ad-actions">
   <a v-if="ad?.cta_url && ad?.cta_text" :href="ad.cta_url" target="_blank" rel="noopener noreferrer" @click="event('click')">{{ad.cta_text}}</a>
   <button v-if="ad?.skip_after!=null" :disabled="!canSkip" @click="complete('skip')">{{canSkip?'Пропустить':`Пропустить через ${Math.ceil((ad?.skip_after||0)-elapsed)} сек`}}</button>
   <a href="/profile?tab=subscription" target="_blank" rel="noopener noreferrer">Отключить рекламу с PRO</a>
  </div>
 </div>
</template>
<style scoped>
.ad-playback-container{position:absolute;inset:0;z-index:30;background:var(--ui-bg);visibility:hidden;pointer-events:none}.ad-playback-container.visible{visibility:visible;pointer-events:auto}.ad-playback-container video{width:100%;height:100%;object-fit:contain}
/* Warm-up: rendered (so the GPU decodes its first frames) but practically transparent; never visibility:hidden. */
.ad-playback-container video.preload{visibility:visible;opacity:.001;pointer-events:none}
.ad-sound{position:absolute;top:20px;right:20px;border:1px solid var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-raised);color:white;padding:8px 12px;font:14px var(--ui-font);cursor:pointer}
.ad-label{position:absolute;top:20px;left:20px;border-radius:var(--ui-radius);padding:8px 12px;background:#111c;color:white;font:14px var(--ui-font)}.ad-actions{position:absolute;bottom:24px;right:20px;left:20px;display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap}.ad-actions a,.ad-actions button,.ad-play{border:1px solid var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-raised);color:white;padding:10px 14px;text-decoration:none;font:14px var(--ui-font);cursor:pointer}.ad-actions button:disabled{opacity:.6;cursor:default}.ad-loading,.ad-play{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);color:var(--ui-text)}
</style>
