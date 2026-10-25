<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import axios from 'axios'
const props = defineProps<{canReuse?: boolean; initialAccount?: string; purpose?: 'replace'|'authorize'|'worker'; workerId?: string}>()
const useCurrent = ref(props.canReuse === true || props.purpose==='authorize'||props.purpose==='worker')
const authorizing = computed(()=>props.purpose==='authorize'||props.purpose==='worker')
const worker = computed(()=>props.purpose==='worker')
const role = computed(()=>worker.value?'Worker':'Master')
const emit = defineEmits<{close: []; replaced: []}>()
const base = '/api/v1/admin/media/master-session/replacement'
const phase = ref('INPUT')
const methodTab=ref<'qr'|'code'>('code')
const name = ref('')
const account = ref(props.initialAccount || '')
const apiId = ref('')
const apiHash = ref('')
const phone = ref('')
const code = ref('')
const password = ref('')
const consent = ref(false)
const busy = ref(false)
const error = ref('')
const delivery = ref('')
const identity = ref('')
const qrSrc = ref('')
const remaining = ref(0)
let flow = ''
let timer: number | undefined
let disposed = false
let qrVersion=0
const resendAllowed=ref(false)
const resendAfter=ref(0)
let resendDeadline=0
const clock=window.setInterval(()=>{resendAfter.value=Math.max(0,Math.ceil((resendDeadline-Date.now())/1000))},1000)
const auth = () => ({headers:{Authorization:`Bearer ${localStorage.getItem('admin_token')}`}})
const message = (e:any) => {const d=e?.response?.data?.detail;return typeof d==='string'?d:typeof d?.message==='string'?(d.error_type?d.error_type+': ':'')+d.message+(d.wait_seconds?` Ожидание: ${d.wait_seconds} с.`:''):'Операция не завершена. Данные формы сохранены; текущая сессия не удаляется.'}
function clearQr() { if(qrSrc.value) URL.revokeObjectURL(qrSrc.value); qrSrc.value='' }
function stopPoll() { if(timer !== undefined) window.clearTimeout(timer); timer=undefined }
async function accept(data:any) {
  if(disposed) return
  if(phase.value!==data.state && ['CODE','QR'].includes(data.state))methodTab.value=data.state==='QR'?'qr':'code'
  phase.value=data.state
  remaining.value=data.qr_expires_in ?? data.expires_in ?? 0
  if(data.message) error.value=typeof data.message==='string'?data.message:data.message.message
  resendAllowed.value=data.resend_allowed===true
  if(data.resend_after!==undefined){resendAfter.value=data.resend_after;resendDeadline=Date.now()+data.resend_after*1000}
  if(data.identity) identity.value=(data.identity.username?'@'+data.identity.username+' · ':'')+'Telegram ID '+data.identity.user_id
  if(data.delivery) delivery.value=data.delivery.delivery_type==='SentCodeTypeApp'
    ? 'По ответу Telegram: код отправлен в служебный чат Telegram (тип: SentCodeTypeApp) на подключённые устройства. Получение сообщения НЕ подтверждено. Если его нет, выберите вход по QR в этом окне.'
    : 'Способ по ответу Telegram: '+(['SentCodeTypeSms','SentCodeTypeCall','SentCodeTypeEmailCode','SentCodeTypeFragmentSms'].includes(data.delivery.delivery_type)?data.delivery.delivery_type:'другой способ')+'. Получение кода НЕ подтверждено.'
  if(data.delivery) delivery.value += ' Таймаут Telegram: '+(data.delivery.next_send_timeout == null ? 'не указан' : data.delivery.next_send_timeout+' с.')
  if(phase.value==='QR' && data.qr_version && data.qr_version!==qrVersion){clearQr();qrVersion=data.qr_version}
  if(phase.value==='QR' && !qrSrc.value) {
    const r=await axios.get(`${base}/${flow}/qr`,{...auth(),responseType:'blob'})
    if(!disposed) qrSrc.value=URL.createObjectURL(r.data)
  }
  if(phase.value!=='QR') clearQr()
  if(['QR','VERIFY'].includes(phase.value)) {
    stopPoll();timer=window.setTimeout(poll,2000)
  } else stopPoll()
}
async function start(method:'qr'|'code') {
  if(busy.value) return
  error.value=''
  if(!consent.value) {error.value='Подтвердите вход в Telegram-сессию выбранной роли.';return}
  if((!authorizing.value && !account.value.trim()) || (!useCurrent.value && (!Number.isInteger(Number(apiId.value)) || Number(apiId.value)<=0 || !/^[a-fA-F0-9]{32}$/.test(apiHash.value.trim())))) {
    error.value='Заполните название аккаунта, API ID и API Hash (32 символа) с my.telegram.org/apps.';return
  }
  busy.value=true
  try {
    const r=await axios.post(`${base}/start`,{name:name.value.trim()||'Master',account_identifier:account.value.trim()||'Master',use_current_credentials:useCurrent.value,...(useCurrent.value?{}:{api_id:Number(apiId.value),api_hash:apiHash.value.trim()}),method,phone:phone.value,consent:true,purpose:props.purpose||'replace',worker_id:props.workerId},auth())
    flow=r.data.flow_id
    await accept(r.data)
  } catch(e:any) {error.value=message(e)} finally {busy.value=false}
}

