<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'
import {tr} from '@/i18n'
import {telegramPopup} from '@/lib/telegramPopup'
const emit=defineEmits<{challenge:[string]}>()
const auth=useAuthStore(),router=useRouter(),busy=ref(false),message=ref('')
let disposed=false,active:ReturnType<typeof telegramPopup>|undefined
onBeforeUnmount(()=>{disposed=true;active?.cancel()})
async function finish(){
  if(disposed)return
  auth.setToken('cookie-session')
  const user=await auth.fetchCurrentUser()
  if(!user)throw new Error('Вход не подтверждён. Повторите авторизацию Telegram.')
  for(const key of ['tg_just_unlinked','tg_unlinked_username','telegram_require_confirmation'])localStorage.removeItem(key)
  if(!disposed)await router.push('/')
}
async function login(){
  if(busy.value)return
  busy.value=true;message.value=''
  try{
    active=telegramPopup(async()=>{
      const r=await fetch('/api/v1/auth/social/telegram/start',{method:'POST'})
      const d=await r.json()
      if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Telegram недоступен')
      return d
    },{fresh:localStorage.getItem('tg_just_unlinked')==='true',keepOpen:true})
    const payload=await active.result
    if(disposed)return
    if('confirmed' in payload){await finish();return}
    const r=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie'},body:JSON.stringify(payload)})
    const d=await r.json()
    if(disposed)return
    if(d.require_fresh_reauth||d.detail?.require_fresh_reauth){
      localStorage.setItem('tg_just_unlinked','true')
      // Reuse the window opened by this click, never add controls to /login.
      await active.confirm();await finish();return
    }
    if(d.detail?.code==='MFA_REQUIRED'){emit('challenge',d.detail.challenge);return}
    if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:d.detail?.message||'Не удалось войти')
    await finish()
  }catch(e:any){if(!disposed)message.value=e.message}finally{active?.close();active=undefined;busy.value=false}
}
</script>
<template><section class="social-login"><button type="button" :disabled="busy" @click="login">{{tr('Войти через Telegram','Sign in with Telegram')}}</button><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.social-login{margin:20px 0}.social-login button{width:100%;box-sizing:border-box;min-height:46px;padding:12px;border:0;border-radius:10px;background:#27324a;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}.social-login p{color:#fca5a5;font-size:14px}.social-login button:disabled{opacity:.5}</style>
