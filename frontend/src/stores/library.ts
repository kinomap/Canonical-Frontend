import { reactive, ref, watch, effectScope } from 'vue'
import { useAuthStore } from './auth'
import { libraryApi } from '@/api/library'
import type { TorrentItem } from '@/api/torrents'
import { ApiError } from '@/api/client'
type Entry = {saved:boolean;loading:boolean;known:boolean;error:string}
const entries=reactive<Record<string,Entry>>({})
const revision=ref(0)
const keyOf=(item:Pick<TorrentItem,'kind'|'tmdb_id'>)=>`${item.kind}:${item.tmdb_id}`
const queued=new Set<string>()
let timer:ReturnType<typeof setTimeout>|undefined, epoch=0, initialized=false
export function useLibrary(){
 const auth=useAuthStore()
 if(!initialized){initialized=true;effectScope(true).run(()=>watch(()=>[auth.token.value,auth.user.value?.id],()=>{epoch++;queued.clear();clearTimeout(timer);for(const k of Object.keys(entries))delete entries[k]}, {flush:'sync'}))}
 function entry(item:TorrentItem){const key=keyOf(item);return entries[key]||(entries[key]={saved:false,loading:false,known:false,error:''})}
 function ensure(item:TorrentItem){
  if(!auth.isAuthenticated.value)return
  const row=entry(item);if(row.loading||row.known)return
  row.loading=true;row.error='';queued.add(keyOf(item));clearTimeout(timer)
  timer=setTimeout(flush,0)
 }
 async function flush(){
  const version=epoch, keys=[...queued];queued.clear()
  for(let offset=0;offset<keys.length;offset+=100){
   const batch=keys.slice(offset,offset+100)
   try{const data=await libraryApi.membership(batch);if(version!==epoch)return
    for(const key of batch){const row=entries[key];if(row){row.saved=data.saved.includes(key);row.known=true;row.loading=false}}
   }catch{if(version!==epoch)return;for(const key of batch){const row=entries[key];if(row){row.loading=false;row.error='Не удалось проверить кинотеку. Нажмите, чтобы повторить.'}}}
  }
 }
 async function toggle(item:TorrentItem){
  const row=entry(item);if(row.loading)return
  if(!row.known){ensure(item);return}
  const version=epoch;row.loading=true;row.error=''
  try{const result=await libraryApi.set(item.kind,item.tmdb_id,!row.saved);if(version!==epoch)return;row.saved=result.saved;revision.value++}
  catch(error){if(version!==epoch)return;row.error=error instanceof ApiError&&error.status===409?error.message:'Не удалось сохранить изменение. Попробуйте ещё раз.'}
  finally{if(version===epoch)row.loading=false}
 }
 return {entry,ensure,toggle,revision}
}
