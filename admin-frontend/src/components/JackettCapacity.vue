<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import axios from 'axios'

// Load of the shared torrent search (queue + quota scopes of the Jackett
// instances); computed by the backend from its database, no tracker request.
// Also the instances themselves: CPU/RAM from the host collector, and the
// Admin add/remove jobs executed on the host by kinosota-service-updater.
type Sample = { cpu_percent: number; memory_mb: number; memory_limit_mb: number }
type Usage = { cpu_percent: number; memory_mb: number; jackett?: Sample; flaresolverr?: Sample }
type Instance = { id: string; name: string; primary: boolean; removable: boolean; usage: Usage | null }
type Host = { cpus: number; memory_total_mb: number; memory_available_mb: number; disk_available_mb: number }
type Resources = { observed_at: string; stale: boolean; host: Host; instances: Record<string, Usage> }
type Job = {
  job_id: string; action: 'add' | 'remove'; instance_id: string; copy_from: string | null; has_proxy: boolean
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'rolled_back'; phase: string | null; error_code: string | null
  instances: number | null; indexers: number | null; copied_indexers: number | null
}
type Capacity = {
  level: 'green' | 'yellow' | 'red'; reasons: string[]; recommendation: 'none' | 'wait' | 'add_instance'
  instances: number; pending: number; searching: number; due: number; due_wait_seconds: number
  retrying: number; blocked_scopes: number
  max_instances?: number; memory_required_mb?: number; instance_list?: Instance[]
  resources?: Resources | null; job?: Job | null; can_add?: { ok: boolean; reason: string | null }
}
const emit = defineEmits<{ (e: 'instances-changed'): void }>()
const url = '/api/v1/admin/torrent-search/capacity'
const instancesUrl = '/api/v1/admin/torrent-search/instances'
const jobUrl = (id: string) => `/api/v1/admin/torrent-search/instance-jobs/${encodeURIComponent(id)}`
const REFRESH_MS = 30000
const POLL_MS = 3000
const ACTIVE = ['queued', 'running']
const capacity = ref<Capacity | null>(null)
const error = ref('')
const loading = ref(false)
const job = ref<Job | null>(null)
const jobError = ref('')
const sending = ref(false)
const adding = ref(false)
const copyTrackers = ref(true)
const proxy = ref('')
const removing = ref<Instance | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let poller: ReturnType<typeof setTimeout> | null = null
let alive = true
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
const phaseText: Record<string, string> = {
  claimed: 'задача принята сервером', precheck: 'проверка ресурсов сервера', copy: 'копирование трекеров',
  starting: 'запуск Jackett и FlareSolverr', syncing: 'подключение к поиску', draining: 'вывод из поиска',
  removing: 'удаление контейнеров', rollback: 'откат изменений', done: 'готово',
}
const failureText: Record<string, string> = {
  // Host executor (kinosota-service-updater)
  precheck_failed: 'проверка перед запуском не пройдена',
  insufficient_resources: 'на сервере недостаточно памяти или места на диске',
  instance_exists: 'такой инстанс уже существует',
  instance_missing: 'инстанс не найден на сервере',
  copy_failed: 'не удалось скопировать трекеры',
  start_failed: 'Jackett или FlareSolverr не запустились',
  health_failed: 'Backend не смог подключиться к новому инстансу',
  remove_failed: 'не удалось удалить контейнеры инстанса',
  rollback_failed: 'откат не завершён: нужна ручная проверка сервера',
  interrupted: 'операция прервана',
  updater_error: 'внутренняя ошибка исполнителя на сервере',
  // Backend
  lease_lost: 'исполнитель на сервере перестал отвечать',
  updater_unavailable: 'исполнитель на сервере не взял задачу (kinosota-service-updater не запущен?)',
}
const requestText: Record<string, string> = {
  confirmation_required: 'Операция не подтверждена.',
  invalid_proxy: 'Прокси указан неверно: нужен http://, socks4:// или socks5://[логин:пароль@]хост:порт.',
  proxy_not_public: 'Прокси должен быть публичным адресом в Интернете, не во внутренней сети.',
  instance_limit_reached: 'Достигнут предел числа инстансов.',
  instance_job_in_progress: 'Уже выполняется операция с инстансами. Дождитесь её завершения.',
  insufficient_resources: 'На сервере недостаточно свободной памяти для ещё одного инстанса.',
  search_not_installed: 'Общий поиск торрентов ещё не установлен.',
  unknown_copy_source: 'Основной инстанс для копирования трекеров не найден.',
  unknown_instance: 'Инстанс не найден. Обновите страницу.',
  primary_instance_protected: 'Основной инстанс удалить нельзя.',
  last_instance_protected: 'Последний инстанс удалить нельзя.',
  job_not_found: 'Задача не найдена.',
}
const level = computed(() => capacity.value?.level || 'green')
const title = computed(() => capacity.value ? labels[capacity.value.level] || 'Нагрузка неизвестна' : 'Нагрузка неизвестна')
const reasons = computed(() => (capacity.value?.reasons || []).map(r => reasonText[r]).filter(Boolean))
const recommendation = computed(() => capacity.value ? advice[capacity.value.recommendation] || '' : '')
const list = computed<Instance[]>(() => Array.isArray(capacity.value?.instance_list) ? capacity.value!.instance_list! : [])
const host = computed(() => capacity.value?.resources?.host || null)
const stale = computed(() => !!capacity.value?.resources?.stale)
const active = computed(() => !!job.value && ACTIVE.includes(job.value.status))
const blockedText = computed(() => {
  const c = capacity.value
  const reason = c?.can_add?.reason
  if (!c || !reason || c.can_add?.ok) return ''
  if (reason === 'instance_limit_reached') return `Достигнут предел: ${c.max_instances ?? 16} инстансов.`
  if (reason === 'insufficient_resources') return `Недостаточно памяти: нужно не меньше ${c.memory_required_mb ?? 1536} МБ свободной RAM.`
  return requestText[reason] || 'Добавление сейчас недоступно.'
})
const canAdd = computed(() => !!capacity.value?.can_add?.ok && !active.value && !sending.value)
// Same IP: under a tracker rate limit a new instance helps only through its own proxy.
const sameIpWarning = computed(() => (capacity.value?.reasons || []).includes('rate_limited') && !proxy.value.trim())
const jobTitle = computed(() => {
  const j = job.value
  if (!j) return ''
  const what = j.action === 'add' ? `Добавление инстанса ${j.instance_id}` : `Удаление инстанса ${j.instance_id}`
  if (j.status === 'queued') return `${what}: ждёт исполнителя на сервере`
  if (j.status === 'running') return `${what}: ${phaseText[j.phase || ''] || 'выполняется'}`
  if (j.status === 'succeeded') {
    if (j.action === 'remove') return `${what}: готово.`
    const copied = typeof j.copied_indexers === 'number' && j.copy_from ? `, скопировано трекеров: ${j.copied_indexers}` : ''
    return `${what}: готово${copied}.`
  }
  const why = failureText[j.error_code || ''] || 'ошибка'
  return j.status === 'rolled_back' ? `${what}: не удалось (${why}), изменения отменены.` : `${what}: не удалось (${why}).`
})
const jobTone = computed(() => !job.value || active.value ? 'progress' : job.value.status === 'succeeded' ? 'ok' : 'failed')

