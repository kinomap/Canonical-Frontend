<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'
import {tr} from '@/i18n'
const emit=defineEmits<{challenge:[string]}>()
const auth=useAuthStore(),router=useRouter(),busy=ref(false),message=ref('')
let config:any=null,disposed=false;let script:HTMLScriptElement|undefined;let preparing:Promise<void>|undefined
onBeforeUnmount(()=>{disposed=true;script?.remove()})
async function prepare(){if(preparing)return preparing;preparing=(async()=>{const r=await fetch('/api/v1/auth/social/telegram/start',{method:'POST'});const d=await r.json();if(disposed)return;if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Telegram недоступен');config=d;if(!(window as any).Telegram?.Login?.auth)await new Promise<void>((resolve,reject)=>{script=document.createElement('script');script.src='https://telegram.org/js/telegram-widget.js?22';script.onload=()=>resolve();script.onerror=()=>{script?.remove();reject(new Error('Не удалось загрузить Telegram'))};document.head.append(script)})})();try{await preparing}finally{preparing=undefined}}
onMounted(()=>prepare().catch(e=>message.value=e.message))
function login(){if(busy.value)return;if(!config||!(window as any).Telegram?.Login?.auth){message.value='Подключение Telegram… Повторите нажатие.';prepare().catch(e=>message.value=e.message);return}busy.value=true;message.value='';(window as any).Telegram.Login.auth({bot_id:Number(config.bot_id),request_access:'write'},async(user:any)=>{try{if(disposed)return;if(!user)throw new Error('Вход отменён');const r=await fetch('/api/v1/auth/social/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie'},body:JSON.stringify({state:config.state,user})});const d=await r.json();if(d.detail?.code==='MFA_REQUIRED'){emit('challenge',d.detail.challenge);return}if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Не удалось войти');auth.setToken('cookie-session');await auth.fetchCurrentUser();await router.push('/')}catch(e:any){message.value=e.message;config=null;prepare().catch(()=>{})}finally{busy.value=false}})}
</script>
<template><section class="social-login"><button type="button" :disabled="busy" @click="login">{{tr('Войти через Telegram','Sign in with Telegram')}}</button><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.social-login{margin:20px 0}.social-login button{width:100%;box-sizing:border-box;min-height:46px;padding:12px;border:0;border-radius:10px;background:#27324a;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}.social-login p{color:#fca5a5;font-size:14px}.social-login button:disabled{opacity:.5}</style>
