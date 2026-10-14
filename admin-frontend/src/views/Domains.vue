<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
onMounted(load)
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
  <p class="pending">Смена основного домена, зеркала и массовый Cutover нод ещё не включены: сначала требуется готовый сценарий TLS и безопасного переключения. Изменение токена само по себе домены не переключает.</p>
 </main>
</template>
<style scoped>
.domains-page{padding:24px;max-width:980px;color:#e2e8f0}.domain-card{padding:24px;background:#111827;border:1px solid #334155;border-radius:12px;margin:20px 0}.domain-card p,.pending{line-height:1.6;color:#94a3b8}label{display:block;margin:20px 0 8px}input{box-sizing:border-box;width:100%;padding:12px;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}button{padding:10px 16px;border-radius:6px;background:#2563eb;color:white;border:0;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.failure{color:#fca5a5!important}.pending{border-left:3px solid #f59e0b;padding:12px}
</style>
