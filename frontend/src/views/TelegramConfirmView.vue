<script setup lang="ts">
import {ref,onMounted} from 'vue'
import TelegramReauthConfirmation from '@/components/TelegramReauthConfirmation.vue'
const confirmation=ref<InstanceType<typeof TelegramReauthConfirmation>>()
const challenge=ref(''),otp=ref(''),busy=ref(false),error=ref('')
const nonce=location.hash.slice(1)
const valid=!!window.opener&&/^[0-9a-f-]{36}$/.test(nonce)
function complete(){if(valid)window.opener.postMessage({event:'telegram-consent-complete',nonce},location.origin)}
async function confirmFactor(){
 if(busy.value)return
 busy.value=true;error.value=''
 try{
  const r=await fetch('/api/v1/auth/mfa/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Mode':'cookie','X-TOTP-Code':otp.value},body:JSON.stringify({challenge:challenge.value})})
  const d=await r.json();otp.value=''
  if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Неверный код подтверждения')
  for(const key of ['tg_just_unlinked','tg_unlinked_username','telegram_require_confirmation'])localStorage.removeItem(key)
  complete()
 }catch(e:any){error.value=e.message}finally{busy.value=false}
}
onMounted(()=>{if(valid)confirmation.value?.start()})
</script>
<template><main class="telegram-confirm"><h1>Вход через Telegram</h1><p v-if="!valid" role="alert">Откройте вход кнопкой «Войти через Telegram» на сайте.</p><template v-else><TelegramReauthConfirmation v-if="!challenge" ref="confirmation" auto-complete popup @complete="complete" @challenge="challenge=$event"/><form v-else @submit.prevent="confirmFactor"><h2>Подтверждение 2FA</h2><label>Код 2FA или резервный код<input v-model="otp" autocomplete="one-time-code" maxlength="64" autofocus required /></label><button :disabled="busy">Подтвердить вход</button><p v-if="error" role="alert">{{error}}</p></form></template></main></template>
<style scoped>.telegram-confirm{max-width:460px;margin:30px auto;padding:24px;color:#fff}.telegram-confirm h1{font-size:24px;margin-bottom:20px}.telegram-confirm input,.telegram-confirm button{display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:12px;border-radius:10px;border:1px solid #596780;background:#27324a;color:#fff;font:inherit}.telegram-confirm [role=alert]{color:#fca5a5}</style>
