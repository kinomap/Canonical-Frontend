<script setup lang="ts">
import { t, messageText, language } from '@/i18n'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
const auth=useAuthStore(),router=useRouter()
const configured=ref<boolean|null>(null),message=ref(''),loading=ref(true),widget=ref<HTMLElement|null>(null)
let script:HTMLScriptElement|null=null,disposed=false,timer:ReturnType<typeof setTimeout>|undefined
const otp=ref('')
const callback='kinosotaTelegramLogin'+Math.random().toString(36).slice(2)
function fail(text:string){if(disposed)return;message.value=text;loading.value=false;clearTimeout(timer);widget.value?.replaceChildren()}
async function telegram(){
  if(disposed)return
  message.value='';loading.value=true;clearTimeout(timer);widget.value?.replaceChildren()
  try{
    const r=await fetch('/api/v1/auth/social/telegram/start',{method:'POST'});const d=await r.json()
    if(disposed)return
    if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Не удалось начать вход.')
    ;(window as any)[callback]=async(user:any)=>{
      if(disposed)return
      loading.value=true;message.value=''
      try{
        const response=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json','X-TOTP-Code':otp.value,'X-Acquisition-Source':sessionStorage.getItem('acquisition_source')||''},body:JSON.stringify({state:d.state,user})})
        const result=await response.json()
        if(disposed)return
        if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Telegram не подтвердил вход.')
        auth.setToken('cookie-session');await auth.fetchCurrentUser()
        if(disposed)return
        if(!auth.user.value)throw new Error('Не удалось проверить вход. Повторите попытку.')
        await router.push('/')
      }catch(e:any){fail(e?.message||'Не удалось завершить вход. Повторите попытку.')}finally{if(!disposed)loading.value=false}
    }
    if(!widget.value)throw new Error('Не удалось показать кнопку Telegram.')
    script=document.createElement('script');script.src='https://telegram.org/js/telegram-widget.js?22';script.async=true
    script.setAttribute('data-request-access','write');script.setAttribute('data-telegram-login',d.bot_username);script.setAttribute('data-size','large');script.setAttribute('data-lang',language.value);script.setAttribute('data-onauth',callback+'(user)')
    script.onload=()=>{if(!disposed){loading.value=false;clearTimeout(timer)}}
    script.onerror=()=>fail('Не удалось загрузить Telegram. Проверьте блокировщик или сеть и повторите попытку.')
    timer=setTimeout(()=>fail('Telegram не ответил. Проверьте соединение и повторите попытку.'),15000)
    widget.value.append(script)
  }catch(e:any){fail(e?.message||'Не удалось подготовить вход Telegram.')}
}
onMounted(async()=>{
  try{
    const r=await fetch('/api/v1/auth/social/providers');if(!r.ok)throw new Error()
    const d=await r.json();if(disposed)return
    configured.value=!!d.providers?.telegram
    if(configured.value)await telegram();else loading.value=false
  }catch{fail('Сервисы входа временно недоступны.')}
})
async function retry(){if(configured.value)await telegram();else window.location.reload()}
onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);delete (window as any)[callback];script?.remove()})
</script>
<template>
 <section class="social-login" :aria-label="t('Вход через Telegram')">
  <p v-if="loading" role="status">{{ t("Подключение Telegram…") }}</p>
  <p v-if="configured===false && !message">{{ t("Telegram · ещё не подключён") }}</p>
  <label>{{t('Код 2FA или резервный код')}}<input v-model="otp" autocomplete="one-time-code" maxlength="64" /></label><div ref="widget" class="telegram-widget"></div>
  <p v-if="message" role="alert">{{messageText(message)}}</p>
  <button v-if="message" type="button" @click="retry" :disabled="loading">{{ t("Повторить подключение Telegram") }}</button>
 </section>
</template>
<style scoped>
.social-login{display:grid;justify-items:center;gap:10px;margin:20px 0;min-height:40px}
.telegram-widget{min-height:40px;max-width:100%}
.social-login button{padding:12px;border-radius:8px;background:#27324a;color:#fff;border:1px solid #596780;font:inherit}
.social-login p{margin:0;color:#aaa;text-align:center}.social-login [role=alert]{color:#fca5a5}
</style>
