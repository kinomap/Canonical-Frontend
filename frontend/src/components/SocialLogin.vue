<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'
import {tr} from '@/i18n'
import TelegramReauthConfirmation from './TelegramReauthConfirmation.vue'
import {telegramPopup} from '@/lib/telegramPopup'
const emit=defineEmits<{challenge:[string]}>()
const auth=useAuthStore(),router=useRouter(),busy=ref(false),message=ref('')
const unlinked=ref(localStorage.getItem('tg_just_unlinked')==='true'),panel=ref(unlinked.value),username=ref(localStorage.getItem('tg_unlinked_username')||''),providerHelp=ref(false),completing=ref(false)
const confirmation=ref<InstanceType<typeof TelegramReauthConfirmation>>()
function showFresh(name?:string){unlinked.value=true;panel.value=true;localStorage.setItem('tg_just_unlinked','true');if(name){username.value=name;localStorage.setItem('tg_unlinked_username',name)}}
function confirmInTelegram(){if(busy.value||completing.value)return;confirmation.value?.start()}
function switchAccount(){if(busy.value||completing.value)return;panel.value=true;providerHelp.value=true;confirmation.value?.cancel();login(true)}
let disposed=false,active:ReturnType<typeof telegramPopup>|undefined
onBeforeUnmount(()=>{disposed=true;active?.cancel()})
async function login(force=false){
  if(busy.value||completing.value)return
  if(unlinked.value&&!force){panel.value=true;return}
  busy.value=true;message.value=''
  try{
    // Open synchronously from this click, then create a fresh browser-bound flow.
    active=telegramPopup(async()=>{
      const r=await fetch('/api/v1/auth/social/telegram/start',{method:'POST',headers:force?{'X-Telegram-Fresh':'1'}:{}})
      const d=await r.json()
      if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Telegram недоступен')
      return d
    })
    const payload=await active.result
    if(disposed)return
    const r=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie'},body:JSON.stringify(payload)})
    const d=await r.json()
    if(disposed)return
    if(d.require_fresh_reauth||d.detail?.require_fresh_reauth){showFresh(d.detail?.telegram_username||payload.user?.username);return}
    if(d.detail?.code==='MFA_REQUIRED'){emit('challenge',d.detail.challenge);return}
    if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:d.detail?.message||'Не удалось войти')
    for(const key of ['tg_just_unlinked','tg_unlinked_username','telegram_require_confirmation'])localStorage.removeItem(key)
    auth.setToken('cookie-session');await auth.fetchCurrentUser();if(!disposed)await router.push('/')
  }catch(e:any){if(!disposed)message.value=e.message}finally{busy.value=false;active=undefined}
}
</script>
<template><section class="social-login"><button type="button" :disabled="busy||completing" @click="login()">{{tr('Войти через Telegram','Sign in with Telegram')}}</button><button type="button" class="switch-link" :disabled="busy||completing" @click="switchAccount">{{tr('Сменить аккаунт Telegram / Ввести другой номер','Switch Telegram account / Use another number')}}</button><section v-if="panel" class="reauth-panel" aria-label="Новая авторизация Telegram"><p v-if="unlinked"><strong>{{username?'Аккаунт @'+username.replace(/^@/,'')+' был отвязан от сайта':'Telegram был отвязан от сайта'}}</strong></p><p v-else><strong>Новый вход в Telegram</strong></p><p>Сохранённая авторизация не выполнит вход автоматически. Выберите другой аккаунт или явно подтвердите новый вход в Telegram.</p><button type="button" :disabled="busy||completing" @click="switchAccount">Войти под другим аккаунтом / Ввести номер заново</button><template v-if="providerHelp"><p class="provider-help">В окне Telegram используйте смену аккаунта, если она доступна. Если Telegram снова выбирает прежний аккаунт, отключите разрешение этого сайта в настройках подключённых сайтов Telegram и удалите данные oauth.telegram.org в настройках браузера. Затем откройте окно снова. Сброс на стороне Telegram автоматически не подтверждён.</p></template><button type="button" :disabled="busy||completing" @click="confirmInTelegram">Подтвердить новый вход в Telegram</button><TelegramReauthConfirmation ref="confirmation" @challenge="emit('challenge',$event)" @submitting="completing=$event" /></section><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.social-login{margin:20px 0}.social-login button{width:100%;box-sizing:border-box;min-height:46px;padding:12px;border:0;border-radius:10px;background:#27324a;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}.social-login .switch-link{min-height:32px;padding:6px;margin-top:6px;background:transparent;text-decoration:underline;font-size:13px;font-weight:400;color:#a9c6ff}.reauth-panel{display:grid;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid #596780}.reauth-panel p{color:inherit!important;line-height:1.5}.social-login p{color:#fca5a5;font-size:14px}.social-login button:disabled{opacity:.5}</style>
