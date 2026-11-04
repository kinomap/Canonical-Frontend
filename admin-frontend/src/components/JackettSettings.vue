<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, nextTick, ref } from 'vue'
import axios from 'axios'
import ServiceVersion from './ServiceVersion.vue'

// Last real search through Jackett for one tracker (stored on the backend).
type Check = { checked_at: string; ok: boolean; result_count: number | null; error_code: string | null; duration_ms?: number | null; source?: string }
type Indexer = { id: string; name: string; type: string; language: string; configured: boolean; has_error: boolean; check?: Check | null }
type Field = { id: string; label: string; type: string; value: any; options?: Record<string, string>; secret?: boolean; saved?: boolean }
type Form = { fields: Field[]; revision: string; unsupported: string[] }
const base = '/api/v1/admin/torrent-search/instances'
const instances = ref<{ id: string; name: string }[]>([])
const selected = ref('')
const indexers = ref<Indexer[]>([])
const query = ref('')
const filter = ref('configured')
const page = ref(1)
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const observed = ref('')
const editing = ref<Indexer | null>(null)
const form = ref<Form | null>(null)
const draft = ref<Record<string, any>>({})
// Values as loaded: ordinary fields are sent only when really edited.
const initial = ref<Record<string, any>>({})
const cleared = ref<Record<string, boolean>>({})
const confirming = ref<Indexer | null>(null)
const checking = ref<Record<string, boolean>>({})
const checkingAll = ref(false)
// Older results are refreshed in the background when the list is opened.
const STALE_MS = 30 * 60 * 1000
let alive = true
let generation = 0
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }, timeout: 80000 })
const path = (row: Indexer) => `${base}/${encodeURIComponent(selected.value)}/indexers/${encodeURIComponent(row.id)}`
const messages: Record<string, string> = {
  jackett_registry_invalid: 'Служебное подключение Jackett настроено некорректно. Проверьте установку общего поискового сервиса.',
  jackett_auth_failed: 'Backend не смог авторизоваться в Jackett. Требуется проверить служебные настройки.',
  jackett_busy: 'Сейчас выполняется другая операция с Jackett. Дождитесь её завершения.',
  jackett_timeout_outcome_unknown: 'Jackett не ответил вовремя. Результат операции неизвестен: обновите состояние перед повторной попыткой.',
  config_changed_reload: 'Настройки изменились. Форма обновлена; введите изменения заново.',
  interactive_challenge_required: 'Трекер требует интерактивной проверки, которая пока не поддерживается этой формой.',
  site_link_locked: 'Адрес трекера задаётся его проверенным определением в Jackett.',
  unsafe_tracker_site: 'Адрес трекера не прошёл проверку безопасности.',
  jackett_action_failed: 'Jackett не подтвердил операцию. Проверьте данные авторизации; форма будет обновлена. Подключение не считается успешным.',
  cloudflare_challenge: 'Сайт закрыт проверкой Cloudflare / требуется FlareSolverr или прокси.',
  captcha_required: 'Введите символы с новой картинки и нажмите «Сохранить / продолжить настройку». Если вход снова не удастся, проверьте логин и пароль.',
  connection_field_locked: 'Адреса и прокси трекера задаются его проверенным определением в Jackett.',
  indexer_not_found: 'Индексатор не найден в Jackett. Обновите список.',
}
const checkMessages: Record<string, string> = {
  cloudflare_403: 'Cloudflare 403 — сайт закрыт проверкой Cloudflare',
  auth_failed: 'Ошибка авторизации на трекере',
  captcha_required: 'Ошибка авторизации: трекер требует ввести капчу',
  timeout: 'Timeout — трекер не ответил вовремя',
  rate_limited: 'Трекер ограничил частоту запросов',
  not_configured: 'Индексатор не настроен в Jackett',
  indexer_error: 'Ошибка трекера при поиске',
  invalid_response: 'Некорректный ответ при поиске',
  jackett_auth_failed: 'Backend не авторизован в Jackett',
  jackett_unavailable: 'Jackett недоступен',
}
const plural = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'раздача' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'раздачи' : 'раздач' }
const stamp = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function status(row: Indexer) {
  if (!row.configured) return 'Не подключён'
  const c = row.check
  let text = 'Ещё не проверялся'
  if (c?.ok) { const n = c.result_count ?? 0; text = `✓ Работает (проверено ${stamp(c.checked_at)}, найдено ${n >= 100 ? '100+' : n} ${plural(n)})` }
  else if (c) text = `✗ ${checkMessages[c.error_code || ''] || 'Ошибка проверки'} (проверено ${stamp(c.checked_at)})`
  return checking.value[row.id] ? `${text} · проверяется…` : text
}
const statusKind = (row: Indexer) => (!row.configured || !row.check ? 'unknown' : row.check.ok ? 'ok' : 'bad')
const TEXT = ['inputstring', 'password', 'inputtags']
// Mirrors the backend: tracker addresses/proxies are never edited here.
const locked = (field: Field) => field.id === 'sitelink' || /url|proxy|serveraddress/i.test(field.id)
const ordinary = (field: Field) => !field.secret && TEXT.includes(field.type) && !locked(field) && !/captcha/i.test(field.id)
function failure(e: any) { return messages[e?.response?.data?.code] || 'Не удалось связаться с Jackett. Обновите состояние и повторите проверку.' }
function showConnected() { filter.value = 'configured'; query.value = ''; page.value = 1 }
function changeFilter() { if (filter.value === 'configured') query.value = ''; page.value = 1 }
function close() { editing.value = null; form.value = null; draft.value = {}; initial.value = {}; cleared.value = {}; confirming.value = null }
function resetDraft() {
  draft.value = {}; initial.value = {}; cleared.value = {}
  for (const field of form.value?.fields || []) {
    if (field.type === 'displayimage') continue
    const value = field.secret ? '' : field.value
    draft.value[field.id] = Array.isArray(value) ? [...value] : value
    initial.value[field.id] = Array.isArray(value) ? [...value] : value
  }
}
const matched = computed(() => indexers.value.filter(x => (filter.value !== 'configured' || x.configured) && `${x.name} ${x.id} ${x.language}`.toLowerCase().includes(query.value.toLowerCase())))
const pages = computed(() => Math.max(1, Math.ceil(matched.value.length / 20)))
const visible = computed(() => matched.value.slice((Math.min(page.value, pages.value) - 1) * 20, Math.min(page.value, pages.value) * 20))
const connected = computed(() => indexers.value.filter(x => x.configured).length)