async function flowAction(action:'resend'|'switch-qr'|'switch-code') {
  if(busy.value||!flow)return
  busy.value=true;error.value=''
  try{await accept((await axios.post(`${base}/${flow}/${action}`,action==='switch-code'?{phone:phone.value}:{},auth())).data)}
  catch(e:any){error.value=message(e)}finally{busy.value=false}
}

async function poll() {
  if(!flow || busy.value || disposed) return
  busy.value=true
  try {await accept((await axios.post(`${base}/${flow}/poll`,{},auth())).data)}
  catch(e:any) {error.value=message(e);stopPoll()}
  finally {busy.value=false}
}
async function submit() {
  if(busy.value) return
  busy.value=true;error.value=''
  try {await accept((await axios.post(`${base}/${flow}/submit`,phase.value==='PASSWORD'?{password:password.value}:{code:code.value},auth())).data)}
  catch(e:any) {error.value=message(e)}
  finally {busy.value=false;code.value='';password.value=''}
}
async function commit() {
  if(busy.value || phase.value!=='READY') return
  busy.value=true;error.value=''
  try {
    const r=await axios.post(`${base}/${flow}/commit`,{},auth())
    if(r.data.state!=='COMMITTED'||r.data.success!==true) throw new Error('Not committed')
    flow='';phase.value='COMMITTED';clearQr();emit('replaced')
  } catch(e:any) {error.value=message(e)} finally {busy.value=false}
}
async function cancel(close=true) {
  if(busy.value) return
  stopPoll();busy.value=true;error.value=''
  try {
    if(flow) await axios.post(`${base}/${flow}/cancel`,{},auth())
    flow='';clearQr();phase.value='INPUT';code.value='';password.value=''
    if(close) emit('close')
  } catch(e:any) {
    if(e?.response?.status===410) {flow='';clearQr();phase.value='INPUT';if(close)emit('close')}
    else error.value=message(e)
  } finally {busy.value=false}
}
onUnmounted(()=>{window.clearInterval(clock);disposed=true;stopPoll();clearQr();apiHash.value='';code.value='';password.value=''})
</script>
<template>
<Teleport to="body">
<div class="mr-overlay">
<section class="mr-modal" role="dialog" aria-modal="true" aria-labelledby="mr-title">
<h3 id="mr-title">{{worker?'Авторизовать Worker — медиатрафик':authorizing?'Авторизовать Master — управление':'Заменить Master-сессию'}}</h3>
<p v-if="!worker">Master — только управление и каталог, БЕЗ медиатрафика. Текущая сессия не удаляется при запросе входа. Переключение — только после проверки Telegram.</p>
<p v-if="worker">Worker — чтение видео и медиатрафик. Master здесь не используется. Работающую на ноде сессию сначала нужно отключить от пула.</p>
<div class="mr-progress">1 · Данные → 2 · Вход → 3 · Проверка → 4 · Переключение</div>
<div v-if="error" class="mr-error" role="alert">{{error}}</div>
<form v-if="phase==='INPUT'" @submit.prevent="start(methodTab)" class="mr-form">
<label v-if="!authorizing">Название сессии (необязательно)<input v-model="name" maxlength="200" autocomplete="off" /></label>
<label v-if="!authorizing">Название аккаунта Master для вашей Админки<input v-model="account" maxlength="200" placeholder="Например: основной Master" autocomplete="off" /></label>
<label v-if="props.canReuse && !authorizing" class="mr-check"><input v-model="useCurrent" type="checkbox" />Использовать сохранённые API-данные текущей Master — без повторного ввода секретов.</label>
<label v-if="!useCurrent">API ID приложения Master<input v-model="apiId" type="number" min="1" autocomplete="off" /></label>
<label v-if="!useCurrent">API Hash того же приложения Master<input v-model="apiHash" type="password" autocomplete="off" /></label>
<p>API ID и API Hash возьмите на my.telegram.org/apps. Файл .session и путь на сервере НЕ нужны: сессия создаётся здесь.</p>
<label class="mr-check"><input v-model="consent" type="checkbox" />Разрешаю начать вход в {{role}}-сессию. Подтвержу нужный аккаунт в Telegram.</label>
<div class="mr-tabs" role="tablist" aria-label="Способ входа">
<button type="button" role="tab" :aria-selected="methodTab==='code'" @click="methodTab='code'">По номеру телефона · Код</button>
<button type="button" role="tab" :aria-selected="methodTab==='qr'" @click="methodTab='qr'">По QR-коду</button>
</div>
<label v-if="methodTab==='code'">Телефон аккаунта {{role}}, +код страны<input v-model="phone" type="tel" autocomplete="tel" placeholder="+код страны и номер" /></label>
<p v-if="methodTab==='code'">Доставка выбирается Telegram. Старые коды не подходят. Если сообщения нет, вход по QR доступен в этом же окне.</p>
<button type="submit" :disabled="busy">{{busy?'Запрашиваем вход…':methodTab==='code'?'Запросить код Telegram':'Войти по QR — без кода сообщения'}}</button>
</form>
<div v-else-if="phase==='QR' || phase==='VERIFY'" class="mr-form">
<div class="mr-tabs" role="tablist" aria-label="Способ входа"><button role="tab" :aria-selected="methodTab==='code'" @click="methodTab='code'">По номеру телефона · Код</button><button role="tab" :aria-selected="methodTab==='qr'" @click="methodTab='qr'">По QR-коду</button></div>
<div v-if="methodTab==='code'"><label>Телефон аккаунта {{role}}<input v-model="phone" type="tel" autocomplete="tel" /></label><button :disabled="busy" @click="flowAction('switch-code')">Запросить код · тот же клиент</button></div>
<template v-else><strong>Сессия ещё НЕ авторизована. Подтвердите вход на телефоне.</strong>
<img v-if="qrSrc" :src="qrSrc" alt="QR входа в новую Master-сессию" width="260" height="260" />
<p>В Telegram нужного {{role}}-аккаунта: Настройки → Устройства → Подключить устройство. Сканируйте этот QR и подтвердите вход. Не отправляйте QR в чат.</p>
<p>QR: осталось около {{remaining}} с. Статус проверяется автоматически; истёкший QR обновится в этом окне.</p>
<button :disabled="busy" @click="poll">Проверить подтверждение</button></template>
</div>
<form v-else-if="phase==='CODE' || phase==='PASSWORD'" @submit.prevent="submit" class="mr-form">
<strong>Вход ещё не завершён. Старая сессия не заменена.</strong>
<p v-if="phase==='CODE'">{{delivery}}</p>
<label v-if="phase==='CODE'">Код текущего запроса Telegram<input v-model="code" type="password" inputmode="numeric" autocomplete="one-time-code" /></label>
<label v-else>Пароль двухэтапной аутентификации Telegram<input v-model="password" type="password" autocomplete="current-password" /></label>
<button type="submit" :disabled="busy">{{busy?'Проверяем в Telegram…':'Подтвердить вход'}}</button>
<template v-if="phase==='CODE'">
<button type="button" :disabled="busy || !resendAllowed || resendAfter>0" @click="flowAction('resend')">{{resendAfter>0?`Повтор через ${resendAfter} с.`:resendAllowed?'Запросить код повторно':'Telegram не разрешил повтор кода'}}</button>
<button type="button" :disabled="busy" @click="flowAction('switch-qr')">Вход по QR-коду — без сброса данных</button>
</template>
</form>
<div v-else-if="phase==='READY'" class="mr-ready">
<strong>✓ Новая сессия авторизована: Telegram подтвердил вход.</strong><p>{{identity}}</p>
<p>Проверьте, что это нужный {{role}}. Следующая кнопка сохранит проверенную сессию для выбранной роли.</p>
<button :disabled="busy" @click="commit">{{busy?'Сохраняем сессию…':`Использовать эту ${role}-сессию`}}</button>
</div>
<div v-else-if="phase==='COMMITTED'" class="mr-ready" role="status"><strong>✓ {{role}} {{authorizing?'авторизован':'заменён'}}.</strong><p>Вход подтверждён Telegram, сессия сохранена для выбранной роли. Фильмы, каталог и другие сессии не удалялись.</p></div>
<div class="mr-actions">
<button v-if="phase==='COMMITTED'" @click="emit('close')">Закрыть</button>
<template v-else><button :disabled="busy" @click="cancel()">Отменить и закрыть</button><button v-if="phase!=='INPUT'" :disabled="busy" @click="cancel(false)">Начать вход заново</button></template>
</div>
</section>
</div>
</Teleport>
</template>
<style scoped>
.mr-overlay{position:fixed;inset:0;background:#080c16b8;backdrop-filter:none;display:flex;align-items:center;justify-content:center;z-index:1100;padding:18px;box-sizing:border-box}
.mr-modal{box-sizing:border-box;background:var(--ui-raised);color:var(--ui-text);border:1px solid var(--ui-control);border-radius:var(--ui-radius-panel);padding:24px;width:100%;max-width:510px;max-height:90dvh;overflow-y:auto;overflow-wrap:anywhere;font-size:14px;line-height:1.55}
.mr-tabs{display:flex;gap:8px;flex-wrap:wrap}.mr-tabs [aria-selected=true]{outline:2px solid var(--ui-control);background:var(--ui-primary);color:var(--ui-on-primary)}h3{margin:0 0 12px;font-size:20px}.mr-progress{background:var(--ui-surface);padding:12px;border-radius:var(--ui-radius);margin:16px 0}.mr-form{display:flex;flex-direction:column;gap:14px}
label{display:flex;flex-direction:column;gap:7px;color:var(--ui-link)}input:not([type=checkbox]){box-sizing:border-box;min-width:0;width:100%;min-height:44px;background:var(--ui-surface);border:1px solid var(--ui-control);border-radius:var(--ui-radius);color:white;padding:10px;font-size:16px}.mr-check{flex-direction:row;align-items:flex-start}.mr-check input{margin-top:5px}
button{box-sizing:border-box;cursor:pointer;min-height:44px;border:1px solid var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-primary);color:var(--ui-on-primary);padding:10px 14px;font-size:14px;font-weight:600}button:disabled{opacity:.55;cursor:wait}summary{cursor:pointer;min-height:44px;padding-top:12px}details label,details button{margin-top:12px}.mr-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.mr-actions button{background:var(--ui-primary);border-color:var(--ui-control);color:var(--ui-on-primary)}.mr-error{color:var(--ui-danger);background:var(--ui-danger-bg);border:1px solid var(--ui-danger);border-radius:var(--ui-radius);padding:12px;margin-bottom:16px}.mr-ready{border:1px solid var(--ui-success);background:var(--ui-success-bg);padding:14px;border-radius:var(--ui-radius)}.mr-form img{max-width:100%;height:auto;align-self:center;background:var(--ui-raised);border:14px solid var(--ui-border);box-sizing:border-box;border-radius:var(--ui-radius)}p{margin:10px 0}@media(max-width:480px){.mr-overlay{padding:10px}.mr-modal{padding:18px}.mr-actions button{width:100%}}
</style>
