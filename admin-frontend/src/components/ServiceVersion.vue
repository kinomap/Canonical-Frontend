<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'

type Job = { job_id: string; state: string; from_version: string | null; to_version: string; error_code: string | null; phase: string | null; rolled_back_to: string | null; late_report: boolean; created_at: string | null; finished_at: string | null; source?: string; soak_state?: string | null; soak_until?: string | null; soak_reason?: string | null; fallback?: string | null }
type Suppressed = { version: string; reason: string | null; suppressed_at: string | null }
type Target = { target: string; name: string; current_version: string | null; current_error: string | null; update_available: boolean; latest_installed: boolean; update_allowed?: boolean; updater_pending?: boolean; suppressed?: Suppressed[]; job: Job | null }
type Latest = { latest_version: string | null; published_at?: string | null; release_url?: string | null; checked_at: string | null; error_code: string | null; image_published: boolean }
// Per-service automatic updates (admin_services.py): OFF unless an admin turned them on.
type Policy = { enabled: boolean; delay_hours: number; updated_at: string | null }
const props = defineProps<{ service: 'jackett' | 'flaresolverr' | 'torrserver'; target: string; locked?: boolean; lockedReason?: string }>()
const emit = defineEmits<{ 'busy-change': [busy: boolean]; updated: [job: Job] }>()
const base = '/api/v1/admin/services'
const ACTIVE = ['queued', 'running']
// Every card of a service shows the same policy: a change in one card is sent to the others.
const POLICY_EVENT = 'kinosota:service-auto-update'
const ACCEPTED = 'Запрос принят. Обновление выполняется на сервере с проверкой работоспособности и автоматическим откатом.'
const latest = ref<Latest | null>(null)
const item = ref<Target | null>(null)
const policy = ref<Policy | null>(null)
const soakMinutes = ref(30)
const loading = ref(false)
const submitting = ref(false)
const confirming = ref(false)
const savingPolicy = ref(false)
const resetting = ref(false)
const confirmingReset = ref(false)
const error = ref('')
const notice = ref('')
let alive = true
let generation = 0
let failures = 0
let timer: ReturnType<typeof setTimeout> | undefined
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }, timeout: 145000 })
const title = computed(() => props.service === 'jackett' ? 'Jackett' : (props.service === 'flaresolverr' ? 'FlareSolverr' : 'TorrServer'))
const autoId = computed(() => `sv-auto-${props.service}-${props.target}`.replace(/[^A-Za-z0-9_-]/g, '-'))
const messages: Record<string, string> = {
  confirmation_required: 'Обновление не подтверждено.',
  invalid_update_body: 'Некорректный запрос обновления.',
  release_changed_reload: 'Актуальная версия изменилась. Данные обновлены — проверьте их и подтвердите снова.',
  image_not_published: 'Образ новой версии ещё не опубликован. Повторите позже.',
  current_version_unknown: 'Текущая версия не получена — обновление недоступно, пока сервис не ответит.',
  already_latest: 'Уже установлена последняя версия.',
  update_in_progress: 'Обновление этого сервиса уже выполняется.',
  service_update_in_progress: 'Обновление Jackett или FlareSolverr уже выполняется для этого экземпляра.',
  indexer_operation_in_progress: 'Операция с индексатором уже выполняется для этого экземпляра.',
  soak_in_progress: 'Идёт пост-проверка предыдущего обновления этого сервиса — новое обновление станет доступно после её завершения.',
  policy_changed_reload: 'Настройка автообновления изменилась в другом окне. Данные обновлены — проверьте их и повторите.',
  invalid_policy: 'Некорректная настройка автообновления.',
  telemetry_stale: 'Нет свежих данных от ноды — обновление недоступно, пока нода не подтвердит состояние.',
  target_not_allowed: 'Для этой ноды обновление не разрешено: нет приватного адреса управления.',
  updater_pending: 'Нода ещё не подключена к апдейтеру TorrServer — выполните Redeploy этой ноды, после этого обновление станет доступно.',
  unknown_target: 'Сервис не найден.',
  unknown_service: 'Неизвестный сервис.',
  jackett_not_connected: 'Jackett не подключён к Backend.',
  flaresolverr_unavailable: 'FlareSolverr не отвечает — текущая версия неизвестна',
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
  flaresolverr_unavailable: 'FlareSolverr не отвечает — текущая версия неизвестна',
  telemetry_stale: 'Данные ноды устарели — текущая версия не подтверждена',
  version_unknown: 'Нода не сообщила версию TorrServer',
}
// Why the post-update check (soak) failed, as reported by the host updater.
const soakReasons: Record<string, string> = {
  exited: 'контейнер остановился', dead: 'контейнер перестал работать', restarting: 'контейнер постоянно перезапускается',
  unhealthy: 'проверка здоровья контейнера не проходит', oom_killed: 'контейнеру не хватило памяти (OOM)',
  restart_count: 'слишком много перезапусков', probe_failed: 'сервис не ответил на 3 проверки подряд', missing: 'контейнер пропал',
}
// Why a version is skipped by automatic updates of this target.
const suppressReasons: Record<string, string> = {
  failed: 'обновление не прошло проверку работоспособности и было откачено',
  auto_rolled_back: 'не прошла пост-проверку, выполнен автоматический откат',
  self_heal: 'сервис падал на этой версии и был восстановлен на прежней',
}
function failure(e: any, fallback = 'Не удалось получить данные о версиях. Повторите позже.') { return messages[e?.response?.data?.code] || fallback }
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const job = computed(() => item.value?.job || null)
const active = computed(() => !!job.value && ACTIVE.includes(job.value.state))
const soaking = computed(() => { const j = job.value; return !!j && j.state === 'succeeded' && j.soak_state === 'soaking' && !!j.soak_until && Date.parse(j.soak_until) > Date.now() })
const suppressedList = computed(() => (Array.isArray(item.value?.suppressed) ? item.value!.suppressed! : []))
const releaseUrl = computed(() => { const url = latest.value?.release_url; return typeof url === 'string' && url.startsWith('https://github.com/') ? url : '' })
// TorrServer node deployed before auto-enroll: the host updater cannot reach it until a Redeploy.
const updaterPending = computed(() => props.service === 'torrserver' && item.value?.updater_pending === true)
const canUpdate = computed(() => !!item.value?.update_available && item.value.update_allowed !== false && !active.value && !soaking.value && !props.locked && !loading.value && !submitting.value)
// Why an offered update cannot be started right now (the button stays visible, disabled).
const blockedText = computed(() => {
  if (!item.value?.update_available || active.value) return ''
  if (props.locked) return props.lockedReason || 'Обновление временно недоступно: выполняется операция с индексаторами этого экземпляра.'
  if (soaking.value) return 'Обновление станет доступно после завершения пост-проверки текущей версии.'
  return ''
})
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
  const via = j.source === 'auto' ? 'Автообновление' : 'Обновление'
  if (j.state === 'queued') return { kind: 'run', text: `${via} до ${j.to_version}: запрос принят, ожидает исполнителя на сервере…` }
  if (j.state === 'running') return { kind: 'run', text: `${via} до ${j.to_version}: ${phases[j.phase || ''] || 'выполняется'}…` }
  if (!j.finished_at || Date.now() - Date.parse(j.finished_at) > 24 * 3600 * 1000) return null
  const reason = jobErrors[j.error_code || ''] || 'неизвестная ошибка'
  if (j.state === 'succeeded') {
    if (soaking.value) return { kind: 'run', text: `✓ Обновлено до ${j.to_version}. Идёт пост-проверка (${soakMinutes.value} мин, до ${when(j.soak_until)}): при сбое будет выполнен автоматический откат.` }
    if (j.soak_state === 'auto_rolled_back') {
      const back = j.fallback === 'release_pin' ? 'версию из текущего релиза' : (j.rolled_back_to || j.from_version || 'прежнюю версию')
      return { kind: 'bad', text: `Версия ${j.to_version} не прошла пост-проверку (${soakReasons[j.soak_reason || ''] || 'сбой сервиса'}) и автоматически откачена на ${back}. Автообновление её больше не ставит.` }
    }
    return { kind: 'ok', text: `✓ Обновлено до ${j.to_version} (${when(j.finished_at)})${j.soak_state === 'passed' ? ', пост-проверка пройдена' : ''}.` }
  }
  if (j.state === 'rolled_back') return { kind: 'bad', text: `Обновление до ${j.to_version} не прошло (${reason}) и автоматически откачено на ${j.rolled_back_to || j.from_version}. Сервис работает на прежней версии.` }
  return { kind: 'bad', text: `✗ Обновление до ${j.to_version} не выполнено: ${reason} (${when(j.finished_at)}).` }
})
// Honest description of what the checkbox does (values come from the backend).
const autoText = computed(() => {
  const p = policy.value
  if (!p) return ''
  const rules = `новая стабильная версия ставится не раньше чем через ${p.delay_hours} ч после выхода, по одной цели за раз (сначала основной экземпляр); затем ${soakMinutes.value} мин пост-проверки — при сбое автоматический откат, а сбойная версия больше не ставится автоматически.`
  return p.enabled ? `Включено для всех экземпляров ${title.value}: ${rules}` : `Автообновление выключено — обновление только вручную. Если включить (для всех экземпляров ${title.value}): ${rules}`
})
// Visual progress of an active update: each phase of the server-side job is a step.
type Step = { percent: number; label: string }
const QUEUED: Step = { percent: 10, label: 'Запрос принят' }
const PREPARING: Step = { percent: 20, label: 'Подготовка' }
const ROLLBACK: Step = { percent: 90, label: 'Откат на прежнюю версию' }
const DONE: Step = { percent: 100, label: 'Завершено' }
const STEPS: Record<string, Step> = {
  claimed: PREPARING,
  precheck: { percent: 35, label: 'Проверка состояния' },
  pull: { percent: 55, label: 'Загрузка образа' },
  backup: { percent: 70, label: 'Резервная копия' },
  start: { percent: 85, label: 'Перезапуск' },
  health: { percent: 95, label: 'Проверка работоспособности' },
}
// A job seen running on this page ends on the full bar when it succeeds.
const watched = ref('')
const progress = computed<(Step & { kind: 'run' | 'ok' | 'warn' }) | null>(() => {
  const j = job.value
  if (!j) return null
  if (j.state === 'succeeded') return watched.value === j.job_id ? { ...DONE, kind: 'ok' } : null
  if (j.state === 'queued') return { ...QUEUED, kind: 'run' }
  if (j.state !== 'running') return null
  if (j.phase === 'rollback') return { ...ROLLBACK, kind: 'warn' }
  return { ...(STEPS[j.phase || ''] ?? PREPARING), kind: 'run' }
})
watch(job, (j, prev) => {
  if (j && ACTIVE.includes(j.state)) watched.value = j.job_id
  // The job itself now reports its progress: the «accepted» banner is no longer news.
  if (j?.state === 'running' && notice.value === ACCEPTED) notice.value = ''
  if (j && prev && prev.job_id === j.job_id && ACTIVE.includes(prev.state) && !ACTIVE.includes(j.state)) emit('updated', j)
})
watch(active, (value) => emit('busy-change', value))

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
    const p = svc?.auto_update
    policy.value = p && typeof p.enabled === 'boolean' ? p : null
    if (typeof data?.soak_minutes === 'number' && data.soak_minutes > 0) soakMinutes.value = data.soak_minutes
    if (svc?.targets_error) error.value = messages[svc.targets_error] || 'Список сервисов недоступен.'
    if (active.value && job.value) { failures = 0; poll(job.value.job_id) }
    // The post-update check ends on the server; its outcome is picked up without a click.
    else if (soaking.value) { stop(); timer = setTimeout(() => { timer = undefined; if (alive) load() }, 60000) }
  } catch (e) { if (alive && token === generation) error.value = failure(e) }
  finally { if (alive && token === generation) loading.value = false }
}
function ask() { if (canUpdate.value) { confirming.value = true; error.value = ''; notice.value = '' } }
async function submit() {
  const t = item.value, version = latest.value?.latest_version
  // Only an explicitly confirmed, currently offered update is ever sent.
  if (!confirming.value || !t?.update_available || t.update_allowed === false || !version || submitting.value || active.value || props.locked) return
  submitting.value = true; error.value = ''; notice.value = ''
  try {
    // The server picks the digest-pinned image; the browser only confirms target and version.
    const { data } = await axios.post(`${base}/${encodeURIComponent(props.service)}/${encodeURIComponent(t.target)}/update`, { confirm: t.target, version }, auth())
    if (!alive) return
    confirming.value = false
    notice.value = ACCEPTED
    if (item.value && data?.job) { item.value = { ...item.value, job: data.job }; poll(data.job.job_id) }
  } catch (e: any) {
    if (!alive) return
    confirming.value = false; error.value = failure(e, 'Запрос обновления не подтверждён сервером. Проверьте состояние и повторите.')
    const code = e?.response?.data?.code
    // Fresh state (e.g. a job started elsewhere or lost reply); the reason stays visible.
    if (!code || ['release_changed_reload', 'update_in_progress', 'already_latest', 'current_version_unknown', 'telemetry_stale', 'updater_pending', 'soak_in_progress', 'service_update_in_progress'].includes(code)) { const shown = error.value; await load(); if (alive) error.value = shown }
  } finally { if (alive) submitting.value = false }
}
async function toggle(enabled: boolean, input?: HTMLInputElement) {
  if (!policy.value || savingPolicy.value || enabled === policy.value.enabled) return
  savingPolicy.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await axios.put(`${base}/${encodeURIComponent(props.service)}/auto-update`, { enabled }, auth())
    if (!alive) return
    const next = data?.auto_update
    if (next && typeof next.enabled === 'boolean') {
      policy.value = next
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(POLICY_EVENT, { detail: { service: props.service, policy: next } }))
    }
    notice.value = policy.value?.enabled ? `Автообновление ${title.value} включено.` : `Автообновление ${title.value} выключено. Обновление — только вручную.`
  } catch (e: any) {
    if (!alive) return
    error.value = failure(e, 'Настройка автообновления не сохранена сервером. Проверьте состояние и повторите.')
    if (e?.response?.data?.code === 'policy_changed_reload') { const shown = error.value; await load(); if (alive) error.value = shown }
  } finally {
    // The checkbox always shows the policy the server confirmed.
    if (alive) { savingPolicy.value = false; if (input) input.checked = !!policy.value?.enabled }
  }
}
function onToggle(event: Event) { const input = event.target as HTMLInputElement; void toggle(input.checked, input) }
function onPolicy(event: Event) {
  const detail = (event as CustomEvent).detail
  if (detail?.service === props.service && detail.policy && typeof detail.policy.enabled === 'boolean') policy.value = detail.policy
}
function askReset() { if (suppressedList.value.length && !resetting.value) { confirmingReset.value = true; error.value = ''; notice.value = '' } }
async function resetSuppressed() {
  const t = item.value
  if (!confirmingReset.value || !t || resetting.value) return
  resetting.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await axios.post(`${base}/${encodeURIComponent(props.service)}/${encodeURIComponent(t.target)}/suppressed/reset`, { confirm: t.target }, auth())
    if (!alive) return
    confirmingReset.value = false
    const count = Number(data?.reset) || 0
    notice.value = count ? `Сброшено пропущенных версий: ${count}. Автообновление снова может их установить.` : 'Пропущенных версий уже нет.'
    await load()
  } catch (e) {
    if (!alive) return
    confirmingReset.value = false; error.value = failure(e, 'Сброс не подтверждён сервером. Обновите данные и повторите.')
  } finally { if (alive) resetting.value = false }
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
watch(() => [props.service, props.target], () => { stop(); confirming.value = false; confirmingReset.value = false; notice.value = ''; load() })
onMounted(() => { if (typeof window !== 'undefined') window.addEventListener(POLICY_EVENT, onPolicy); load() })
onBeforeUnmount(() => {
  if (active.value) emit('busy-change', false)
  alive = false; ++generation; stop()
  if (typeof window !== 'undefined') window.removeEventListener(POLICY_EVENT, onPolicy)
})
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
    <div v-if="progress" :class="['sv-progress', progress.kind]" role="progressbar" aria-label="Ход обновления" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress.percent" :aria-valuetext="`${progress.percent}% · ${progress.label}`" data-testid="sv-progress">
      <div class="sv-progress-head"><span>{{ progress.label }}</span><span class="sv-progress-value">{{ progress.percent }}%</span></div>
      <div class="sv-progress-track"><div class="sv-progress-bar" :style="{ width: `${progress.percent}%` }"></div></div>
    </div>
    <p v-if="error" class="sv-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="sv-notice" role="status">{{ notice }}</p>
    <p v-if="updaterPending" class="sv-meta sv-blocked" role="status" data-testid="sv-updater-pending">Нода развёрнута до автоподключения апдейтера TorrServer: выполните <strong>Redeploy</strong> этой ноды — после этого обновления (ручные и автоматические) станут доступны из Admin.</p>
    <p v-else-if="item?.update_available && item?.update_allowed === false" class="sv-meta">Обновление этой ноды сейчас недоступно: нет свежих данных от ноды или приватного адреса управления.</p>
    <p v-if="blockedText" class="sv-meta sv-blocked" role="status">{{ blockedText }}</p>
    <button v-if="item?.update_available && !confirming && !active" type="button" class="primary" :disabled="!canUpdate" @click="ask">Обновить сервис</button>
    <div v-if="confirming" class="sv-confirm" role="group" aria-label="Подтверждение обновления">
      <p>Обновить {{ title }} ({{ item?.name }}) с {{ item?.current_version }} до {{ latest?.latest_version }}? Сервис перезапустится, {{ service === 'torrserver' ? 'торрент-воспроизведение на этой ноде' : 'поиск торрентов' }} прервётся примерно на 1–2 минуты. Настройки и данные сохраняются; если проверка работоспособности не пройдёт, будет выполнен автоматический откат.</p>
      <div class="sv-actions"><button type="button" class="primary" :disabled="submitting || locked" @click="submit">{{ submitting ? 'Отправка…' : 'Да, обновить' }}</button><button type="button" :disabled="submitting" @click="confirming = false">Отмена</button></div>
    </div>
    <div v-if="suppressedList.length" class="sv-suppressed" role="group" aria-label="Версии, пропускаемые автообновлением">
      <p class="sv-suppressed-title">Автообновление пропускает версии:</p>
      <ul><li v-for="s in suppressedList" :key="s.version"><strong>{{ s.version }}</strong> — {{ suppressReasons[s.reason || ''] || 'версия дала сбой' }} ({{ when(s.suppressed_at) }})</li></ul>
      <button v-if="!confirmingReset" type="button" :disabled="resetting || loading" @click="askReset">Разрешить повторную попытку</button>
      <div v-else class="sv-actions" role="group" aria-label="Подтверждение сброса">
        <p>Разрешить автообновлению снова установить эти версии на {{ item?.name }}? Ручное обновление доступно всегда.</p>
        <button type="button" class="primary" :disabled="resetting" @click="resetSuppressed">{{ resetting ? 'Сброс…' : 'Да, сбросить' }}</button><button type="button" :disabled="resetting" @click="confirmingReset = false">Отмена</button>
      </div>
    </div>
    <div v-if="policy" class="sv-auto">
      <label class="sv-auto-toggle"><input type="checkbox" :checked="policy.enabled" :disabled="savingPolicy || loading" :aria-describedby="autoId" @change="onToggle" />Автообновление</label>
      <p :id="autoId" class="sv-meta">{{ autoText }} Образ закреплён по digest.</p>
    </div>
    <p v-else class="sv-meta">Автообновление выключено; образ закреплён по digest.</p>
  </div>
