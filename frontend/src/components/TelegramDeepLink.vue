<script setup lang="ts">
import { t } from '@/i18n'
import { onBeforeUnmount, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
const auth=useAuthStore(),router=useRouter(),busy=ref(false),message=ref(''),link=ref(''),code=ref(''),confirmed=ref(false),username=ref('')
const otp=ref('')
let state='',timer:ReturnType<typeof setTimeout>|undefined,expires=0,disposed=false
async function request(path:string,body?:object){const r=await fetch(`/api/v1/auth/social/telegram/deeplink/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-TOTP-Code':otp.value,'X-Acquisition-Source':sessionStorage.getItem('acquisition_source')||''},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Вход через бота недоступен');return d}
async function start(){busy.value=true;message.value='';clearTimeout(timer);confirmed.value=false;try{const d=await request('start');if(disposed)return;state=d.state;link.value=d.url;code.value=d.verification_code;expires=Date.now()+d.expires_in*1000;timer=setTimeout(poll,2000)}catch(e:any){message.value=e.message}finally{busy.value=false}}
async function poll(){if(disposed)return;if(Date.now()>expires){message.value='Ссылка истекла. Начните вход заново.';link.value='';return}try{const d=await request('poll',{state});if(disposed)return;if(d.status==='confirmed'){confirmed.value=true;username.value=d.username||'пользователь Telegram';return}}catch(e:any){message.value=e.message;return}timer=setTimeout(poll,2000)}
async function complete(){busy.value=true;try{await request('complete',{state});auth.setToken('cookie-session');await auth.fetchCurrentUser();if(!auth.user.value)throw new Error('Не удалось проверить сессию');await router.push('/')}catch(e:any){message.value=e.message}finally{busy.value=false}}
onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);state=''})
</script>
<template><section class="bot-login" :aria-label="t('Резервный вход через Telegram-бота')"><button type="button" @click="start" :disabled="busy">{{link?t("Начать вход заново"):t("Войти через Telegram-бота")}}</button><template v-if="link"><p>{{ t("Код проверки:") }} <strong>{{code}}</strong>{{ t(". Откройте бота, сравните код и подтвердите вход. Не пересылайте ссылку.") }}</p><a :href="link" target="_blank" rel="noopener noreferrer">{{ t("Открыть бота") }}</a><label v-if="confirmed">{{t('Код 2FA или резервный код')}}<input v-model="otp" autocomplete="one-time-code" maxlength="64" /></label><button v-if="confirmed" type="button" @click="complete" :disabled="busy">{{ t("Войти как") }} {{username}}</button><p v-else role="status">{{ t("Ожидается подтверждение в Telegram…") }}</p></template><p v-if="message" role="alert">{{message}}</p></section></template>
<style scoped>.bot-login{display:grid;gap:12px;text-align:center;max-width:420px}.bot-login button,.bot-login a{padding:12px;border:1px solid #596780;border-radius:8px;background:#27324a;color:#fff;font:inherit}.bot-login p{font-size:14px;line-height:1.5}.bot-login [role=alert]{color:#fca5a5}</style>