async function loadIndexers() {
  const token = ++generation
  busy.value = true; error.value = ''; close(); indexers.value = []; observed.value = ''
  try {
    const { data } = await axios.get(`${base}/${encodeURIComponent(selected.value)}/indexers`, auth())
    if (!alive || token !== generation) return
    indexers.value = data.indexers; observed.value = new Date(data.observed_at).toLocaleString(); page.value = 1
    void autoCheck()
  } catch (e) { if (alive && token === generation) error.value = failure(e) }
  finally { if (alive && token === generation) busy.value = false }
}
// One real search per tracker; the result is stored and shown with its time.
async function check(row: Indexer, source: 'manual' | 'auto' = 'manual', quiet = false) {
  if (!row.configured || checking.value[row.id]) return
  const key = selected.value, id = row.id
  checking.value = { ...checking.value, [id]: true }
  if (source === 'manual' && !quiet) { error.value = ''; notice.value = '' }
  try {
    const { data } = await axios.post(`${path(row)}/check`, { source }, auth())
    if (!alive || key !== selected.value) return
    const target = indexers.value.find(x => x.id === id)
    if (target && data?.check) target.check = data.check
  } catch (e: any) {
    if (!alive || key !== selected.value || source !== 'manual') return
    if (e?.response?.data?.code === 'check_in_progress') notice.value = `${row.name}: проверка уже выполняется, дождитесь результата.`
    else error.value = failure(e)
  } finally {
    if (alive) { const next = { ...checking.value }; delete next[id]; checking.value = next }
  }
}
async function checkAll() {
  if (checkingAll.value) return
  checkingAll.value = true; error.value = ''; notice.value = ''
  try { for (const row of indexers.value.filter(x => x.configured)) { if (!alive) return; await check(row, 'manual', true) } }
  finally { if (alive) checkingAll.value = false }
}
async function autoCheck() {
  const token = generation, now = Date.now()
  const stale = indexers.value.filter(x => x.configured && (!x.check || !(now - Date.parse(x.check.checked_at) < STALE_MS)))
  // Sequential: never a burst of tracker searches; a reloaded list starts its own pass.
  for (const row of stale) { if (!alive || token !== generation) return; await check(row, 'auto') }
}
async function load() {
  loading.value = true; busy.value = true; error.value = ''; ++generation; close(); instances.value = []; selected.value = ''; indexers.value = []; observed.value = ''
  try {
    const { data } = await axios.get(base, auth())
    if (!alive) return
    instances.value = data.instances
    selected.value = data.instances[0]?.id || ''
    if (selected.value) await loadIndexers()
  } catch (e) { if (alive) error.value = failure(e) }
  finally { if (alive) { loading.value = false; busy.value = false } }
}
async function open(row: Indexer) {
  if (busy.value) return
  close(); busy.value = true; notice.value = ''; error.value = ''
  try {
    const { data } = await axios.get(`${path(row)}/config`, auth())
    if (!alive) return
    editing.value = row; form.value = data; resetDraft(); await nextTick(); document.querySelector<HTMLElement>('.jackett-form h3')?.focus()
  } catch (e) { if (alive) error.value = failure(e) }
  finally { if (alive) busy.value = false }
}
async function save() {
  if (!editing.value || !form.value || busy.value) return
  const row = editing.value
  const changes: Record<string, any> = {}
  for (const field of form.value.fields) {
    if (field.type === 'displayimage' || locked(field)) continue
    const value = draft.value[field.id]
    if (field.secret) {
      // Saved secrets are never sent to the browser: an empty box means "keep".
      if (cleared.value[field.id] && field.saved) changes[field.id] = { mode: 'clear' }
      else if (value) changes[field.id] = { mode: 'replace', value }
    } else if (TEXT.includes(field.type)) {
      // Ordinary values are shown as saved: only real edits are sent, '' empties the field.
      if (typeof value === 'string' && value !== initial.value[field.id]) changes[field.id] = { mode: 'replace', value }
    } else changes[field.id] = { mode: 'replace', value }
  }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await axios.post(`${path(row)}/config`, { revision: form.value.revision, changes }, auth())
    if (!alive) return
    notice.value = 'Jackett принял настройки. Сейчас будет выполнен проверочный поиск по трекеру; это ещё не проверка воспроизведения.'
    showConnected(); close(); await loadIndexers()
  } catch (e: any) {
    if (!alive) return
    const code = e?.response?.data?.code
    // Keep edits of ordinary fields (login, filters) unless the saved settings
    // changed meanwhile; typed secrets and captcha answers are never kept.
    const typed: Record<string, any> = {}
    if (code !== 'config_changed_reload') for (const field of form.value?.fields || []) if (ordinary(field) && draft.value[field.id] !== initial.value[field.id]) typed[field.id] = draft.value[field.id]
    if (code === 'captcha_required') notice.value = messages.captcha_required
    else error.value = failure(e)
    // Never replay a mutation automatically. A fresh form brings a new captcha
    // image and a new single-use snapshot.
    form.value = null; draft.value = {}; initial.value = {}; cleared.value = {}
    try {
      const { data } = await axios.get(`${path(row)}/config`, auth())
      if (alive) {
        form.value = data; resetDraft()
        for (const [id, value] of Object.entries(typed)) if (id in draft.value) draft.value[id] = value
      }
    } catch (reload) { if (alive) { close(); notice.value = ''; if (!error.value) error.value = failure(reload) } }
  } finally {
    for (const key of Object.keys(changes)) delete changes[key]
    if (alive) busy.value = false
  }
}
async function action(row: Indexer, kind: 'delete') {
  if (busy.value || kind !== 'delete') return
  busy.value = true; error.value = ''; notice.value = ''; confirming.value = null
  try {
    await axios.delete(path(row), { ...auth(), data: { confirm: row.id } })
    if (!alive) return
    notice.value = `${row.name}: подключение удалено из Jackett.`
    await loadIndexers()
  } catch (e) { if (alive) error.value = failure(e) }
  finally { if (alive) busy.value = false }
}
onMounted(load)
onBeforeUnmount(() => { alive = false; ++generation; close() })
</script>

