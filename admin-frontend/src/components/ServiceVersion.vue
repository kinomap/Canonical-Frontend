<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'

type Job = { job_id: string; state: string; from_version: string | null; to_version: string; error_code: string | null; phase: string | null; rolled_back_to: string | null; late_report: boolean; created_at: string | null; finished_at: string | null }
type Target = { target: string; name: string; current_version: string | null; current_error: string | null; update_available: boolean; latest_installed: boolean; update_allowed?: boolean; job: Job | null }
type Latest = { latest_version: string | null; published_at?: string | null; release_url?: string | null; checked_at: string | null; error_code: string | null; image_published: boolean }
const props = defineProps<{ service: 'jackett' | 'torrserver'; target: string }>()
const base = '/api/v1/admin/services'
const ACTIVE = ['queued', 'running']
const latest = ref<Latest | null>(null)
const item = ref<Target | null>(null)
const loading = ref(false)
const submitting = ref(false)
const confirming = ref(false)
const error = ref('')
const notice = ref('')
let alive = true
let generation = 0
let failures = 0
let timer: ReturnType<typeof setTimeout> | undefined
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }, timeout: 30000 })
const title = computed(() => (props.service === 'jackett' ? 'Jackett' : 'TorrServer'))
const messages: Record<string, string> = {
  confirmation_required: 'Обновление не подтверждено.',
  invalid_update_body: 'Некорректный запрос обновления.',
  release_changed_reload: 'Актуальная версия изменилась. Данные обновлены — проверьте их и подтвердите снова.',
  image_not_published: 'Образ новой версии ещё не опубликован. Повторите позже.',
  current_version_unknown: 'Текущая версия не получена — обновление недоступно, пока сервис не ответит.',
  already_latest: 'Уже установлена последняя версия.',
  update_in_progress: 'Обновление этого сервиса уже выполняется.',
  telemetry_stale: 'Нет свежих данных от ноды — обновление недоступно, пока нода не подтвердит состояние.',
  target_not_allowed: 'Для этой ноды обновление не разрешено: нет приватного адреса управления.',
  unknown_target: 'Сервис не найден.',
  unknown_service: 'Неизвестный сервис.',
  jackett_not_connected: 'Jackett не подключён к Backend.',
  jackett_registry_invalid: 'Служебное подключение Jackett настроено некорректно.',
  job_not_found: 'Задача обновления не найдена.',
}
const jobErrors: Record<string, string> = {
  precheck_failed: 'предварительная проверка не прошла, сервис не изменён',
  target_not_allowed: 'цель обновления не разрешена исполнителю',
  image_mismatch: 'образ не совпал с ожидаемым, обновление отменено',
  pull_failed: 'не удалось загрузить образ, сервис не изменён',
  backup_failed: 'не удалось сделать резервную копию, сервис не изменён',
  start_failed: 'новая версия не запустилась',
  health_failed: 'новая версия не прошла проверку работоспособности',
  rollback_failed: 'откат не удался — требуется вмешательство оператора',
  interrupted: 'обновление было прервано',
  node_unreachable: 'нода недоступна по приватной сети',
  node_rejected: 'нода отклонила команду обновления',
  updater_error: 'внутренняя ошибка исполнителя обновлений',
  lease_lost: 'связь с исполнителем потеряна во время обновления — проверьте состояние сервиса',
  updater_unavailable: 'исполнитель обновлений на сервере не взял задачу за 10 минут, ничего не изменено',
}
const phases: Record<string, string> = {
  claimed: 'подготовка', precheck: 'проверка текущего состояния', pull: 'загрузка образа', backup: 'резервная копия настроек',
  start: 'перезапуск сервиса', health: 'проверка работоспособности', rollback: 'откат на прежнюю версию',
}
const currentErrors: Record<string, string> = {
  jackett_unavailable: 'Jackett не отвечает — текущая версия неизвестна',
  jackett_auth_failed: 'Backend не авторизован в Jackett — текущая версия неизвестна',
  telemetry_stale: 'Данные ноды устарели — текущая версия не подтверждена',
  version_unknown: 'Нода не сообщила версию TorrServer',
}
function failure(e: any, fallback = 'Не удалось получить данные о версиях. Повторите позже.') { return messages[e?.response?.data?.code] || fallback }
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const job = computed(() => item.value?.job || null)
const active = computed(() => !!job.value && ACTIVE.includes(job.value.state))
const releaseUrl = computed(() => { const url = latest.value?.release_url; return typeof url === 'string' && url.startsWith('https://github.com/') ? url : '' })
const canUpdate = computed(() => !!item.value?.update_available && item.value.update_allowed !== false && !active.value && !loading.value && !submitting.value)
const indicator = computed(() => {
  const t = item.value, rel = latest.value
  if (!t) return { kind: 'unknown', text: loading.value ? 'Проверка…' : 'Сервис не найден' }
  if (!t.current_version) return { kind: 'unknown', text: currentErrors[t.current_error || ''] || 'Текущая версия неизвестна' }
  if (t.update_available) return { kind: 'update', text: 'Доступно обновление' }
  if (t.latest_installed) return { kind: 'ok', text: 'Установлена последняя версия' }
  if (rel?.latest_version && !rel.image_published) return { kind: 'unknown', text: 'Вышла новая версия, её образ ещё не опубликован' }
  return { kind: 'unknown', text: 'Актуальная версия не проверена' }
})
const jobText = computed(() => {
  const j = job.value
  if (!j) return null
  if (j.state === 'queued') return { kind: 'run', text: `Обновление до ${j.to_version}: запрос принят, ожидает исполнителя на сервере…` }
  if (j.state === 'running') return { kind: 'run', text: `Обновление до ${j.to_version}: ${phases[j.phase || ''] || 'выполняется'}…` }
  if (!j.finished_at || Date.now() - Date.parse(j.finished_at) > 24 * 3600 * 1000) return null
  const reason = jobErrors[j.error_code || ''] || 'неизвестная ошибка'
  if (j.state === 'succeeded') return { kind: 'ok', text: `✓ Обновлено до ${j.to_version} (${when(j.finished_at)}).` }
  if (j.state === 'rolled_back') return { kind: 'bad', text: `Обновление до ${j.to_version} не прошло (${reason}) и автоматически откачено на ${j.rolled_back_to || j.from_version}. Сервис работает на прежней версии.` }
  return { kind: 'bad', text: `✗ Обновление до ${j.to_version} не выполнено: ${reason} (${when(j.finished_at)}).` }
})

