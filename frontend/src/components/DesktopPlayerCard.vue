<script setup lang="ts">
import {onMounted,ref,computed} from 'vue'
import {useRoute} from 'vue-router'
import {accountApi} from '@/accountApi'
import {useAuthStore} from '@/stores/auth'
const route=useRoute(),auth=useAuthStore()
type Release={os:string;ready:boolean;version:string|null;sha256:string|null;download_url:string|null}
const releases=ref<Release[]>([]),allowed=ref(false),loading=ref(true),error=ref(''),message=ref(''),busy=ref('')
const pairCode=ref(typeof route.query.player_code==='string'?route.query.player_code:'')
const names:Record<string,string>={windows:'Windows',macos:'macOS',linux:'Linux'}
const pairingValid=computed(()=>/^[A-Z2-9]{8}$/.test(pairCode.value))
async function load(){loading.value=true;error.value='';try{const data=await accountApi('/desktop/releases');releases.value=data.items;allowed.value=data.can_download}catch{error.value='Не удалось проверить версии приложения. Повторите позже.'}finally{loading.value=false}}
async function download(item:Release){
 if(!item.download_url||busy.value)return
 busy.value=item.os;error.value=''
 try{
  const headers:Record<string,string>={};const token=localStorage.getItem('tg_stream_access_token');if(token&&token!=='cookie-session')headers.Authorization='Bearer '+token
  const response=await fetch(item.download_url,{headers,credentials:'same-origin',cache:'no-store'})
  if(!response.ok)throw new Error(response.status===403?'Для скачивания нужна действующая платная подписка.':'Сборка пока недоступна. Повторите позже.')
  const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=item.os==='windows'?'KINOSOTA-Player-Setup.exe':item.os==='macos'?'KINOSOTA-Player.dmg':'kinosota-player.deb';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
 }catch(e:any){error.value=e.message||'Не удалось скачать приложение.'}finally{busy.value=''}
}
async function approve(){if(!pairingValid.value||busy.value)return;busy.value='pair';error.value='';try{await accountApi('/desktop/pairing/approve','POST',{code:pairCode.value});message.value='Устройство подтверждено. Вернитесь в приложение.';pairCode.value=''}catch{error.value='Не удалось подтвердить код. Проверьте подписку и срок действия кода.'}finally{busy.value=''}}
onMounted(load)
</script>
<template>
 <section id="desktop-player" class="desktop-player" aria-labelledby="desktop-player-title">
  <div class="player-intro"><img src="/brand/icon-128.png" alt="" width="72" height="72"/><div><span class="privilege">ПРИВИЛЕГИЯ PRO</span><h2 id="desktop-player-title">KINOSOTA Player</h2><p>Ваши фильмы — в отдельном приложении для компьютера.</p></div></div>
  <p>Вход аккаунтом KINOSOTA, поиск по каталогу и воспроизведение через mpv. Скачивание и использование доступны с действующей платной подпиской.</p>
  <p class="notice">Поддержка кодеков зависит от сборки mpv. Приложение не восстанавливает повреждённые или недоступные источники.</p>
  <p v-if="loading" role="status">Проверяем доступные версии…</p>
  <div v-else class="downloads">
   <div v-for="item in releases" :key="item.os" class="platform"><h3>{{names[item.os]}}</h3><p>{{item.ready?'Версия '+item.version:'Сборка ещё не опубликована'}}</p><button v-if="allowed&&item.ready" :disabled="!!busy" @click="download(item)">{{busy===item.os?'Скачиваем…':'Скачать установщик'}}</button><span v-else>{{allowed?'Появится после проверки сборки':'Доступно с платной подпиской'}}</span></div>
  </div>
  <router-link v-if="!auth.isAuthenticated.value" class="action" :to="{path:'/login',query:{redirect:'/profile#desktop-player'}}">Войти в аккаунт</router-link>
  <router-link v-else-if="!allowed" class="action" to="/profile">Открыть профиль и подписку</router-link>
  <form v-if="auth.isAuthenticated.value&&allowed" class="pairing" @submit.prevent="approve"><h3>Подключить приложение</h3><p>Введите код, показанный в вашем KINOSOTA Player. Не подтверждайте чужие устройства.</p><label for="player-pair-code">Код устройства</label><input id="player-pair-code" v-model="pairCode" maxlength="8" autocomplete="off" autocapitalize="characters" @input="pairCode=pairCode.toUpperCase()"/><button :disabled="!pairingValid||!!busy">Подтвердить устройство</button></form>
  <p class="notice">Удаление: Windows — «Установленные приложения»; macOS — удалить приложение из Applications; Linux — через менеджер пакетов. Перед удалением выйдите из аккаунта в приложении, чтобы удалить сохранённую сессию.</p>
  <p v-if="message" role="status">{{message}}</p><p v-if="error" role="alert">{{error}} <button type="button" @click="load">Повторить</button></p>
 </section>
</template>
<style scoped>
.desktop-player{scroll-margin-top:110px;background:#101820;color:#f1f4f8;border:1px solid #655529;border-radius:12px;padding:clamp(20px,4vw,32px);margin:24px 0;line-height:1.6;min-width:0}.player-intro{display:flex;gap:20px;align-items:center}.player-intro h2{font-size:28px;margin:4px 0}.player-intro p{margin:0}.privilege{color:#ffcf42;font-size:13px;font-weight:700;letter-spacing:.08em}.desktop-player p{color:#c3cbd5;max-width:800px}.notice{font-size:14px}.downloads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:24px 0}.platform{border:1px solid #45505d;border-radius:8px;padding:20px;min-width:0}.platform h3{margin:0}.platform span{font-size:14px;color:#c3cbd5}.desktop-player button,.action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:8px;padding:10px 16px;background:#ffc400;color:#141414;border:0;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}.desktop-player button:disabled{background:#303b45;color:#aeb7c1;cursor:default}.pairing{padding:24px 0;border-top:1px solid #45505d;display:flex;align-items:flex-start;flex-direction:column;gap:12px}.pairing h3,.pairing p{margin:0}.pairing input{background:#0b1118;border:1px solid #708096;color:white;font:inherit;letter-spacing:.15em;padding:12px;border-radius:8px;width:min(100%,280px);box-sizing:border-box}.desktop-player button:focus-visible,.desktop-player a:focus-visible,.pairing input:focus-visible{outline:2px solid #ffdb68;outline-offset:4px}@media(max-width:760px){.downloads{grid-template-columns:1fr}.player-intro{align-items:flex-start;gap:12px}.player-intro h2{font-size:24px}.player-intro img{width:56px;height:56px}}
</style>
