<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'
const emit=defineEmits<{challenge:[string],submitting:[boolean]}>()
const auth=useAuthStore(),router=useRouter(),busy=ref(false),message=ref(''),link=ref(''),code=ref(''),confirmed=ref(false),username=ref('')
let generation=0,state='',timer:ReturnType<typeof setTimeout>|undefined,expires=0,disposed=false
function cancel(){generation++;clearTimeout(timer);state='';link.value='';confirmed.value=false;username.value='';message.value='';code.value=''}
async function request(path:string,body?:object){
 const r=await fetch(`/api/v1/auth/social/telegram/deeplink/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie'},body:JSON.stringify(body||{})})
 const d=await r.json();if(d.detail?.code==='MFA_REQUIRED'){emit('challenge',d.detail.challenge);return {mfa_required:true}}
 if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:d.detail?.message||'Не удалось подтвердить вход');return d
}
async function start(){if(busy.value)return;cancel();const current=generation;busy.value=true;try{const d=await request('start');if(disposed||current!==generation)return;state=d.state;link.value=d.url;code.value=d.verification_code;expires=Date.now()+d.expires_in*1000;timer=setTimeout(poll,1500)}catch(e:any){if(!disposed&&current===generation)message.value=e.message}finally{busy.value=false}}
async function poll(){if(disposed)return;const current=generation;if(Date.now()>expires){link.value='';message.value='Запрос истёк. Создайте новый запрос подтверждения.';return}try{const d=await request('poll',{state});if(disposed||current!==generation)return;if(d.status==='confirmed'){confirmed.value=true;username.value=d.username||'пользователь Telegram';return}}catch(e:any){if(!disposed&&current===generation)message.value=e.message;return}timer=setTimeout(poll,1500)}
async function complete(){if(busy.value||!confirmed.value)return;const current=generation;busy.value=true;emit('submitting',true);try{const d=await request('complete',{state});if(disposed||current!==generation||d.mfa_required)return;for(const key of ['tg_just_unlinked','tg_unlinked_username','telegram_require_confirmation'])localStorage.removeItem(key);auth.setToken('cookie-session');await auth.fetchCurrentUser();if(!disposed&&current===generation)await router.push('/')}catch(e:any){if(!disposed&&current===generation)message.value=e.message}finally{busy.value=false;emit('submitting',false)}}
defineExpose({start,cancel})
onBeforeUnmount(()=>{disposed=true;cancel()})
</script>
<template><section class="fresh-confirmation" aria-label="Подтверждение нового входа"><template v-if="link"><p>Выберите нужный аккаунт в приложении Telegram. Откройте запрос, сравните код <strong>{{code}}</strong> и нажмите «Подтвердить вход» в Telegram. Не пересылайте ссылку.</p><a :href="link" target="_blank" rel="noopener noreferrer">Открыть Telegram и подтвердить</a><p v-if="!confirmed" role="status">Ожидается ваше подтверждение в Telegram…</p><button v-else type="button" :disabled="busy" @click="complete">Войти как {{username}}</button></template><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.fresh-confirmation{display:grid;gap:10px}.fresh-confirmation p{font-size:14px;line-height:1.5}.fresh-confirmation a,.fresh-confirmation button{display:block;padding:12px;border-radius:10px;border:1px solid #596780;background:#27324a;color:#fff;text-align:center;font:inherit}.fresh-confirmation [role=alert]{color:#fca5a5}</style>
