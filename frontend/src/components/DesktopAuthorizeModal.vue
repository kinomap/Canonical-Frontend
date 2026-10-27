<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {accountApi} from '@/accountApi'
import SignInForm from '@/components/SignInForm.vue'
import {useDialog} from '@/useDialog'
const route=useRoute(),router=useRouter(),auth=useAuthStore(),card=ref<HTMLElement|null>(null)
const code=computed(()=>typeof route.query.player_code==='string'?route.query.player_code.toUpperCase():'')
const visible=computed(()=>!!code.value),valid=computed(()=>/^[A-Z2-9]{8}$/.test(code.value))
const busy=ref(false),done=ref(false),error=ref('')
watch(code,()=>{done.value=false;error.value=''})
function close(){const q={...route.query};delete q.player_code;void router.replace({path:route.path,query:q,hash:route.hash})}
useDialog(()=>visible.value,card,close)
async function approve(){
 if(busy.value||!valid.value)return
 busy.value=true;error.value=''
 try{await accountApi('/desktop/pairing/approve','POST',{code:code.value});done.value=true}
 catch(e:any){error.value=e.code==='PAIRING_EXPIRED_OR_USED'?'Время подтверждения истекло. Повторите вход в приложении.':'Не удалось подтвердить вход. Проверьте подписку и повторите попытку.'}
 finally{busy.value=false}
}
</script>
<template><Teleport to="body"><div v-if="visible" class="player-overlay"><section ref="card" tabindex="-1" class="player-confirm" role="dialog" aria-modal="true" aria-labelledby="player-confirm-title"><button class="close" aria-label="Закрыть" @click="close">×</button><img src="/brand/icon-128.png" alt="" width="64" height="64"/><span class="eyebrow">KINOSOTA · DESKTOP</span><h2 id="player-confirm-title">{{done?'Вход подтверждён':'Войти в KINOSOTA Player?'}}</h2><template v-if="done"><p role="status">Всё готово. Вернитесь в приложение — каталог откроется автоматически.</p><button class="primary" @click="close">Готово</button></template><template v-else-if="!valid"><p role="alert">Ссылка подключения недействительна. Начните вход через браузер в приложении заново.</p><button class="primary" @click="close">Понятно</button></template><template v-else-if="!auth.isAuthenticated.value"><p>Войдите в аккаунт сайта, затем подтвердите вход в приложение. Вводить код подключения не нужно.</p><SignInForm @success="error=''"/></template><template v-else><p>Вы вошли как <strong>{{auth.user.value?.display_name||auth.user.value?.username||'пользователь KINOSOTA'}}</strong>. Разрешите вход в приложение на вашем компьютере.</p><div class="device"><span class="device-symbol" aria-hidden="true">▣</span><div><strong>KINOSOTA Player</strong><span>Приложение для компьютера</span></div></div><p class="security">Подтверждайте, только если вы сами начали вход в плеере.</p><p v-if="error" class="error" role="alert">{{error}}</p><button class="primary" :disabled="busy" @click="approve">{{busy?'Подтверждаем…':'Подтвердить вход'}}</button><button class="cancel" :disabled="busy" @click="close">Отмена</button></template></section></div></Teleport></template>
<style scoped>
.player-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:#020609c9;backdrop-filter:blur(12px);overflow:auto}.player-confirm{position:relative;box-sizing:border-box;width:min(100%,480px);max-height:calc(100dvh - 48px);overflow:auto;padding:40px 32px 32px;color:#f5f6f7;background:radial-gradient(at 100% 0,#55411a60,transparent 65%),#10171b;border:1px solid #6d5d33;border-radius:24px;box-shadow:0 24px 96px #0009}.player-confirm>img{display:block;margin-bottom:16px}.eyebrow{color:#ffda52;font-size:12px;font-weight:700;letter-spacing:.12em}.player-confirm h2{font-size:24px;line-height:32px;text-wrap:balance;margin:12px 0}.player-confirm p{font-size:16px;line-height:24px;color:#c3cad1;margin:0 0 24px;text-wrap:pretty}.player-confirm strong{color:#fff}.device{display:flex;align-items:center;gap:16px;border:1px solid #42494c;background:#0b1116;border-radius:12px;padding:16px;margin-bottom:16px}.device-symbol{font-size:30px;color:#ffd400}.device div{display:grid;gap:4px}.device div span,.player-confirm .security{font-size:14px;color:#b5bec7}.player-confirm button{font:inherit;cursor:pointer;min-height:48px;border-radius:8px;padding:12px 16px}.primary{width:100%;border:1px solid #ffe15c;color:#141414;background:linear-gradient(120deg,#ffe65c,#ffc400);font-weight:700!important}.primary:hover{filter:brightness(1.08)}.cancel{width:100%;margin-top:8px;background:transparent;color:#c5ced5;border:1px solid #48525a}.close{position:absolute;right:16px;top:16px;width:48px;background:transparent;color:#d2d8df;border:0;font-size:24px!important}.player-confirm button:disabled{opacity:.6;cursor:wait}.player-confirm button:focus-visible{outline:2px solid #ffdc65;outline-offset:3px}.player-confirm .error{color:#ffbaba}@media(max-width:480px){.player-overlay{padding:16px}.player-confirm{padding:32px 24px 24px}}
</style>
