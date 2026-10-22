<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'
import {tr} from '@/i18n'
import {loadTelegramLogin,clearLegacyTelegramFlags,type TelegramUser} from '@/lib/telegramLogin'
const emit=defineEmits<{challenge:[string]}>()
const auth=useAuthStore(),router=useRouter(),busy=ref(false),initializing=ref(true),message=ref('')
let disposed=false,attempt=0,botId='',sdk:Awaited<ReturnType<typeof loadTelegramLogin>>|undefined
let timer:ReturnType<typeof setTimeout>|undefined
onBeforeUnmount(()=>{disposed=true;attempt++;clearTimeout(timer)})
async function prepare(){
  initializing.value=true;message.value='';clearLegacyTelegramFlags()
  try{
    const [loaded,r]=await Promise.all([loadTelegramLogin(),fetch('/api/v1/auth/social/providers')])
    const config=await r.json()
    if(!r.ok||!config.providers?.telegram||!/^\d+$/.test(String(config.telegram_bot_id)))throw new Error('Telegram недоступен')
    sdk=loaded;botId=String(config.telegram_bot_id)
  }catch(e:any){if(!disposed)message.value=e.message}finally{initializing.value=false}
}
onMounted(prepare)
function login(){
  if(busy.value||initializing.value)return
  if(!sdk||!botId){void prepare();return}
  busy.value=true;message.value='';const current=++attempt
  clearTimeout(timer);timer=setTimeout(()=>{if(!disposed&&current===attempt){attempt++;busy.value=false;message.value='Время входа истекло. Разрешите всплывающее окно Telegram и повторите вход.'}},300000)
  // Start CSRF/state setup concurrently, without awaiting before Login.auth.
  // Convert rejection to data so cancelled SDK callbacks cannot leave an unhandled promise.
  const flow=fetch('/api/v1/auth/social/telegram/start',{method:'POST'}).then(async r=>{
    const d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Telegram недоступен');return {state:d.state}
  }).catch(error=>({error}))
  let answered=false
  async function complete(user:TelegramUser|false){
    if(answered||disposed||current!==attempt)return;answered=true;clearTimeout(timer)
    try{
      if(!user)throw new Error('Вход отменён')
      const start=await flow
      if(disposed||current!==attempt)return
      if('error' in start)throw start.error
      const r=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie'},body:JSON.stringify({state:start.state,user})})
      const d=await r.json()
      if(disposed||current!==attempt)return
      if(d.detail?.code==='MFA_REQUIRED'){emit('challenge',d.detail.challenge);return}
      if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:d.detail?.message||'Не удалось войти')
      auth.setToken('cookie-session')
      if(!await auth.fetchCurrentUser()){auth.setToken(null);throw new Error('Вход не подтверждён. Повторите попытку.')}
      clearLegacyTelegramFlags()
      if(!disposed)await router.push('/')
    }catch(e:any){if(!disposed)message.value=e.message}finally{if(!disposed)busy.value=false}
  }
  try{sdk.auth({bot_id:botId,request_access:'write'},user=>{void complete(user)})}
  catch(e:any){clearTimeout(timer);attempt++;busy.value=false;message.value=e.message||'Не удалось открыть Telegram'}
}
</script>
<template><section class="social-login"><button type="button" :disabled="busy||initializing" @click="login">{{tr('Войти через Telegram','Sign in with Telegram')}}</button><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.social-login{margin:20px 0}.social-login button{width:100%;box-sizing:border-box;min-height:46px;padding:12px;border:0;border-radius:10px;background:#27324a;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}.social-login p{color:#fca5a5;font-size:14px}.social-login button:disabled{opacity:.5}</style>
