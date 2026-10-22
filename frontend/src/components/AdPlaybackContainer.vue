<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { adRequest } from '@/api/client'
import { pendingCues, resolvedCues, type Cue } from '@/utils/adTimeline'
const props=withDefaults(defineProps<{main:HTMLVideoElement|null; targetId?:string; targetType?:'movie'|'episode'; source:string;requested?:boolean}>(),{requested:true})
type Ad={cache_ttl_ms?:number;delivery_id:string;media_url:string;duration_sec:number;skip_after:number|null;cta_url:string;cta_text:string}
const media=ref<HTMLVideoElement|null>(null), active=ref(false), loading=ref(false), ad=ref<Ad|null>(null), elapsed=ref(0), blocked=ref(false)
const requested=computed(()=>props.requested!==false)
const busy=computed(()=>active.value||loading.value)
const remaining=computed(()=>Math.max(0,Math.ceil((ad.value?.duration_sec||0)-elapsed.value)))
const canSkip=computed(()=>ad.value?.skip_after!=null&&elapsed.value>=ad.value.skip_after)
let cues:Cue[]=[], token='', played=new Set<string>(), generation=0, disposed=false, finish:(()=>void)|null=null, watchdog:ReturnType<typeof setTimeout>|null=null, started=false
let initialReady:Promise<void>=Promise.resolve(),preStarted=false
let running:Promise<void>=Promise.resolve()
let prepared:{id:string;at:number;maxAge:number;value:Promise<Ad|null>}|null=null
function clearTimer(){if(watchdog)clearTimeout(watchdog);watchdog=null}
function arm(){clearTimer();watchdog=setTimeout(()=>complete('error'),20000)}
let telemetry:Promise<void>=Promise.resolve()
function event(kind:string){const id=ad.value?.delivery_id;if(!id)return Promise.resolve();telemetry=telemetry.then(async()=>{try{await adRequest('/ads/events/'+id,{method:'POST',body:JSON.stringify({event:kind}),signal:AbortSignal.timeout(5000)})}catch{/* Never fake completion or interrupt the movie on telemetry failure. */}});return telemetry}
function prepare(cue:Cue):Promise<Ad|null>{
 if(!prepared||prepared.id!==cue.id||Date.now()-prepared.at>=prepared.maxAge){
  const t=token
  prepared={id:cue.id,at:Date.now(),maxAge:30000,value:adRequest<{ad:Ad|null}>('/ads/prepare',{method:'POST',body:JSON.stringify({plan_token:t,cue_id:cue.id}),signal:AbortSignal.timeout(6000)}).then(x=>{if(prepared?.id===cue.id)prepared.maxAge=Math.max(1,Math.min(30000,x.ad?.cache_ttl_ms??30000));return x.ad}).catch(()=>null)}
 }
 return prepared.value
}
async function preload(cue:Cue){const g=generation;const value=await prepare(cue);if(g!==generation||busy.value)return;ad.value=value;await nextTick();media.value?.load()}
async function run(list:Cue[],g:number){
 if(!list.length)return
 loading.value=true;props.main?.pause()
 for(const cue of list){
  if(disposed||g!==generation)break
  played.add(cue.id)
  const value=await prepare(cue)
  if(disposed||g!==generation)break
  if(!value)continue
  ad.value=value;elapsed.value=0;started=false;blocked.value=false;active.value=true;loading.value=false
  await nextTick()
  await new Promise<void>(resolve=>{finish=resolve;arm();media.value?.play().catch((e:DOMException)=>{if(e.name==='NotAllowedError'){blocked.value=true;clearTimer()}else complete('error')})})
  if(g!==generation)break
  active.value=false;ad.value=null;prepared=null;loading.value=true
 }
 if(g===generation){loading.value=false;active.value=false}
}
async function initialize(){
 const g=++generation;preStarted=false;clearTimer();finish?.();finish=null;played=new Set();cues=[];token='';prepared=null;ad.value=null;active.value=false
 if(!props.targetId){loading.value=false;return}
 loading.value=requested.value;props.main?.pause()
 try{
  const p=await adRequest<{cue_points:Cue[];plan_token:string|null}>('/ads/plan/'+(props.targetType||'movie')+'/'+props.targetId,{signal:AbortSignal.timeout(5000)})
  if(g!==generation||disposed)return
  cues=p.cue_points;token=p.plan_token||''
  if(requested.value)await startInitial(g)
  else {const first=cues.find(c=>c.kind==='pre');if(first)await preload(first)}
 }catch{/* Ad service failure must not take down main playback. */}
 if(g===generation&&!disposed){loading.value=false;if(props.source&&requested.value)props.main?.play()?.catch(()=>{})}
}
async function startInitial(g:number){
 if(preStarted||g!==generation||disposed||!requested.value)return
 preStarted=true
 await (running=run(cues.filter(c=>c.kind==='pre'),g))
 if(g===generation&&!disposed&&requested.value){loading.value=false;if(props.source)props.main?.play()?.catch(()=>{})}
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
function onPlaying(){blocked.value=false;arm();if(!started){started=true;void event('impression')}}
function progress(){elapsed.value=media.value?.currentTime||0;if(!media.value?.paused)arm()}
function complete(kind:'completion'|'skip'|'error'){
 if(kind==='skip'&&!canSkip.value)return
 clearTimer();media.value?.pause();if(kind!=='error'&&started)void event(kind)
 const done=finish;finish=null;done?.()
}
function play(){void media.value?.play().catch(()=>{blocked.value=true})}
// Main URL is resolved independently; changing it must not restart pre-roll.
watch(()=>[props.targetId,props.main],()=>{if(props.main)initialReady=initialize()},{immediate:true,flush:'post'})
watch(()=>props.source,()=>{if(props.source&&requested.value&&!busy.value)props.main?.play()?.catch(()=>{})},{flush:'post'})
watch(requested,value=>{if(!value){media.value?.pause();props.main?.pause();return}if(active.value){void media.value?.play().catch(()=>{blocked.value=true});return}if(preStarted&&props.source){props.main?.play()?.catch(()=>{});return}void initialReady.then(()=>startInitial(generation))},{flush:'post'})
onBeforeUnmount(()=>{disposed=true;generation++;clearTimer();finish?.();media.value?.pause()})
defineExpose({busy,tick,end})
</script>
<template>
 <div class="ad-playback-container" :class="{visible:busy}" :aria-hidden="!busy" @click.stop>
  <video v-if="ad" ref="media" :src="ad.media_url" preload="auto" playsinline :muted="main?.muted" :volume="main?.volume ?? 1" :class="{preload:!active}" @playing="onPlaying" @timeupdate="progress" @waiting="arm" @error="complete('error')" @ended="complete('completion')"></video>
  <div v-if="loading" class="ad-loading">Загрузка рекламы…</div>
  <div v-if="active" class="ad-label" role="status">Реклама · осталось {{remaining}} сек</div>
  <button v-if="blocked" class="ad-play" @click="play">Продолжить просмотр рекламы</button>
  <div v-if="active" class="ad-actions">
   <a v-if="ad?.cta_url && ad?.cta_text" :href="ad.cta_url" target="_blank" rel="noopener noreferrer" @click="event('click')">{{ad.cta_text}}</a>
   <button v-if="ad?.skip_after!=null" :disabled="!canSkip" @click="complete('skip')">{{canSkip?'Пропустить':`Пропустить через ${Math.ceil((ad?.skip_after||0)-elapsed)} сек`}}</button>
   <a href="/profile?tab=subscription" target="_blank" rel="noopener noreferrer">Отключить рекламу с PRO</a>
  </div>
 </div>
</template>
<style scoped>
.ad-playback-container{position:absolute;inset:0;z-index:30;background:#080a0e;visibility:hidden;pointer-events:none}.ad-playback-container.visible{visibility:visible;pointer-events:auto}.ad-playback-container video{width:100%;height:100%;object-fit:contain}.ad-playback-container video.preload{visibility:hidden}.ad-label{position:absolute;top:20px;left:20px;border-radius:8px;padding:8px 12px;background:#111c;color:white;font:14px system-ui}.ad-actions{position:absolute;bottom:24px;right:20px;left:20px;display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap}.ad-actions a,.ad-actions button,.ad-play{border:1px solid #64748b;border-radius:8px;background:#1e293bee;color:white;padding:10px 14px;text-decoration:none;font:14px system-ui;cursor:pointer}.ad-actions button:disabled{opacity:.6;cursor:default}.ad-loading,.ad-play{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);color:#fff}
</style>
