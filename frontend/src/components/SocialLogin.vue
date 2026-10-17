<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
const auth=useAuthStore(),router=useRouter()
const providers=ref({telegram:false}),message=ref(''),loading=ref(false),widget=ref<HTMLElement|null>(null)
let script:HTMLScriptElement|null=null
const callback='kinosotaTelegramLogin'+Math.random().toString(36).slice(2)
onMounted(async()=>{
  try {
    const r=await fetch('/api/v1/auth/social/providers');const d=await r.json();providers.value=d.providers||providers.value
  } catch {message.value='Сервисы входа временно недоступны.'}
})
async function telegram(){
  message.value='';loading.value=true
  try{
    const r=await fetch('/api/v1/auth/social/telegram/start',{method:'POST'});const d=await r.json()
    if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Не удалось начать вход.')
    ;(window as any)[callback]=async(user:any)=>{
      const response=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:d.state,user})})
      const result=await response.json()
      if(!response.ok){message.value=typeof result.detail==='string'?result.detail:'Telegram не подтвердил вход.';return}
      auth.setToken('cookie-session');await auth.fetchCurrentUser();router.push('/profile')
    }
    if(widget.value){widget.value.replaceChildren();script=document.createElement('script');script.src='https://telegram.org/js/telegram-widget.js?22';script.async=true;script.setAttribute('data-telegram-login',d.bot_username);script.setAttribute('data-size','large');script.setAttribute('data-onauth',callback+'(user)');widget.value.append(script)}
  }catch(e:any){message.value=e.message}finally{loading.value=false}
}
onBeforeUnmount(()=>{delete (window as any)[callback];script?.remove()})
</script>
<template>
 <section class="social-login" aria-label="Вход через другой сервис">
  <button v-if="providers.telegram" type="button" @click="telegram" :disabled="loading">Войти через Telegram</button>
  <button v-else disabled title="Администратору нужно подключить Telegram Login Bot">Telegram · ещё не подключён</button>
  <div ref="widget"></div><p v-if="message" role="alert">{{message}}</p>
 </section>
</template>
<style scoped>.social-login{display:grid;gap:10px;margin:20px 0}.social-login a,.social-login button{box-sizing:border-box;padding:12px;border-radius:8px;text-align:center;background:#27324a;color:#fff;border:1px solid #596780;text-decoration:none;font:inherit}.social-login button:disabled{opacity:.55}.social-login p{color:#fca5a5}</style>