<template>
  <section class="jackett-panel" aria-labelledby="jackett-title" :aria-busy="busy || loading">
    <header class="jackett-heading">
      <div><h2 id="jackett-title">Jackett · индексаторы</h2><p>Общий поиск для torrent-нод. Управление здесь, без отдельного публичного порта Jackett.</p></div>
      <button type="button" :disabled="busy || loading" @click="load">Обновить</button>
    </header>
    <p v-if="loading" role="status">Загрузка поискового сервиса…</p>
    <p v-if="error" class="jackett-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="jackett-notice" role="status">{{ notice }}</p>
    <p v-if="!loading && !error && !instances.length">Jackett ещё не подключён к Backend. Сначала установите общий поисковый сервис; открывать его порт в Интернет не нужно.</p>
    <template v-if="instances.length">
      <ServiceVersion v-if="selected" service="jackett" :target="selected" />
      <div class="jackett-toolbar">
        <label v-if="instances.length > 1">Поисковый сервис<select v-model="selected" :disabled="busy" @change="loadIndexers"><option v-for="item in instances" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label>Трекеры<select v-model="filter" :disabled="busy" @change="changeFilter"><option value="configured">Подключённые ({{ connected }})</option><option value="all">Все доступные ({{ indexers.length }})</option></select></label>
        <label>Найти индексатор<input v-model="query" type="search" placeholder="Название или язык" :disabled="busy" @input="page = 1" /></label>
      </div>
      <p v-if="observed" class="jackett-count" role="status">Подключено индексаторов: <strong>{{ connected }}</strong><span v-if="query.trim()"> · Найдено по фильтру: {{ matched.length }} <button type="button" :disabled="busy" @click="query = ''; page = 1">Сбросить поиск</button></span><button v-if="connected" type="button" class="jackett-check-all" :disabled="busy || checkingAll" @click="checkAll">{{ checkingAll ? 'Проверка…' : 'Проверить все' }}</button></p>
      <p v-if="observed" class="jackett-meta">Состояние Jackett: {{ observed }}. Статус — результат реального поиска через Jackett по каждому трекеру; результаты старше 30 минут перепроверяются автоматически. Это не проверка воспроизведения.</p>
      <ul class="jackett-list" aria-label="Индексаторы">
        <li v-for="row in visible" :key="row.id">
          <div class="jackett-name"><strong>{{ row.name }}</strong><span>{{ row.type }} · {{ row.language }} · <span :class="['jackett-status', statusKind(row)]">{{ status(row) }}</span></span></div>
          <div class="jackett-actions"><button type="button" :disabled="busy" @click="open(row)">{{ row.configured ? 'Настроить' : 'Подключить' }}</button><button v-if="row.configured" type="button" :disabled="busy || !!checking[row.id]" @click="check(row, 'manual')">{{ checking[row.id] ? 'Проверка…' : 'Проверить' }}</button><button v-if="row.configured" type="button" class="danger" :disabled="busy" @click="confirming = row">Удалить</button></div>
        </li>
      </ul>
      <p v-if="!busy && !visible.length">{{ filter === 'configured' && !connected ? 'Подключённых трекеров пока нет. Выберите «Все доступные», чтобы добавить индексатор.' : 'Индексаторы не найдены.' }}</p>
      <nav v-if="pages > 1" class="jackett-actions" aria-label="Страницы индексаторов"><button :disabled="busy || page <= 1" @click="page--">Назад</button><span>{{ Math.min(page, pages) }} / {{ pages }}</span><button :disabled="busy || page >= pages" @click="page++">Далее</button></nav>
      <div v-if="confirming" class="jackett-confirm" role="group" aria-label="Подтверждение удаления"><p>Удалить настройки {{ confirming.name }} из Jackett? Сохранённая авторизация этого трекера будет удалена.</p><div class="jackett-actions"><button class="danger" :disabled="busy" @click="action(confirming!, 'delete')">Да, удалить</button><button :disabled="busy" @click="confirming = null">Отмена</button></div></div>
      <form v-if="editing && form" class="jackett-form" autocomplete="off" @submit.prevent="save">
        <header class="jackett-heading"><h3 tabindex="-1">{{ editing.name }} · настройки</h3><button type="button" :disabled="busy" @click="close">Закрыть</button></header>
        <p>Сохранённые пароли, cookie и ключи скрыты: пустое поле оставляет прежнее значение, удаление — отдельным переключателем. Обычные поля (логин, фильтры) показаны с сохранёнными значениями.</p>
        <p v-if="form.unsupported.length" class="jackett-error" role="alert">Для этого трекера требуется дополнительная проверка, пока не поддерживаемая здесь: {{ form.unsupported.join(', ') }}. Подключение не подтверждено.</p>
        <fieldset :disabled="busy"><legend class="sr-only">Параметры индексатора</legend>
          <div v-for="(field, i) in form.fields" :key="field.id" class="jackett-field">
            <label :for="`jackett-field-${i}`">{{ field.label }}</label>
            <img v-if="field.type === 'displayimage' && typeof field.value === 'string' && field.value.startsWith('data:image/')" :id="`jackett-field-${i}`" class="jackett-captcha" :src="field.value" alt="Код проверки (CAPTCHA)" referrerpolicy="no-referrer" />
            <input v-else-if="field.type === 'inputbool'" :id="`jackett-field-${i}`" v-model="draft[field.id]" type="checkbox" />
            <select v-else-if="field.type === 'inputselect'" :id="`jackett-field-${i}`" v-model="draft[field.id]"><option v-for="(label, value) in field.options" :key="value" :value="value">{{ label }}</option></select>
            <select v-else-if="field.type === 'inputcheckbox'" :id="`jackett-field-${i}`" v-model="draft[field.id]" multiple><option v-for="(label, value) in field.options" :key="value" :value="value">{{ label }}</option></select>
            <input v-else :id="`jackett-field-${i}`" v-model="draft[field.id]" :type="field.secret ? 'password' : 'text'" :readonly="locked(field)" :disabled="field.secret && cleared[field.id]" :placeholder="field.saved && field.secret ? 'Сохранено · оставить без изменений' : ''" :autocomplete="field.secret ? 'new-password' : 'off'" maxlength="16384" />
            <label v-if="field.secret && field.saved" class="jackett-clear"><input v-model="cleared[field.id]" type="checkbox" />Удалить сохранённое значение</label>
          </div>
        </fieldset>
        <button class="primary" type="submit" :disabled="busy || !!form.unsupported.length">{{ busy ? 'Выполняется…' : 'Сохранить / продолжить настройку' }}</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.jackett-status.ok{color:#7ee2a8}.jackett-status.bad{color:#ff9b9b}.jackett-check-all{margin-left:12px}
.jackett-panel{margin:0 0 24px;padding:24px;border:1px solid var(--ui-border,#39404b);border-radius:12px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);font-size:16px;line-height:1.5;min-width:0}.jackett-panel *{box-sizing:border-box}.jackett-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.jackett-heading h2{margin:0;font-size:20px}.jackett-heading h3{margin:0;font-size:18px}.jackett-panel p{margin:8px 0 16px;color:var(--ui-text-muted,#b9c1cf)}.jackett-panel button,.jackett-panel input:not([type=checkbox]),.jackett-panel select{font:inherit;border:1px solid var(--ui-border,#4e5869);border-radius:8px;background:var(--ui-surface,#171d27);color:var(--ui-text,#f5f6f8);min-height:44px;padding:8px 12px;max-width:100%}.jackett-panel button{cursor:pointer;white-space:normal}.jackett-panel button:disabled{opacity:.55;cursor:wait}.jackett-panel :focus-visible{outline:2px solid #f6cf4b;outline-offset:3px}.jackett-panel input[type=checkbox]{width:20px;height:20px;accent-color:#f6cf4b}.jackett-toolbar{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0 8px}.jackett-toolbar label{display:grid;gap:8px;flex:1;min-width:180px}.jackett-meta{font-size:14px}.jackett-list{list-style:none;margin:16px 0;padding:0}.jackett-list li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--ui-border,#39404b)}.jackett-name{min-width:0;overflow-wrap:anywhere}.jackett-name span{display:block;font-size:14px;color:var(--ui-text-muted,#b9c1cf)}.jackett-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.jackett-panel .danger{color:#ffaaa5}.jackett-panel .jackett-error{color:#ffb6af;border-left:3px solid #ff8a80;padding-left:12px}.jackett-panel .jackett-notice{color:#a8e8bc;border-left:3px solid #71ce90;padding-left:12px}.jackett-form,.jackett-confirm{margin-top:24px;padding-top:24px;border-top:1px solid var(--ui-border,#39404b)}.jackett-form fieldset{border:0;padding:0;margin:16px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.jackett-field{min-width:0;display:flex;flex-direction:column;gap:8px}.jackett-field>label{overflow-wrap:anywhere}.jackett-captcha{max-width:100%;height:auto;align-self:flex-start;background:#fff;border-radius:6px;padding:4px}.jackett-clear{display:flex;align-items:center;gap:8px;font-size:14px;min-height:44px}.jackett-panel .primary{background:#f6cf4b;border-color:#f6cf4b;color:#171717}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:640px){.jackett-panel{padding:16px}.jackett-heading{flex-wrap:wrap}.jackett-list li{align-items:flex-start;flex-direction:column}.jackett-form fieldset{grid-template-columns:1fr}.jackett-toolbar label{min-width:100%;width:100%}.jackett-actions{width:100%}.jackett-actions button{flex:1}.jackett-form .primary{width:100%}}
</style>