</template>

<style scoped>
.sv{margin:16px 0;padding:16px;border:1px solid var(--ui-border,#39404b);border-radius:8px;background:var(--ui-surface-2,rgba(255,255,255,.02));color:var(--ui-text,#f5f6f8);font-size:14px;line-height:22px;min-width:0}.sv *{box-sizing:border-box}.sv-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.sv h3{margin:0;font-size:16px}.sv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.sv-grid dt{color:var(--ui-text-muted,#b9c1cf);font-size:13px}.sv-grid dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}.sv-grid a{font-weight:400;color:#8fc3ff;margin-left:6px}.sv p{margin:8px 0}.sv-meta{color:var(--ui-text-muted,#b9c1cf);font-size:13px}.sv-state{font-weight:600}.sv-state.ok,.sv-job.ok{color:#a8e8bc}.sv-state.update{color:#f6cf4b}.sv-state.unknown{color:var(--ui-text-muted,#b9c1cf)}.sv-job.run{color:#8fc3ff}.sv-job.bad,.sv-error{color:#ffb6af}.sv-error{border-left:3px solid #ff8a80;padding-left:12px}.sv-notice{color:#a8e8bc;border-left:3px solid #71ce90;padding-left:12px}.sv button{font:inherit;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);min-height:44px;padding:8px 12px;cursor:pointer}.sv button:disabled{opacity:.55;cursor:wait}.sv .primary{background:#f6cf4b;border-color:#f6cf4b;color:#171717}.sv :focus-visible{outline:2px solid #f6cf4b;outline-offset:3px}.sv-confirm{margin-top:12px;padding-top:12px;border-top:1px solid var(--ui-border,#39404b)}.sv-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sv-actions p{flex-basis:100%}.sv-blocked{border-left:3px solid #8fc3ff;padding-left:12px}.sv-suppressed{margin:12px 0;padding:12px;border:1px solid rgba(255,182,175,.35);border-radius:8px}.sv-suppressed-title{font-weight:600;color:#ffb6af}.sv-suppressed ul{margin:4px 0 8px;padding-left:20px}.sv-suppressed li{overflow-wrap:anywhere}.sv-auto{margin-top:12px;padding-top:12px;border-top:1px solid var(--ui-border,#39404b)}.sv-auto-toggle{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:600;cursor:pointer}.sv-auto-toggle input{width:20px;height:20px;margin:0;accent-color:#f6cf4b;cursor:pointer}.sv-auto-toggle input:disabled{cursor:wait}.sv-progress{margin:12px 0}.sv-progress-head{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--ui-text-muted,#b9c1cf)}.sv-progress-value{font-variant-numeric:tabular-nums;font-weight:600;color:var(--ui-text,#f5f6f8)}.sv-progress-track{position:relative;height:10px;margin-top:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.sv-progress-bar{position:relative;height:100%;min-width:4px;border-radius:inherit;background:linear-gradient(90deg,#4f8fe8,#8fc3ff);transition:width .6s ease;overflow:hidden}.sv-progress-bar:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:translateX(-100%);animation:sv-shine 1.6s ease-in-out infinite}.sv-progress.ok .sv-progress-bar{background:linear-gradient(90deg,#3fae6a,#a8e8bc)}.sv-progress.ok .sv-progress-bar:after{display:none}.sv-progress.warn .sv-progress-bar{background:linear-gradient(90deg,#d08a2b,#f6cf4b)}@keyframes sv-shine{to{transform:translateX(100%)}}@media (prefers-reduced-motion:reduce){.sv-progress-bar{transition:none}.sv-progress-bar:after{animation:none}}@media(max-width:600px){.sv-grid{grid-template-columns:minmax(0,1fr)}.sv-actions button,.sv>.primary{width:100%}}
</style>
