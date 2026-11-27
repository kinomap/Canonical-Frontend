<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import axios from 'axios'

// Load of the shared torrent search (queue + quota scopes of the Jackett
// instances); computed by the backend from its database, no tracker request.
type Capacity = {
  level: 'green' | 'yellow' | 'red'; reasons: string[]; recommendation: 'none' | 'wait' | 'add_instance'
  instances: number; pending: number; searching: number; due: number; due_wait_seconds: number
  retrying: number; blocked_scopes: number
}
const url = '/api/v1/admin/torrent-search/capacity'
const REFRESH_MS = 30000
const capacity = ref<Capacity | null>(null)
const error = ref('')
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }, timeout: 15000 })

const labels: Record<string, string> = { green: 'Нагрузка в норме', yellow: 'Нагрузка повышена', red: 'Перегрузка поиска' }
const reasonText: Record<string, string> = {
  backlog: 'запросы ждут свободный инстанс Jackett',
  rate_limited: 'трекер ограничил частоту запросов (429)',
  retrying: 'часть запросов повторяется после ошибок',
}
const advice: Record<string, string> = {
  add_instance: 'Рекомендуется добавить инстанс Jackett: каждый инстанс ищет параллельно со своей квотой.',
  wait: 'Новый инстанс за тем же IP лимит трекера не снимет: подождите или проверьте трекер.',
  none: 'Текущих инстансов достаточно.',
}
const level = computed(() => capacity.value?.level || 'green')
const title = computed(() => capacity.value ? labels[capacity.value.level] || 'Нагрузка неизвестна' : 'Нагрузка неизвестна')
const reasons = computed(() => (capacity.value?.reasons || []).map(r => reasonText[r]).filter(Boolean))
const recommendation = computed(() => capacity.value ? advice[capacity.value.recommendation] || '' : '')

async function load() {
  loading.value = true
  try {
    const { data } = await axios.get(url, auth())
    if (!data || !['green', 'yellow', 'red'].includes(data.level)) throw new Error('shape')
    capacity.value = data; error.value = ''
  } catch (e: any) {
    // Never the raw server message: a fixed, safe text only.
    error.value = e?.response?.status === 403 ? 'Нужны права администратора.' : 'Не удалось получить нагрузку поиска.'
  } finally { loading.value = false }
}
onMounted(() => { timer = setInterval(load, REFRESH_MS); return load() })
onBeforeUnmount(() => { if (timer) clearInterval(timer); timer = null })
defineExpose({ load })
</script>

<template>
  <section class="capacity-panel" aria-labelledby="capacity-title" :aria-busy="loading">
    <div class="capacity-heading">
      <h2 id="capacity-title">Нагрузка поиска торрентов</h2>
      <button type="button" :disabled="loading" @click="load">Обновить</button>
    </div>
    <p v-if="error" class="capacity-error" role="alert">{{ error }}</p>
    <template v-else-if="capacity">
      <p class="capacity-level" :class="level" role="status">
        <span class="capacity-dot" aria-hidden="true"></span><strong>{{ title }}</strong>
      </p>
      <ul v-if="reasons.length" class="capacity-reasons"><li v-for="r in reasons" :key="r">{{ r }}</li></ul>
      <p class="capacity-advice">{{ recommendation }}</p>
      <dl class="capacity-metrics">
        <div><dt>Инстансов Jackett</dt><dd>{{ capacity.instances }}</dd></div>
        <div><dt>В очереди / ищется</dt><dd>{{ capacity.pending }} / {{ capacity.searching }}</dd></div>
        <div><dt>Ждут сейчас</dt><dd>{{ capacity.due }}</dd></div>
        <div><dt>Дольше всех ждёт</dt><dd>{{ capacity.due_wait_seconds }} с</dd></div>
        <div><dt>Повторы после ошибок</dt><dd>{{ capacity.retrying }}</dd></div>
        <div><dt>Инстансов под 429</dt><dd>{{ capacity.blocked_scopes }}</dd></div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.capacity-panel{margin:0 0 24px;padding:24px;border:1px solid var(--ui-border,#39404b);border-radius:12px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);font-size:16px;line-height:1.5}
.capacity-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.capacity-heading h2{margin:0;font-size:20px}
.capacity-panel button{font:inherit;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);min-height:44px;padding:8px 12px;cursor:pointer}
.capacity-panel button:disabled{opacity:.55;cursor:wait}.capacity-panel :focus-visible{outline:2px solid #f6cf4b;outline-offset:3px}
.capacity-level{display:flex;align-items:center;gap:10px;margin:16px 0 8px}.capacity-dot{width:14px;height:14px;border-radius:50%;flex:none}
.capacity-level.green .capacity-dot{background:#71ce90}.capacity-level.yellow .capacity-dot{background:#f6cf4b}.capacity-level.red .capacity-dot{background:#ff8a80}
.capacity-reasons{margin:0 0 8px;padding-left:20px;color:var(--ui-text-muted,#b9c1cf)}.capacity-advice{margin:0 0 16px}
.capacity-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0}
.capacity-metrics div{padding:10px 12px;border:1px solid var(--ui-border,#39404b);border-radius:8px}.capacity-metrics dt{font-size:14px;color:var(--ui-text-muted,#b9c1cf)}.capacity-metrics dd{margin:0;font-size:18px}
.capacity-error{color:#ffb6af;border-left:3px solid #ff8a80;padding-left:12px}
</style>
