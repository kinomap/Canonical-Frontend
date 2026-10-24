<script setup lang="ts">
import {ref} from 'vue'
import axios from 'axios'
import MasterReplacement from './MasterReplacement.vue'
const props=defineProps<{mode:'create'|'authorize';sessionId?:string;sessionName?:string}>()
const emit=defineEmits<{success:[];cancel:[]}>()
const sid=ref(props.sessionId||'')
const busy=ref(false),error=ref('')
const name=ref(''),account=ref(''),apiId=ref(''),apiHash=ref('')
// getRandomValues is supported on the private HTTP WireGuard origin too.
// randomUUID is secure-context-only and prevented the POST from being sent.
function workerIdentifier(){
 const bytes=new Uint8Array(16)
 crypto.getRandomValues(bytes)
 bytes[6]=(bytes[6]!&0x0f)|0x40;bytes[8]=(bytes[8]!&0x3f)|0x80
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
 return 'worker-'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
}
async function create(){
 if(busy.value)return
 if(!account.value.trim()||!Number.isInteger(Number(apiId.value))||Number(apiId.value)<=0||!/^[a-fA-F0-9]{32}$/.test(apiHash.value.trim())){error.value='Заполните название аккаунта, API ID и API Hash Worker.';return}
 busy.value=true;error.value=''
 try{const r=await axios.post('/api/v1/admin/media/sessions',{name:name.value||null,account_identifier:account.value.trim(),session_identifier:workerIdentifier(),api_id:Number(apiId.value),api_hash:apiHash.value.trim(),max_streams:25},{headers:{Authorization:`Bearer ${localStorage.getItem('admin_token')}`}});sid.value=r.data.id;apiHash.value=''}
 catch(e:any){const d=e?.response?.data?.detail;error.value=typeof d==='string'?d:'Не удалось создать Worker. Данные сохранены.'}finally{busy.value=false}
}
</script>
<template>
<MasterReplacement v-if="sid" purpose="worker" :worker-id="sid" :initial-account="account||props.sessionName||'Worker'" @close="emit('cancel')" @replaced="emit('success')" />
<Teleport v-else to="body"><div class="aw-overlay"><section class="aw-modal" role="dialog" aria-modal="true" aria-label="Создать Worker">
<h3>Worker — видео и медиатрафик</h3><p>Это отдельный Telegram-аккаунт, НЕ Master. После данных приложения можно выбрать код или QR, затем 2FA при необходимости. Файл .session не нужен.</p>
<form @submit.prevent="create" style="display:grid;gap:14px"><label>Название сессии<input v-model="name" /></label><label>Название аккаунта Worker<input v-model="account" required /></label><label>API ID приложения Worker<input v-model="apiId" type="number" required /></label><label>API Hash того же приложения<input v-model="apiHash" type="password" autocomplete="off" required /></label><p v-if="error" role="alert">{{error}}</p><button :disabled="busy" type="submit">Продолжить к входу по коду или QR</button><button type="button" :disabled="busy" @click="emit('cancel')">Отменить</button></form>
</section></div></Teleport>
</template>
<style scoped>
.aw-overlay{position:fixed;inset:0;background:#080c16b8;display:flex;align-items:center;justify-content:center;z-index:1100;padding:12px;box-sizing:border-box}
.aw-modal{box-sizing:border-box;background:var(--ui-raised);color:var(--ui-text);border:1px solid var(--ui-control);border-radius:var(--ui-radius-panel);padding:24px;max-width:520px;width:100%;max-height:90dvh;overflow:auto;overflow-wrap:anywhere}
label{display:flex;flex-direction:column;gap:7px}input{box-sizing:border-box;min-width:0;width:100%;min-height:44px;background:var(--ui-surface);border:1px solid var(--ui-control);border-radius:var(--ui-radius);color:white;padding:10px;font-size:16px}button{min-height:44px;border:1px solid var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-primary);color:var(--ui-on-primary);padding:10px;font-size:14px;cursor:pointer}button:disabled{opacity:.55}p[role=alert]{background:var(--ui-danger-bg);color:var(--ui-danger);padding:12px;border-radius:var(--ui-radius)}
</style>