function stop() { if (timer) clearTimeout(timer); timer = undefined }
async function load(refresh = false) {
  const token = ++generation
  loading.value = true; error.value = ''
  try {
    const { data } = await axios.get(`${base}/versions?service=${encodeURIComponent(props.service)}${refresh ? '&refresh=1' : ''}`, auth())
    if (!alive || token !== generation) return
    const svc = data?.services?.[props.service]
    latest.value = svc?.latest || null
    item.value = (svc?.targets || []).find((x: Target) => x.target === props.target) || null
    if (svc?.targets_error) error.value = messages[svc.targets_error] || 'Список сервисов недоступен.'
    if (active.value && job.value) { failures = 0; poll(job.value.job_id) }
  } catch (e) { if (alive && token === generation) error.value = failure(e) }
  finally { if (alive && token === generation) loading.value = false }
}
function ask() { if (canUpdate.value) { confirming.value = true; error.value = ''; notice.value = '' } }
async function submit() {
  const t = item.value, version = latest.value?.latest_version
  // Only an explicitly confirmed, currently offered update is ever sent.
  if (!confirming.value || !t?.update_available || t.update_allowed === false || !version || submitting.value || active.value) return
  submitting.value = true; error.value = ''; notice.value = ''
  try {
    // The server picks the digest-pinned image; the browser only confirms target and version.
    const { data } = await axios.post(`${base}/${encodeURIComponent(props.service)}/${encodeURIComponent(t.target)}/update`, { confirm: t.target, version }, auth())
    if (!alive) return
    confirming.value = false
    notice.value = 'Запрос принят. Обновление выполняется на сервере с проверкой работоспособности и автоматическим откатом.'
    if (item.value && data?.job) { item.value = { ...item.value, job: data.job }; poll(data.job.job_id) }
  } catch (e: any) {
    if (!alive) return
    confirming.value = false; error.value = failure(e, 'Запрос обновления не подтверждён сервером. Проверьте состояние и повторите.')
    const code = e?.response?.data?.code
    // Fresh state (e.g. a job started elsewhere or lost reply); the reason stays visible.
    if (!code || ['release_changed_reload', 'update_in_progress', 'already_latest', 'current_version_unknown', 'telemetry_stale'].includes(code)) { const shown = error.value; await load(); if (alive) error.value = shown }
  } finally { if (alive) submitting.value = false }
}
function poll(id: string) {
  stop()
  timer = setTimeout(async () => {
    timer = undefined
    if (!alive) return
    try {
      const { data } = await axios.get(`${base}/jobs/${encodeURIComponent(id)}`, auth())
      if (!alive) return
      failures = 0
      if (item.value && data?.job) item.value = { ...item.value, job: data.job }
      if (data?.job && ACTIVE.includes(data.job.state)) poll(id)
      else await load()
    } catch {
      // Brief network loss does not lose the job: it keeps running on the server.
      if (!alive) return
      if (++failures < 40) poll(id)
      else error.value = 'Нет связи с сервером. Обновление продолжается на сервере — нажмите «Проверить обновления», чтобы узнать результат.'
    }
  }, 3000)
}
watch(() => [props.service, props.target], () => { stop(); confirming.value = false; notice.value = ''; load() })
onMounted(() => load())
onBeforeUnmount(() => { alive = false; ++generation; stop() })
</script>

