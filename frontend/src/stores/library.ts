import { reactive, ref, watch, effectScope } from 'vue'
import { useAuthStore } from './auth'
import { libraryApi } from '@/api/library'
import type { TorrentItem } from '@/api/torrents'
import { ApiError } from '@/api/client'
type Entry = {saved:boolean;loading:boolean;known:boolean;error:string}
const entries=reactive<Record<string,Entry>>({})
const revision=ref(0)
// An expired session answers 401: the account is treated as a guest (no error badge, the
// bookmark leads to sign-in) until the auth state changes again.
const guest=ref(false)
const keyOf=(item:Pick<TorrentItem,'kind'|'tmdb_id'>)=>`${item.kind}:${item.tmdb_id}`
const queued=new Set<string>()
const unauthorized=(error:unknown)=>error instanceof ApiError&&error.status===401
let timer:ReturnType<typeof setTimeout>|undefined, epoch=0, initialized=false
export type ToggleResult='ok'|'login'|'error'
export function useLibrary(){
 const auth=useAuthStore()
 if(!initialized){initialized=true;effectScope(true).run(()=>watch(()=>[auth.token.value,auth.user.value?.id],()=>{epoch++;guest.value=false;queued.clear();clearTimeout(timer);for(const k of Object.keys(entries))delete entries[k]}, {flush:'sync'}))}
 function entry(item:TorrentItem){const key=keyOf(item);return entries[key]||(entries[key]={saved:false,loading:false,known:false,error:''})}
 function ensure(item:TorrentItem){
  if(!auth.isAuthenticated.value||guest.value)return
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
   }catch(error){if(version!==epoch)return
    const signedOut=unauthorized(error);if(signedOut)guest.value=true
    for(const key of (signedOut?Object.keys(entries):batch)){const row=entries[key];if(row){row.loading=false;row.error=signedOut?'':'Не удалось проверить кинотеку. Нажмите, чтобы повторить.'}}
    if(signedOut)return}
  }
 }
 async function toggle(item:TorrentItem):Promise<ToggleResult>{
  if(guest.value)return 'login'
  const row=entry(item);if(row.loading)return 'ok'
  if(!row.known){ensure(item);return 'ok'}
  const version=epoch;row.loading=true;row.error=''
  try{const result=await libraryApi.set(item.kind,item.tmdb_id,!row.saved);if(version!==epoch)return 'ok';row.saved=result.saved;revision.value++;return 'ok'}
  catch(error){if(version!==epoch)return 'ok'
   if(unauthorized(error)){guest.value=true;row.error='';return 'login'}
   row.error=error instanceof ApiError&&error.status===409?error.message:'Не удалось сохранить изменение. Попробуйте ещё раз.';return 'error'}
  finally{if(version===epoch)row.loading=false}
 }
 return {entry,ensure,toggle,revision,guest}
}
