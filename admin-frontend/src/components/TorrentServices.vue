<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
const props=defineProps<{observation?:{observed_at:string;services:Record<string,{status:string;version:string|null;latency_ms:number|null}>}|null}>()
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{timer=setInterval(()=>{now.value=Date.now()},1000)})
onUnmounted(()=>{if(timer)clearInterval(timer)})
const age=computed(()=>props.observation?Math.floor((now.value-Date.parse(props.observation.observed_at))/1000):null)
const fresh=computed(()=>age.value!==null&&Number.isFinite(age.value)&&age.value>=-10&&age.value<=90)
</script>
<template>
  <section class="ts-panel" aria-label="Torrent services">
    <h2>Торрент-сервисы</h2>
    <p v-if="!observation" role="status">Телеметрия ещё не получена. Состояние сервисов не подтверждено.</p>
    <p v-else>{{ fresh?'Подтверждено нодой':'Данные устарели — текущее состояние неизвестно' }} · {{ age }} с назад</p>
    <div class="ts-grid"><article v-for="name in ['torrserver']" :key="name">
      <h3>TorrServer</h3>
      <strong>{{ !fresh?'Не подтверждено':observation?.services[name]?.status==='healthy'?'Работает':'Недоступен' }}</strong>
      <span>Версия: {{ observation?.services[name]?.version||'не получена' }}</span>
      <span>Отклик: {{ observation?.services[name]?.latency_ms??'—' }} мс</span>
    </article></div>
    <p>TorrServer закрыт от браузера. Jackett — общий сервис поиска вне пакета ноды; его состояние здесь не измеряется. Работа TorrServer не подтверждает готовность фильма. Сетевой показатель worker не включает весь трафик TorrServer и пиров; ёмкость торрент-ноды ещё не измерена. Автообновление выключено; версия закреплена в релизе ноды.</p>
  </section>
</template>
<style scoped>
.ts-panel{border:1px solid var(--ui-border,#454545);border-radius:12px;padding:24px;margin:24px 0;color:var(--ui-text,#eee)}.ts-panel h2{font-size:20px;line-height:28px;margin:0 0 12px}.ts-panel p{font-size:14px;line-height:22px;color:var(--ui-text-muted,#bdbdbd);margin:12px 0}.ts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.ts-grid article{display:flex;flex-direction:column;gap:8px;padding:16px;background:var(--ui-surface,#202020);border:1px solid var(--ui-border,#454545);border-radius:8px;font-size:14px;line-height:22px}.ts-grid h3{font-size:16px;margin:0}.ts-grid span{overflow-wrap:anywhere}@media(max-width:600px){.ts-panel{padding:16px}.ts-grid{grid-template-columns:minmax(0,1fr)}}
</style>