<template>
  <div class="sv" :aria-busy="loading || submitting">
    <div class="sv-head"><h3>Версия {{ title }}</h3><button type="button" :disabled="loading || submitting" @click="load(true)">Проверить обновления</button></div>
    <dl class="sv-grid">
      <div><dt>Текущая версия</dt><dd>{{ item?.current_version || '—' }}</dd></div>
      <div><dt>Актуальная версия</dt><dd>{{ latest?.latest_version || '—' }} <a v-if="releaseUrl" :href="releaseUrl" target="_blank" rel="noopener noreferrer">что нового</a></dd></div>
    </dl>
    <p :class="['sv-state', indicator.kind]" role="status">{{ indicator.text }}</p>
    <p v-if="latest && latest.checked_at" class="sv-meta">Последняя стабильная версия на GitHub проверена {{ when(latest.checked_at) }}<span v-if="latest.error_code === 'release_check_failed'"> · последняя проверка не удалась, показан прежний результат</span></p>
    <p v-if="jobText" :class="['sv-job', jobText.kind]" role="status">{{ jobText.text }}</p>
    <p v-if="error" class="sv-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="sv-notice" role="status">{{ notice }}</p>
    <p v-if="item?.update_available && item?.update_allowed === false" class="sv-meta">Обновление этой ноды сейчас недоступно: нет свежих данных от ноды или приватного адреса управления.</p>
    <button v-if="item?.update_available && !confirming" type="button" class="primary" :disabled="!canUpdate" @click="ask">Обновить сервис</button>
    <div v-if="confirming" class="sv-confirm" role="group" aria-label="Подтверждение обновления">
      <p>Обновить {{ title }} ({{ item?.name }}) с {{ item?.current_version }} до {{ latest?.latest_version }}? Сервис перезапустится, {{ service === 'jackett' ? 'поиск торрентов' : 'торрент-воспроизведение на этой ноде' }} прервётся примерно на 1–2 минуты. Настройки и данные сохраняются; если проверка работоспособности не пройдёт, будет выполнен автоматический откат.</p>
      <div class="sv-actions"><button type="button" class="primary" :disabled="submitting" @click="submit">{{ submitting ? 'Отправка…' : 'Да, обновить' }}</button><button type="button" :disabled="submitting" @click="confirming = false">Отмена</button></div>
    </div>
    <p class="sv-meta">Автообновление выключено: новая версия устанавливается только по кнопке, образ закреплён по digest.</p>
  </div>
</template>

<style scoped>
.sv{margin:16px 0;padding:16px;border:1px solid var(--ui-border,#39404b);border-radius:8px;background:var(--ui-surface-2,rgba(255,255,255,.02));color:var(--ui-text,#f5f6f8);font-size:14px;line-height:22px;min-width:0}.sv *{box-sizing:border-box}.sv-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.sv h3{margin:0;font-size:16px}.sv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.sv-grid dt{color:var(--ui-text-muted,#b9c1cf);font-size:13px}.sv-grid dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}.sv-grid a{font-weight:400;color:#8fc3ff;margin-left:6px}.sv p{margin:8px 0}.sv-meta{color:var(--ui-text-muted,#b9c1cf);font-size:13px}.sv-state{font-weight:600}.sv-state.ok,.sv-job.ok{color:#a8e8bc}.sv-state.update{color:#f6cf4b}.sv-state.unknown{color:var(--ui-text-muted,#b9c1cf)}.sv-job.run{color:#8fc3ff}.sv-job.bad,.sv-error{color:#ffb6af}.sv-error{border-left:3px solid #ff8a80;padding-left:12px}.sv-notice{color:#a8e8bc;border-left:3px solid #71ce90;padding-left:12px}.sv button{font:inherit;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);min-height:44px;padding:8px 12px;cursor:pointer}.sv button:disabled{opacity:.55;cursor:wait}.sv .primary{background:#f6cf4b;border-color:#f6cf4b;color:#171717}.sv :focus-visible{outline:2px solid #f6cf4b;outline-offset:3px}.sv-confirm{margin-top:12px;padding-top:12px;border-top:1px solid var(--ui-border,#39404b)}.sv-actions{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:600px){.sv-grid{grid-template-columns:minmax(0,1fr)}.sv-actions button,.sv>.primary{width:100%}}
</style>
