<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
import axios from 'axios'
const token=ref(''), revision=ref(0), configured=ref(false), source=ref(''), busy=ref(false), message=ref(''), failure=ref(false)
const zones=ref<Array<{id:string;name:string;status:string}>>([])
const headers=()=>({Authorization:`Bearer ${localStorage.getItem('admin_token') || ''}`})
const base='/api/v1/admin/domains/cloudflare'
async function load(){
 try {const {data}=await axios.get(base,{headers:headers()});revision.value=data.revision;configured.value=data.configured;source.value=data.source}
 catch {failure.value=true;message.value='Настройки недоступны. Проверьте права администратора и миграцию БД.'}
}
async function perform(save:boolean){
 busy.value=true;failure.value=false;message.value=''
 try {
  const data=save ? (await axios.put(base,{token:token.value,expected_revision:revision.value},{headers:headers()})).data
    : token.value ? (await axios.post(`${base}/verify`,{token:token.value},{headers:headers()})).data
    : (await axios.get(`${base}/zones`,{headers:headers()})).data
  zones.value=data.zones
  if(save){token.value='';await load();message.value='Токен проверен и сохранён в зашифрованном виде. Новые DNS-операции используют его без перезапуска.'}
  else message.value='Проверка завершена; список зон обновлён. Новый токен ещё не сохранён.'
 } catch {failure.value=true;message.value='Операция не выполнена. Проверьте токен и доступ Zone:Read / DNS:Edit; при конфликте изменений обновите страницу.'}
 finally {busy.value=false}
}
const domainState=ref<any>(null),domainMessage=ref(''),domainSubmitting=ref(false),keyLoaded=ref(false)
const formRevision=ref(0),currentPrimary=ref(''),primary=ref(''),mirrorText=ref(''),publicIp=ref(''),sshPort=ref(22),sshUser=ref('root'),sshPin=ref(''),controlAddress=ref('10.8.0.1'),tlsEmail=ref(''),confirmDomain=ref(false)
let privateKey='',pollTimer:ReturnType<typeof setInterval>|undefined
const operationBusy=computed(()=>['QUEUED','RUNNING','COMMITTING','REQUIRES_REVIEW','COMPLETED_REQUIRES_REVIEW'].includes(domainState.value?.operation?.status))
async function loadDomain(reset=false){
 try {
  const {data}=await axios.get('/api/v1/admin/domains/state',{headers:headers()});domainState.value=data
  if(reset){
   formRevision.value=data.revision
   if(data.showcase){const c=data.showcase;currentPrimary.value=c.primary;primary.value=c.primary;mirrorText.value=c.mirrors.join('\n');publicIp.value=c.target.public_ip;sshPort.value=c.target.ssh_port;sshUser.value=c.target.ssh_username;sshPin.value=c.target.ssh_fingerprint;controlAddress.value=c.target.control_address}
   domainMessage.value='Состояние формы обновлено. Передайте SSH key только для этой операции; он не сохраняется в БД.'
  }
 }catch{domainMessage.value='Domain Center недоступен. Переключение запрещено; проверьте Backend и права Admin.';domainState.value=null}
}
async function readKey(event:Event){
 privateKey='';keyLoaded.value=false
 const file=(event.target as HTMLInputElement).files?.[0]
 if(!file)return
 if(file.size>32768){domainMessage.value='SSH key должен быть не более 32 KiB';return}
 privateKey=await file.text();keyLoaded.value=privateKey.length>=32
}
async function changeDomain(){
 if(!domainState.value?.production||!confirmDomain.value||operationBusy.value||!keyLoaded.value)return
 domainSubmitting.value=true;domainMessage.value='Запуск проверок. DNS/TLS не считаются готовыми до завершения всех этапов.'
 try{
  await axios.post('/api/v1/admin/domains/showcase',{
   expected_revision:formRevision.value,current_primary:currentPrimary.value,primary:primary.value,
   mirrors:mirrorText.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean),tls_email:tlsEmail.value,
   target:{public_ip:publicIp.value,ssh_port:sshPort.value,ssh_username:sshUser.value,ssh_fingerprint:sshPin.value,control_address:controlAddress.value},
   ssh_private_key:privateKey,confirm:true
  },{headers:headers()})
  domainMessage.value='Операция принята. SSH key удалён из формы; наблюдайте этапы ниже. После завершения обновите форму.'
  privateKey='';keyLoaded.value=false;confirmDomain.value=false
  const input=document.getElementById('domain-ssh-key') as HTMLInputElement|null;if(input)input.value=''
  await loadDomain()
 }catch{domainMessage.value='Операция не принята. Обновите состояние формы; проверьте production, параметры, подтверждение и незавершённую предыдущую операцию.'}
 finally{domainSubmitting.value=false}
}
const nodeState=ref<any>(null),nodeMessage=ref(''),nodeRevision=ref(0),nextNodeDomain=ref(''),nodeSubmitting=ref(false),confirmNodes=ref(false)
const nodeKeys=ref<Record<string,string>>({})
const nodeBusy=computed(()=>['QUEUED','RUNNING','COMMITTING','REQUIRES_REVIEW','COMPLETED_REQUIRES_REVIEW'].includes(nodeState.value?.operation?.status))
const nodeReady=computed(()=>nodeState.value?.production && nodeState.value?.nodes?.length>0 && nodeState.value.nodes.every((n:any)=>n.provisioned && n.pinned && nodeKeys.value[n.node_id]?.length>=32) && !!nextNodeDomain.value && nextNodeDomain.value!==nodeState.value.base_domain && confirmNodes.value && !nodeBusy.value && !operationBusy.value && !nodeSubmitting.value)
function clearNodeKeys(){nodeKeys.value={};document.querySelectorAll<HTMLInputElement>('.node-cutover-key').forEach(i=>i.value='')}
async function loadNodes(reset=false){
 try{const {data}=await axios.get('/api/v1/admin/domains/nodes/state',{headers:headers()});nodeState.value=data;if(reset){nodeRevision.value=data.revision;clearNodeKeys();confirmNodes.value=false}}
 catch{nodeState.value=null;nodeMessage.value='Состояние нод недоступно: переключение заблокировано.'}
}
async function readNodeKey(event:Event,nodeId:string){
 delete nodeKeys.value[nodeId]
 const input=event.target as HTMLInputElement,file=input.files?.[0]
 if(!file)return
 if(file.size>32768){input.value='';nodeMessage.value='SSH key превышает 32 KiB';return}
 nodeKeys.value[nodeId]=await file.text()
}
async function cutoverNodes(){
 if(!nodeReady.value)return
 nodeSubmitting.value=true;nodeMessage.value='Запуск общей транзакции; конечный PASS только после всех проверок.'
 try{
  await axios.post('/api/v1/admin/domains/nodes/cutover',{expected_revision:nodeRevision.value,current_domain:nodeState.value.base_domain,new_domain:nextNodeDomain.value,confirm:true,access:nodeState.value.nodes.map((n:any)=>({node_id:n.node_id,ssh_private_key:nodeKeys.value[n.node_id]}))},{headers:headers()})
  nodeMessage.value='Операция принята. Ключи удалены из формы; наблюдайте этапы ниже.'
  await loadNodes()
 }catch{nodeMessage.value='Операция не подтверждена. Обновите состояние; не повторяйте при RUNNING или REQUIRES_REVIEW.';await loadNodes()}
 finally{clearNodeKeys();confirmNodes.value=false;nodeSubmitting.value=false}
}
onMounted(()=>{load();loadDomain(true);loadNodes(true);pollTimer=setInterval(()=>{loadDomain();loadNodes()},2000)})
onBeforeUnmount(()=>{if(pollTimer)clearInterval(pollTimer);privateKey='';keyLoaded.value=false;clearNodeKeys()})
</script>
<template>
 <main class="domains-page">
  <h1>Управление доменами и Cloudflare</h1>
  <section class="domain-card">
   <h2>Cloudflare API Token</h2>
   <p>Токен настроен: {{ configured ? 'да' : 'нет' }}. Источник: {{ source === 'database' ? 'зашифрованная БД' : 'окружение' }}.</p>
   <p>Нужны права чтения зон и изменения DNS только для используемых доменов. Сохранённый токен не возвращается в браузер.</p>
   <label for="cf-token">Новый API Token</label>
   <input id="cf-token" v-model="token" type="password" autocomplete="off" spellcheck="false" maxlength="512" :disabled="busy" />
   <div class="actions">
    <button :disabled="busy" @click="perform(false)">Проверить токен и загрузить зоны</button>
    <button :disabled="busy || token.length < 20" @click="perform(true)">Проверить и сохранить токен</button>
   </div>
   <p v-if="message" role="status" :class="{ failure }">{{ message }}</p>
   <ul><li v-for="zone in zones" :key="zone.id">{{ zone.name }} — {{ zone.status }}</li></ul>
  </section>
  <section class="domain-card">
   <h2>Домены публичной Витрины · VPS 2</h2>
   <p>Основной домен: {{ domainState?.showcase?.primary || 'ещё не зарегистрирован' }}. Зеркала: {{ domainState?.showcase?.mirrors?.join(', ') || 'нет' }}.</p>
   <p v-if="!domainState?.production" class="pending">Переключение разрешено только в production Control Plane. Существующий localhost не меняется.</p>
   <p>Только уже развёрнутый Public-only VPS2. Старый основной домен автоматически станет 301-зеркалом. Токен Cloudflare остаётся на Backend; приватный SSH key существует только в памяти операции.</p>
   <button type="button" :disabled="domainSubmitting || operationBusy" @click="loadDomain(true)">Обновить состояние и форму</button>
   <form @submit.prevent="changeDomain">
    <label>Текущий домен на VPS2<input v-model="currentPrimary" required autocomplete="off" placeholder="watch.scenrix.com" /></label>
    <label>Основной домен Витрины<input v-model="primary" required autocomplete="off" /></label>
    <label>Домены-зеркала (до 10, по одному в строке)<textarea v-model="mirrorText" rows="3" autocomplete="off" /></label>
    <label>Публичный IPv4 VPS2<input v-model="publicIp" required autocomplete="off" /></label>
    <label>SSH port<input v-model.number="sshPort" type="number" min="1" max="65535" required /></label>
    <label>SSH user<input v-model="sshUser" required autocomplete="off" /></label>
    <label>Доверенный SHA256 host-key fingerprint из консоли провайдера<input v-model="sshPin" required autocomplete="off" /></label>
    <label>Адрес Backend в WireGuard<input v-model="controlAddress" required autocomplete="off" /></label>
    <label>Email Let's Encrypt (необязательно)<input v-model="tlsEmail" type="email" autocomplete="off" /></label>
    <label>Приватный SSH key · только на время операции<input id="domain-ssh-key" type="file" :disabled="domainSubmitting || operationBusy" @change="readKey" /></label>
    <p>{{ keyLoaded ? 'Ключ загружен в память формы' : 'Ключ не загружен' }}</p>
    <label><input v-model="confirmDomain" type="checkbox" required /> Подтверждаю VPS2 и DNS/TLS/301 изменения. Не использовать IP действующей Media Node.</label>
    <button type="submit" :disabled="!domainState?.production || domainSubmitting || operationBusy || !keyLoaded || !confirmDomain">Применить домены Витрины</button>
   </form>
   <p role="status">{{ domainMessage }}</p>
   <div v-if="domainState?.operation" role="status" class="operation-status">
    <b>{{ domainState.operation.status }}</b><p>{{ domainState.operation.stage }}</p>
    <p v-if="domainState.operation.dns_may_remain">При остановке добавленные DNS-записи сохраняются; чужие записи автоматически не удаляются.</p>
    <p v-if="operationBusy">Повтор заблокирован до завершения или проверенного восстановления. Не перезапускайте Backend во время операции.</p>
   </div>
  </section>
  <section class="domain-card" id="node-domain-cutover">
   <h2>Базовый домен Медиа-Нод · Cutover</h2>
   <p>Текущий базовый домен: {{ nodeState?.base_domain || 'не подтверждён' }}.</p>
   <p>Все активные ноды проходят pinned SSH → DNS Only A → DNS-01 TLS (старый + новый hostname) → Nginx / HTTPS / renewal dry-run. Только затем media_url переключается одной транзакцией. Ноды не переустанавливаются; WireGuard не меняется.</p>
   <p v-if="!nodeState?.production" class="pending">Production-only. Localhost и действующая тестовая нода не изменяются.</p>
   <button :disabled="nodeBusy || nodeSubmitting" @click="loadNodes(true)">Обновить список нод и ревизию</button>
   <form @submit.prevent="cutoverNodes">
    <label>Новый базовый домен<input id="nodes-base-domain" v-model="nextNodeDomain" required autocomplete="off" list="active-node-zones" /></label>
    <datalist id="active-node-zones"><option v-for="z in zones.filter(z=>z.status==='active')" :key="z.id" :value="z.name" /></datalist>
    <div v-for="n in nodeState?.nodes || []" :key="n.node_id">
     <p>{{ n.node_id }} · {{ n.public_ip }} · {{ n.media_endpoint }} · {{ n.pinned && n.provisioned ? '✓ Зарегистрирован и SSH pin задан' : '✗ Нужен provision / SSH pin' }}</p>
     <label>SSH key для {{ n.node_id }} · только в памяти<input class="node-cutover-key" type="file" :disabled="nodeBusy || nodeSubmitting" @change="readNodeKey($event,n.node_id)" /></label>
     <p>{{ nodeKeys[n.node_id]?.length>=32 ? '✓ Ключ загружен; SSH ещё не проверен' : '✗ Ключ не загружен' }}</p>
    </div>
    <label><input v-model="confirmNodes" type="checkbox" /> Подтверждаю DNS/TLS-переключение всех активных нод.</label>
    <button id="nodes-cutover-submit" type="submit" :disabled="!nodeReady">Сменить домен нод (Cutover)</button>
   </form>
   <p role="status">{{ nodeMessage }}</p>
   <div v-if="nodeState?.operation" role="status" class="operation-status">
    <b>{{ nodeState.operation.status }}</b><p>{{ nodeState.operation.stage }}</p>
    <p v-if="nodeState.operation.dns_may_remain">Добавленные DNS и TLS-артефакты сохраняются для проверки. При откате новая renewal-конфигурация изолируется; старые endpoints сохраняются.</p>
    <p v-if="nodeBusy">Повтор и lifecycle-изменения заблокированы. При REQUIRES_REVIEW нужна проверка удалённых маркеров и commit; автоматического сброса нет.</p>
   </div>
  </section>
 </main>
</template>
<style scoped>
.domains-page{padding:24px;max-width:980px;color:#e2e8f0}.domain-card{padding:24px;background:#111827;border:1px solid #334155;border-radius:12px;margin:20px 0}.domain-card p,.pending{line-height:1.6;color:#94a3b8}label{display:block;margin:20px 0 8px}textarea{box-sizing:border-box;width:100%;padding:12px;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px}input[type=checkbox]{width:auto}.operation-status{margin-top:16px;padding:16px;border:1px solid #475569;border-radius:6px}input{box-sizing:border-box;width:100%;padding:12px;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}button{padding:10px 16px;border-radius:6px;background:#2563eb;color:white;border:0;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.failure{color:#fca5a5!important}.pending{border-left:3px solid #f59e0b;padding:12px}
</style>