function mb(value: number | undefined | null) {
  return typeof value === 'number' && isFinite(value) ? `${Math.round(value)} МБ` : '—'
}
function cpu(value: number | undefined | null) {
  return typeof value === 'number' && isFinite(value) ? `${value.toFixed(1)} %` : '—'
}
function validJob(value: any): value is Job {
  return !!value && typeof value.job_id === 'string' && ['add', 'remove'].includes(value.action)
    && ['queued', 'running', 'succeeded', 'failed', 'rolled_back'].includes(value.status)
}
function stopPolling() { if (poller) clearTimeout(poller); poller = null }
function schedule() { stopPolling(); if (alive) poller = setTimeout(poll, POLL_MS) }
function track(value: Job) {
  job.value = value; jobError.value = ''
  if (ACTIVE.includes(value.status)) schedule()
}
async function poll() {
  poller = null
  const current = job.value
  if (!alive || !current) return
  try {
    const { data } = await axios.get(jobUrl(current.job_id), auth())
    if (!alive) return
    if (!validJob(data?.job)) throw new Error('shape')
    job.value = data.job
    if (ACTIVE.includes(data.job.status)) { schedule(); return }
    // Finished: the instance lists changed (or were restored): reload them.
    emit('instances-changed')
    await load()
  } catch (e: any) {
    if (!alive) return
    jobError.value = 'Не удалось получить состояние операции, повторяем…'
    schedule()
  }
}
function failure(e: any, fallback: string) {
  const status = e?.response?.status
  if (status === 403) return 'Нужны права администратора.'
  const code = e?.response?.data?.code
  // Only fixed texts for known codes; never the raw server message.
  return (typeof code === 'string' && requestText[code]) || fallback
}
async function load() {
  loading.value = true
  try {
    const { data } = await axios.get(url, auth())
    if (!alive) return
    if (!data || !['green', 'yellow', 'red'].includes(data.level)) throw new Error('shape')
    capacity.value = data; error.value = ''
    // An operation started elsewhere (or before a reload) is followed too.
    if (validJob(data.job) && (!job.value || job.value.job_id !== data.job.job_id || !active.value)) {
      if (ACTIVE.includes(data.job.status)) track(data.job)
      else if (!job.value) job.value = data.job
    }
  } catch (e: any) {
    if (!alive) return
    // Never the raw server message: a fixed, safe text only.
    error.value = e?.response?.status === 403 ? 'Нужны права администратора.' : 'Не удалось получить нагрузку поиска.'
  } finally { if (alive) loading.value = false }
}
function openAdd() {
  if (!canAdd.value) return
  copyTrackers.value = true; proxy.value = ''; jobError.value = ''; adding.value = true
}
function closeDialogs() { adding.value = false; removing.value = null; proxy.value = '' }
async function confirmAdd() {
  if (sending.value || active.value) return
  sending.value = true; jobError.value = ''
  const body: Record<string, any> = { confirm: true, copy_trackers: copyTrackers.value }
  const value = proxy.value.trim()
  if (value) body.proxy = value
  try {
    const { data } = await axios.post(instancesUrl, body, auth())
    if (!alive) return
    if (!validJob(data?.job)) throw new Error('shape')
    closeDialogs(); track(data.job)
  } catch (e: any) {
    if (alive) jobError.value = failure(e, 'Не удалось поставить добавление инстанса в очередь.')
  } finally { if (alive) sending.value = false }
}
function askRemove(row: Instance) {
  if (!row.removable || active.value || sending.value) return
  jobError.value = ''; removing.value = row
}
async function confirmRemove() {
  const row = removing.value
  if (!row || sending.value || active.value) return
  sending.value = true; jobError.value = ''
  try {
    const { data } = await axios.delete(`${instancesUrl}/${encodeURIComponent(row.id)}`, { ...auth(), data: { confirm: true } })
    if (!alive) return
    if (!validJob(data?.job)) throw new Error('shape')
    closeDialogs(); track(data.job)
  } catch (e: any) {
    if (alive) jobError.value = failure(e, 'Не удалось поставить удаление инстанса в очередь.')
  } finally { if (alive) sending.value = false }
}
onMounted(() => { timer = setInterval(load, REFRESH_MS); return load() })
onBeforeUnmount(() => { alive = false; if (timer) clearInterval(timer); timer = null; stopPolling(); proxy.value = '' })
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

      <div class="capacity-instances" aria-labelledby="instances-title">
        <div class="capacity-heading">
          <h3 id="instances-title">Инстансы Jackett</h3>
          <button type="button" class="capacity-add" :disabled="!canAdd" @click="openAdd">Добавить инстанс</button>
        </div>
        <p v-if="host" class="capacity-host">
          Сервер: {{ host.cpus }} CPU · свободно RAM {{ mb(host.memory_available_mb) }} из {{ mb(host.memory_total_mb) }}
          · свободно на диске {{ mb(host.disk_available_mb) }}<span v-if="stale" class="capacity-stale"> (данные устарели)</span>
        </p>
        <p v-else class="capacity-host">Нет данных о CPU/RAM: сборщик ресурсов на сервере ещё не отчитался.</p>
        <p v-if="blockedText && !active" class="capacity-blocked">{{ blockedText }}</p>
        <table v-if="list.length" class="capacity-table">
          <thead><tr><th scope="col">Инстанс</th><th scope="col">CPU</th><th scope="col">RAM</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead>
          <tbody>
            <tr v-for="row in list" :key="row.id">
              <td>{{ row.name }} <span class="capacity-id">{{ row.id }}</span><span v-if="row.primary" class="capacity-badge">основной</span></td>
              <td>{{ cpu(row.usage?.cpu_percent) }}</td>
              <td>{{ mb(row.usage?.memory_mb) }}</td>
              <td><button v-if="row.removable" type="button" :disabled="active || sending" @click="askRemove(row)">Удалить</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="job" class="capacity-job" :class="jobTone" role="status" aria-live="polite">{{ jobTitle }}</p>
        <p v-if="jobError" class="capacity-error" role="alert">{{ jobError }}</p>
      </div>

      <div v-if="adding" class="capacity-dialog" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <h3 id="add-title">Добавить инстанс Jackett</h3>
        <p>Новый Jackett со своим FlareSolverr (около {{ capacity.memory_required_mb ?? 1536 }} МБ RAM) будет искать параллельно с остальными.</p>
        <label class="capacity-check"><input v-model="copyTrackers" type="checkbox"> Скопировать трекеры из основного инстанса</label>
        <label class="capacity-field">Прокси (необязательно)
          <input v-model="proxy" type="text" autocomplete="off" spellcheck="false" placeholder="socks5://логин:пароль@хост:порт">
        </label>
        <p v-if="sameIpWarning" class="capacity-warning" role="alert">
          Трекер ограничивает частоту запросов (429). Без прокси новый инстанс ходит на трекеры с того же IP, и лимит это не снимет.
        </p>
        <div class="capacity-actions">
          <button type="button" class="capacity-primary" :disabled="sending" @click="confirmAdd">Добавить</button>
          <button type="button" :disabled="sending" @click="closeDialogs">Отмена</button>
        </div>
      </div>
      <div v-if="removing" class="capacity-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title">
        <h3 id="remove-title">Удалить инстанс {{ removing.name }}?</h3>
        <p>Инстанс сначала выводится из поиска, затем удаляются его контейнеры и настройки трекеров. Поиск продолжится на остальных инстансах.</p>
        <div class="capacity-actions">
          <button type="button" class="capacity-danger" :disabled="sending" @click="confirmRemove">Удалить</button>
          <button type="button" :disabled="sending" @click="closeDialogs">Отмена</button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.capacity-panel{margin:0 0 24px;padding:24px;border:1px solid var(--ui-border,#39404b);border-radius:12px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);font-size:16px;line-height:1.5}
.capacity-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.capacity-heading h2{margin:0;font-size:20px}.capacity-heading h3{margin:0;font-size:18px}
.capacity-panel button{font:inherit;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);min-height:44px;padding:8px 12px;cursor:pointer}
.capacity-panel button:disabled{opacity:.55;cursor:not-allowed}.capacity-panel :focus-visible{outline:2px solid #f6cf4b;outline-offset:3px}
.capacity-level{display:flex;align-items:center;gap:10px;margin:16px 0 8px}.capacity-dot{width:14px;height:14px;border-radius:50%;flex:none}
.capacity-level.green .capacity-dot{background:#71ce90}.capacity-level.yellow .capacity-dot{background:#f6cf4b}.capacity-level.red .capacity-dot{background:#ff8a80}
.capacity-reasons{margin:0 0 8px;padding-left:20px;color:var(--ui-text-muted,#b9c1cf)}.capacity-advice{margin:0 0 16px}
.capacity-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0}
.capacity-metrics div{padding:10px 12px;border:1px solid var(--ui-border,#39404b);border-radius:8px}.capacity-metrics dt{font-size:14px;color:var(--ui-text-muted,#b9c1cf)}.capacity-metrics dd{margin:0;font-size:18px}
.capacity-error{color:#ffb6af;border-left:3px solid #ff8a80;padding-left:12px}
.capacity-instances{margin-top:20px;padding-top:16px;border-top:1px solid var(--ui-border,#39404b)}
.capacity-host,.capacity-blocked{margin:8px 0;color:var(--ui-text-muted,#b9c1cf)}.capacity-stale{color:#f6cf4b}
.capacity-table{width:100%;border-collapse:collapse;margin:8px 0}.capacity-table th,.capacity-table td{text-align:left;padding:8px;border-bottom:1px solid var(--ui-border,#39404b)}
.capacity-id{color:var(--ui-text-muted,#b9c1cf);font-size:14px;margin-left:6px}.capacity-badge{margin-left:8px;padding:1px 8px;border-radius:10px;background:#2b3646;font-size:13px}
.capacity-job{margin:8px 0;padding-left:12px;border-left:3px solid #8fb8ff}.capacity-job.ok{border-color:#71ce90}.capacity-job.failed{border-color:#ff8a80;color:#ffb6af}
.capacity-dialog{margin-top:16px;padding:16px;border:1px solid #8fb8ff;border-radius:10px;background:var(--ui-surface-raised,#1d2430)}.capacity-dialog h3{margin:0 0 8px;font-size:18px}
.capacity-check,.capacity-field{display:flex;gap:8px;margin:10px 0}.capacity-field{flex-direction:column}
.capacity-field input{font:inherit;min-height:40px;padding:6px 10px;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8)}
.capacity-warning{color:#f6cf4b;border-left:3px solid #f6cf4b;padding-left:12px}.capacity-actions{display:flex;gap:12px;margin-top:12px}
.capacity-panel .capacity-danger{border-color:#ff8a80}.capacity-panel .capacity-primary{border-color:#71ce90}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
