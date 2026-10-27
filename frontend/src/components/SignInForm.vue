<script setup lang="ts">
import {ref} from 'vue'
import {useAuthStore} from '@/stores/auth'
import SocialLogin from '@/components/SocialLogin.vue'
const emit=defineEmits<{success:[]}>(),auth=useAuthStore()
const username=ref(auth.user.value?.username||''),password=ref(''),otp=ref(''),challenge=ref(''),busy=ref(false),error=ref('')
async function submit(){
 if(busy.value)return
 busy.value=true;error.value=''
 try{
  if(challenge.value){
   const r=await fetch('/api/v1/auth/mfa/complete',{method:'POST',headers:{'Content-Type':'application/json','X-TOTP-Code':otp.value},body:JSON.stringify({challenge:challenge.value})})
   const d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail: 'Проверьте код подтверждения.')
   auth.setToken('cookie-session');await auth.fetchCurrentUser()
  }else await auth.login(username.value.trim(),password.value,otp.value)
  password.value='';otp.value='';emit('success')
 }catch(e:any){
  let d:any;try{d=JSON.parse(e.message)}catch{}
  if(d?.code==='MFA_REQUIRED'&&d.challenge){challenge.value=d.challenge;password.value=''}
  else error.value='Не удалось войти. Проверьте данные аккаунта и соединение.'
 }finally{busy.value=false}
}
</script>
<template>
 <form class="inline-signin" @submit.prevent="submit">
  <template v-if="!challenge"><label>Логин или email<input v-model="username" name="username" autocomplete="username" required maxlength="254"/></label><label>Пароль<input v-model="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"/></label><label>Код 2FA, если включена<input v-model="otp" autocomplete="one-time-code" maxlength="64"/></label></template>
  <label v-else>Код 2FA или резервный код<input v-model="otp" autocomplete="one-time-code" required maxlength="64"/></label>
  <p v-if="error" role="alert">{{error}}</p><button :disabled="busy">{{busy?'Входим…':'Войти и продолжить'}}</button>
 </form>
 <SocialLogin inline @success="emit('success')" v-if="!challenge" @challenge="challenge=$event;password=''" />
</template>
<style scoped>
.inline-signin{display:grid;gap:16px;text-align:left}.inline-signin label{display:grid;gap:8px;font-size:14px;color:#c4cbd1}.inline-signin input{box-sizing:border-box;width:100%;min-height:48px;padding:12px;background:#0b1116;border:1px solid #52606b;border-radius:8px;color:#fff;font:inherit}.inline-signin button{min-height:48px;padding:12px 16px;border:1px solid #ffe15c;border-radius:8px;background:linear-gradient(120deg,#ffe65c,#ffc400);color:#141414;font:inherit;font-weight:700;cursor:pointer}.inline-signin button:disabled{opacity:.65;cursor:wait}.inline-signin p{color:#ffbaba;margin:0}.inline-signin :focus-visible{outline:2px solid #ffd400;outline-offset:3px}
</style>
