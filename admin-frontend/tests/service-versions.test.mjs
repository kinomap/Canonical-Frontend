import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'
const require = createRequire(import.meta.url), vue = require('vue')
const source = readFileSync(new URL('../src/components/ServiceVersion.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'service-version-test' })
const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const NOW = new Date().toISOString()
const JOB_ID = '3f2a7c1e-9d4b-4c55-8a61-0b7e2f1d9c3a'
const POLICY = { enabled: false, delay_hours: 24, updated_at: null }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const target = (over = {}) => ({ target: 'shared', name: 'Shared Jackett', current_version: 'v0.24.2985', current_error: null, update_available: true, latest_installed: false, job: null, ...over })
const versions = (over = {}, latest = {}) => ({ auto_update: false, checked_at: NOW, soak_minutes: 30, services: { jackett: { title: 'Jackett', targets_error: null, targets: [target(over)], auto_update: { ...POLICY },
  latest: { latest_version: 'v0.24.3003', published_at: NOW, release_url: 'https://github.com/Jackett/Jackett/releases/tag/v0.24.3003', checked_at: NOW, error_code: null, image_published: true, ...latest } } } })
// Both shared-search services as GET /versions reports them (each with its own policy).
const searchVersions = (jackett = {}, flaresolverr = {}) => {
  const data = versions(jackett)
  data.services.flaresolverr = { title: 'FlareSolverr', targets_error: null, auto_update: { ...POLICY },
    targets: [target({ name: 'Shared FlareSolverr', current_version: 'v3.3.21', ...flaresolverr })],
    latest: { latest_version: 'v3.3.25', published_at: NOW, release_url: 'https://github.com/FlareSolverr/FlareSolverr/releases/tag/v3.3.25', checked_at: NOW, error_code: null, image_published: true } }
  return data
}
const job = (state, over = {}) => ({ job_id: JOB_ID, service: 'jackett', target: 'shared', state, from_version: 'v0.24.2985', to_version: 'v0.24.3003', error_code: null, phase: null, rolled_back_to: null, late_report: false, created_at: NOW, started_at: null, finished_at: null, updated_at: NOW, ...over })
const rejected = code => Object.assign(new Error(code), { response: { status: 409, data: { code, error: 'raw-upstream-detail' } } })

// opts: { props, window, versions } — cards rendered on one page share one window.
function setup(over = {}, latest = {}, opts = {}) {
  const requests = [], hooks = {}, timers = [], events = []
  const ctl = {
    versions: opts.versions || versions(over, latest), post: () => ({ data: { job: job('queued') } }), jobs: [], wait: null,
    put: (url, body) => ({ data: { service: url.split('/').at(-2), auto_update: { enabled: body.enabled, delay_hours: 24, updated_at: NOW } } }),
  }
  const axios = {
    get: async (url) => {
      requests.push({ method: 'GET', url })
      if (url.includes('/jobs/')) { const next = ctl.jobs.shift(); if (next instanceof Error) throw next; return { data: { job: next } } }
      return { data: structuredClone(ctl.versions) }
    },
    post: async (url, body) => { requests.push({ method: 'POST', url, body: structuredClone(body) }); if (ctl.wait) await ctl.wait; return ctl.post(url, body) },
    put: async (url, body) => { requests.push({ method: 'PUT', url, body: structuredClone(body) }); return ctl.put(url, body) },
  }
  const window = opts.window || new EventTarget()
  const sandbox = {
    exports: {}, localStorage: { getItem: () => 'synthetic-admin' }, window, CustomEvent,
    // Mounting registers the policy listener and starts loading; the test waits until the load settled.
    require: n => n === 'vue' ? { ...vue, onMounted: cb => { hooks.mount = async () => { await cb(); await tick() } }, onBeforeUnmount: cb => { hooks.unmount = cb } } : { default: axios, __esModule: true },
    setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true },
  }
  vm.runInNewContext(compiled, sandbox)
  const props = vue.reactive({ service: 'jackett', target: 'shared', ...opts.props })
  const state = sandbox.exports.default.setup(props, { expose: () => {}, emit: (name, ...args) => events.push([name, ...args]) })
  return { state, requests, hooks, timers, props, ctl, events, window }
}
const pending = timers => timers.filter(x => !x.cleared && !x.done)
async function fire(timers) {
  const [next] = pending(timers); assert.ok(next, 'a poll is scheduled'); assert.equal(next.ms, 3000)
  next.done = true; await next.cb()
}
const posts = requests => requests.filter(x => x.method === 'POST')
const puts = requests => requests.filter(x => x.method === 'PUT')

test('compiles without HTML injection, raw errors or unsafe links', () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ServiceVersion.vue', id: 's' }).errors, [])
  assert.doesNotMatch(source, /v-html|iframe|response\.data\.error|console\.(log|error)|localStorage\.setItem/)
  for (const text of ['Текущая версия', 'Актуальная версия', 'Обновить сервис', 'Да, обновить', 'Автообновление выключено', 'Автообновление', 'Разрешить повторную попытку']) assert.ok(source.includes(text), text)
  // The shared search panel shows one card per service; each card is locked while the other one updates.
  const search = readFileSync(new URL('../src/components/JackettSettings.vue', import.meta.url), 'utf8')
  for (const [service, other] of [['jackett', 'flaresolverr'], ['flaresolverr', 'jackett']]) {
    assert.match(search, new RegExp(`<ServiceVersion v-if="selected" service="${service}" :target="selected" :locked="indexerBusy \\|\\| !!updating\\.${other}" :locked-reason="lockReason\\('${other}'\\)" @busy-change="setUpdating\\('${service}', \\$event\\)" @updated="afterUpdate" />`), service)
  }
  assert.equal(search.match(/<ServiceVersion /g).length, 2, 'exactly the Jackett and FlareSolverr cards')
  const torrent = readFileSync(new URL('../src/components/TorrentServices.vue', import.meta.url), 'utf8')
  assert.match(torrent, /<ServiceVersion v-if="nodeId" service="torrserver" :target="nodeId" \/>/)
  for (const view of ['MediaInfrastructure.vue', 'MediaNodeDetail.vue']) {
    assert.match(readFileSync(new URL(`../src/views/${view}`, import.meta.url), 'utf8'), /<TorrentServices [^>]*:node-id="node\.node_id"/)
  }
})

test('shows current and latest versions with an update indicator', async () => {
  const { state, requests, hooks } = setup(); await hooks.mount()
  assert.equal(requests[0].url, '/api/v1/admin/services/versions?service=jackett')
  assert.equal(state.item.value.current_version, 'v0.24.2985'); assert.equal(state.latest.value.latest_version, 'v0.24.3003')
  assert.deepEqual({ ...state.indicator.value }, { kind: 'update', text: 'Доступно обновление' })
  assert.equal(state.canUpdate.value, true); assert.equal(state.releaseUrl.value, 'https://github.com/Jackett/Jackett/releases/tag/v0.24.3003')
})

test('latest installed: no update button action', async () => {
  const { state, requests, hooks } = setup({ current_version: 'v0.24.3003', update_available: false, latest_installed: true }); await hooks.mount()
  assert.equal(state.indicator.value.text, 'Установлена последняя версия'); assert.equal(state.canUpdate.value, false)
  state.ask(); assert.equal(state.confirming.value, false); await state.submit()
  assert.equal(posts(requests).length, 0, 'nothing is sent without an offered, confirmed update')
})

test('unknown current version and unpublished image are not shown as up to date', async () => {
  let { state, hooks } = setup({ current_version: null, current_error: 'jackett_unavailable', update_available: false }); await hooks.mount()
  assert.equal(state.indicator.value.text, 'Jackett не отвечает — текущая версия неизвестна'); assert.equal(state.canUpdate.value, false)
  ;({ state, hooks } = setup({ update_available: false }, { image_published: false })); await hooks.mount()
  assert.equal(state.indicator.value.text, 'Вышла новая версия, её образ ещё не опубликован')
  ;({ state, hooks } = setup({}, { release_url: 'javascript:alert(1)' })); await hooks.mount()
  assert.equal(state.releaseUrl.value, '')
})

test('update needs explicit confirmation and sends only target and version', async () => {
  const { state, requests, hooks } = setup(); await hooks.mount()
  state.ask(); assert.equal(state.confirming.value, true); assert.equal(posts(requests).length, 0)
  await state.submit()
  const [sent] = posts(requests)
  assert.equal(sent.url, '/api/v1/admin/services/jackett/shared/update')
  assert.deepEqual(sent.body, { confirm: 'shared', version: 'v0.24.3003' })
  assert.equal(state.confirming.value, false); assert.match(state.notice.value, /автоматическим откатом/)
  assert.equal(state.item.value.job.state, 'queued'); assert.equal(state.canUpdate.value, false)
  assert.match(state.jobText.value.text, /ожидает исполнителя/)
})

test('double click sends one update request', async () => {
  const { state, requests, hooks, ctl } = setup(); await hooks.mount(); state.ask()
  let resolve; ctl.wait = new Promise(r => { resolve = r })
  const first = state.submit(); await state.submit(); await state.submit()
  assert.equal(posts(requests).length, 1); resolve(); await first
  await state.submit(); assert.equal(posts(requests).length, 1, 'an active job blocks another request')
})

test('polls the job through its phases, then reloads versions', async () => {
  const { state, requests, hooks, timers, ctl } = setup(); await hooks.mount(); state.ask(); await state.submit()
  ctl.jobs.push(job('running', { phase: 'pull' }), job('running', { phase: 'health' }), job('succeeded', { finished_at: NOW }))
  ctl.versions = versions({ current_version: 'v0.24.3003', update_available: false, latest_installed: true, job: job('succeeded', { finished_at: NOW }) })
  await fire(timers); assert.match(state.jobText.value.text, /загрузка образа/)
  await fire(timers); assert.match(state.jobText.value.text, /проверка работоспособности/)
  await fire(timers)
  assert.equal(pending(timers).length, 0, 'polling stops when the job finished')
  assert.equal(requests.filter(x => x.url.includes('/jobs/' + JOB_ID)).length, 3)
  assert.match(state.jobText.value.text, /^✓ Обновлено до v0\.24\.3003/)
  assert.equal(state.indicator.value.text, 'Установлена последняя версия')
})

test('rolled back and failed updates explain the outcome', async () => {
  let { state, hooks } = setup({ job: job('rolled_back', { error_code: 'health_failed', rolled_back_to: 'v0.24.2985', finished_at: NOW }) }); await hooks.mount()
  assert.match(state.jobText.value.text, /не прошла проверку работоспособности.*автоматически откачено на v0\.24\.2985/)
  ;({ state, hooks } = setup({ job: job('failed', { error_code: 'pull_failed', finished_at: NOW }) })); await hooks.mount()
  assert.match(state.jobText.value.text, /^✗ .*не удалось загрузить образ, сервис не изменён/)
  ;({ state, hooks } = setup({ job: job('failed', { error_code: 'updater_unavailable', finished_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }) })); await hooks.mount()
  assert.equal(state.jobText.value, null, 'old outcomes are not shown forever')
})

test('an active job found on load resumes polling', async () => {
  const { state, hooks, timers } = setup({ update_available: true, job: job('running', { phase: 'backup' }) }); await hooks.mount()
  assert.equal(pending(timers).length, 1); assert.equal(state.canUpdate.value, false)
  assert.match(state.jobText.value.text, /резервная копия настроек/)
})

test('server rejections are mapped to safe messages and refresh the state', async () => {
  const { state, requests, hooks, ctl } = setup(); await hooks.mount(); state.ask()
  ctl.post = () => { throw rejected('update_in_progress') }
  ctl.versions = versions({ job: job('running', { phase: 'start' }) })
  await state.submit()
  assert.equal(state.error.value, 'Обновление этого сервиса уже выполняется.'); assert.doesNotMatch(state.error.value, /raw-upstream/)
  assert.equal(requests.filter(x => x.url.startsWith('/api/v1/admin/services/versions')).length, 2)
  assert.equal(state.item.value.job.state, 'running'); assert.equal(posts(requests).length, 1)
  ctl.post = () => { throw new Error('offline') }; ctl.versions = versions(); await state.load(); state.ask(); await state.submit()
  assert.match(state.error.value, /^Запрос обновления не подтверждён сервером/)
  assert.equal(requests.filter(x => x.url.startsWith('/api/v1/admin/services/versions')).length, 4, 'a lost reply re-reads the real state')
})

test('brief network loss keeps polling; long loss tells the operator', async () => {
  const { state, hooks, timers, ctl } = setup(); await hooks.mount(); state.ask(); await state.submit()
  for (let i = 0; i < 39; i++) ctl.jobs.push(new Error('network'))
  for (let i = 0; i < 39; i++) await fire(timers)
  assert.equal(pending(timers).length, 1); assert.equal(state.error.value, '')
  ctl.jobs.push(new Error('network')); await fire(timers)
  assert.equal(pending(timers).length, 0); assert.match(state.error.value, /Обновление продолжается на сервере/)
})

test('torrserver node without fresh telemetry cannot be updated', async () => {
  const { state, hooks, props, ctl, requests } = setup()
  props.service = 'torrserver'; props.target = 'torrent-01'
  ctl.versions = { services: { torrserver: { latest: { latest_version: 'MatriX.149', checked_at: NOW, error_code: null, image_published: true },
    targets: [{ target: 'torrent-01', name: 'torrent-01', current_version: 'MatriX.148', current_error: null, update_available: true, latest_installed: false, update_allowed: false, job: null }] } } }
  await hooks.mount()
  assert.ok(requests.at(-1).url.endsWith('?service=torrserver'))
  assert.equal(state.indicator.value.text, 'Доступно обновление'); assert.equal(state.canUpdate.value, false)
  state.ask(); assert.equal(state.confirming.value, false)
})

test('unmount stops polling and ignores late answers', async () => {
  const { state, hooks, timers } = setup(); await hooks.mount(); state.ask(); await state.submit()
  assert.equal(pending(timers).length, 1); hooks.unmount()
  assert.equal(pending(timers).length, 0)
})

test('torrserver node not enrolled into the host updater asks for a Redeploy', async () => {
  const { state, hooks, props, ctl, requests } = setup()
  props.service = 'torrserver'; props.target = 'torrent-01'
  const node = over => ({ services: { torrserver: { latest: { latest_version: 'MatriX.149', checked_at: NOW, error_code: null, image_published: true },
    targets: [{ target: 'torrent-01', name: 'torrent-01', current_version: 'MatriX.148', current_error: null, update_available: true, latest_installed: false, update_allowed: false, updater_pending: true, job: null, ...over }] } } })
  ctl.versions = node()
  await hooks.mount()
  assert.equal(state.updaterPending.value, true); assert.equal(state.canUpdate.value, false)
  state.ask(); assert.equal(state.confirming.value, false)
  assert.match(source, /<p v-if="updaterPending" class="sv-meta sv-blocked" role="status" data-testid="sv-updater-pending">[^<]*<strong>Redeploy<\/strong>/)
  assert.match(source, /<p v-else-if="item\?\.update_available && item\?\.update_allowed === false" class="sv-meta">/)
  // A request that races the enrollment check gets the same, friendly answer and reloads.
  ctl.versions = node({ update_allowed: true, updater_pending: false }); await state.load()
  assert.equal(state.updaterPending.value, false); assert.equal(state.canUpdate.value, true)
  ctl.post = () => { throw rejected('updater_pending') }
  ctl.versions = node()
  state.ask(); await state.submit()
  assert.match(state.error.value, /выполните Redeploy этой ноды/); assert.doesNotMatch(state.error.value, /raw-upstream-detail/)
  assert.equal(state.updaterPending.value, true, 'the card reloaded after updater_pending')
  assert.ok(requests.filter(r => r.method === 'GET').length >= 3)
  // Other services never show the hint, whatever the payload says.
  const other = setup({ updater_pending: true }); await other.hooks.mount()
  assert.equal(other.state.updaterPending.value, false)
})

test('several torrserver nodes: only the node waiting for enrollment shows the Redeploy hint', async () => {
  const target = (id, over) => ({ target: id, name: id, current_version: 'MatriX.148', current_error: null, update_available: true,
    latest_installed: false, update_allowed: true, updater_pending: false, job: null, ...over })
  const versions = { services: { torrserver: { latest: { latest_version: 'MatriX.149', checked_at: NOW, error_code: null, image_published: true },
    targets: [target('torrent-01'), target('torrent-02', { update_allowed: false, updater_pending: true }), target('torrent-03')] } } }
  const cards = {}
  for (const id of ['torrent-01', 'torrent-02', 'torrent-03']) {
    const card = setup({}, {}, { versions })
    card.props.service = 'torrserver'; card.props.target = id
    await card.hooks.mount()
    cards[id] = card.state
  }
  assert.deepEqual(Object.fromEntries(Object.entries(cards).map(([id, s]) => [id, [s.updaterPending.value, s.canUpdate.value]])),
    { 'torrent-01': [false, true], 'torrent-02': [true, false], 'torrent-03': [false, true] })
  // After the Redeploy the same node is enrolled: hint gone, update allowed.
  const redeployed = setup({}, {}, { versions: { services: { torrserver: { ...versions.services.torrserver,
    targets: versions.services.torrserver.targets.map(t => t.target === 'torrent-02' ? { ...t, update_allowed: true, updater_pending: false } : t) } } } })
  redeployed.props.service = 'torrserver'; redeployed.props.target = 'torrent-02'
  await redeployed.hooks.mount()
  assert.equal(redeployed.state.updaterPending.value, false); assert.equal(redeployed.state.canUpdate.value, true)
})

test('FlareSolverr card reads its own service and updates through its own endpoint', async () => {
  const { state, requests, hooks } = setup({}, {}, { props: { service: 'flaresolverr' }, versions: searchVersions() }); await hooks.mount()
  assert.equal(requests[0].url, '/api/v1/admin/services/versions?service=flaresolverr')
  assert.equal(state.title.value, 'FlareSolverr')
  assert.equal(state.item.value.current_version, 'v3.3.21'); assert.equal(state.latest.value.latest_version, 'v3.3.25')
  assert.equal(state.releaseUrl.value, 'https://github.com/FlareSolverr/FlareSolverr/releases/tag/v3.3.25')
  assert.equal(state.policy.value.enabled, false, 'auto-update is OFF unless an admin turned it on')
  assert.match(state.autoText.value, /^Автообновление выключено — обновление только вручную\. Если включить \(для всех экземпляров FlareSolverr\): новая стабильная версия ставится не раньше чем через 24 ч/)
  state.ask(); await state.submit()
  const [sent] = posts(requests)
  assert.equal(sent.url, '/api/v1/admin/services/flaresolverr/shared/update')
  assert.deepEqual(sent.body, { confirm: 'shared', version: 'v3.3.25' })
  const down = setup({}, {}, { props: { service: 'flaresolverr' }, versions: searchVersions({}, { current_version: null, current_error: 'flaresolverr_unavailable', update_available: false }) }); await down.hooks.mount()
  assert.equal(down.state.indicator.value.text, 'FlareSolverr не отвечает — текущая версия неизвестна'); assert.equal(down.state.canUpdate.value, false)
})

test('auto-update checkbox saves the per-service policy and syncs the other cards of that service', async () => {
  const window = new EventTarget()
  const a = setup({}, {}, { window, versions: searchVersions() })
  const b = setup({}, {}, { window, versions: searchVersions() })
  const fs = setup({}, {}, { window, versions: searchVersions(), props: { service: 'flaresolverr' } })
  await a.hooks.mount(); await b.hooks.mount(); await fs.hooks.mount()
  const input = { checked: true }
  await a.state.toggle(true, input)
  assert.deepEqual(puts(a.requests), [{ method: 'PUT', url: '/api/v1/admin/services/jackett/auto-update', body: { enabled: true } }])
  assert.equal(a.state.policy.value.enabled, true); assert.equal(input.checked, true)
  assert.equal(a.state.notice.value, 'Автообновление Jackett включено.')
  assert.match(a.state.autoText.value, /^Включено для всех экземпляров Jackett:/)
  assert.equal(b.state.policy.value.enabled, true, 'another Jackett card shows the saved policy')
  assert.equal(fs.state.policy.value.enabled, false, 'FlareSolverr keeps its own policy')
  assert.equal(puts(b.requests).length + puts(fs.requests).length, 0, 'only the clicked card talks to the server')
  await a.state.toggle(true); assert.equal(puts(a.requests).length, 1, 'an unchanged value is not sent')
  b.hooks.unmount()
  await a.state.toggle(false, input)
  assert.equal(input.checked, false); assert.equal(a.state.notice.value, 'Автообновление Jackett выключено. Обновление — только вручную.')
  assert.equal(b.state.policy.value.enabled, true, 'an unmounted card no longer listens')
})

test('a rejected auto-update change keeps the checkbox on the server value', async () => {
  const { state, requests, hooks, ctl } = setup(); await hooks.mount()
  const input = { checked: true }
  ctl.put = () => { throw rejected('policy_changed_reload') }
  ctl.versions = versions(); ctl.versions.services.jackett.auto_update = { enabled: false, delay_hours: 48, updated_at: NOW }
  await state.toggle(true, input)
  assert.equal(state.error.value, 'Настройка автообновления изменилась в другом окне. Данные обновлены — проверьте их и повторите.')
  assert.doesNotMatch(state.error.value, /raw-upstream/)
  assert.equal(input.checked, false); assert.equal(state.policy.value.delay_hours, 48)
  assert.equal(requests.filter(x => x.url.startsWith('/api/v1/admin/services/versions')).length, 2, 'the fresh policy is re-read')
  ctl.put = () => { throw new Error('offline') }
  await state.toggle(true, input)
  assert.match(state.error.value, /^Настройка автообновления не сохранена сервером/); assert.equal(input.checked, false)
})

test('a locked card keeps the update button disabled and explains why', async () => {
  const reason = 'Идёт обновление FlareSolverr: операции с индексаторами временно недоступны.'
  const { state, requests, hooks, props } = setup({}, {}, { props: { locked: true, lockedReason: reason } }); await hooks.mount()
  assert.equal(state.canUpdate.value, false); assert.equal(state.blockedText.value, reason)
  state.ask(); assert.equal(state.confirming.value, false)
  state.confirming.value = true; await state.submit()
  assert.equal(posts(requests).length, 0, 'a locked card never sends an update'); state.confirming.value = false
  props.lockedReason = ''
  assert.match(state.blockedText.value, /выполняется операция с индексаторами этого экземпляра/)
  props.locked = false
  assert.equal(state.canUpdate.value, true); assert.equal(state.blockedText.value, '')
  state.ask(); await state.submit(); assert.equal(posts(requests).length, 1)
})

test('the host card learns when an update starts and finishes', async () => {
  const { state, hooks, timers, ctl, events } = setup(); await hooks.mount(); state.ask(); await state.submit(); await tick()
  assert.deepEqual(events, [['busy-change', true]])
  ctl.jobs.push(job('succeeded', { finished_at: NOW }))
  ctl.versions = versions({ current_version: 'v0.24.3003', update_available: false, latest_installed: true, job: job('succeeded', { finished_at: NOW }) })
  await fire(timers); await tick()
  assert.deepEqual(events.filter(([name]) => name === 'busy-change').map(([, busy]) => busy), [true, false])
  assert.deepEqual(events.filter(([name]) => name === 'updated').map(([, j]) => j.state), ['succeeded'], 'indexers are reloaded once after the update')
  const other = setup(); await other.hooks.mount(); other.state.ask(); await other.state.submit(); await tick()
  other.hooks.unmount(); assert.deepEqual(other.events.at(-1), ['busy-change', false], 'leaving the page releases the sibling lock')
})

test('the «accepted» banner is cleared once the job reports progress', async () => {
  const { state, hooks, timers, ctl } = setup(); await hooks.mount(); state.ask(); await state.submit(); await tick()
  assert.match(state.notice.value, /^Запрос принят/)
  ctl.jobs.push(job('running', { phase: 'pull' }))
  await fire(timers); await tick()
  assert.equal(state.notice.value, '')
  assert.match(state.jobText.value.text, /загрузка образа/)
})

test('a fresh update under post-check (soak) blocks the next update and refreshes itself', async () => {
  const until = new Date(Date.now() + 20 * 60000).toISOString()
  const { state, hooks, timers, ctl } = setup({ job: job('succeeded', { finished_at: NOW, soak_state: 'soaking', soak_until: until }) })
  ctl.versions.soak_minutes = 45
  await hooks.mount()
  assert.equal(state.soaking.value, true); assert.equal(state.canUpdate.value, false)
  assert.equal(state.blockedText.value, 'Обновление станет доступно после завершения пост-проверки текущей версии.')
  assert.equal(state.jobText.value.kind, 'run')
  assert.match(state.jobText.value.text, /^✓ Обновлено до v0\.24\.3003\. Идёт пост-проверка \(45 мин, до .+\): при сбое будет выполнен автоматический откат\.$/)
  state.ask(); assert.equal(state.confirming.value, false)
  const [next] = pending(timers); assert.equal(next.ms, 60000, 'the outcome is picked up without a click')
  ctl.versions = versions({ current_version: 'v0.24.3003', update_available: false, latest_installed: true, job: job('succeeded', { finished_at: NOW, soak_state: 'passed', soak_until: until }) })
  next.done = true; next.cb(); await tick()
  assert.equal(state.soaking.value, false); assert.match(state.jobText.value.text, /, пост-проверка пройдена\.$/)
  assert.equal(pending(timers).length, 0)
})

test('auto rollback after a failed post-check is explained, including the release pin fallback', async () => {
  let { state, hooks } = setup({ job: job('succeeded', { source: 'auto', finished_at: NOW, soak_state: 'auto_rolled_back', soak_reason: 'unhealthy', rolled_back_to: 'v0.24.2985' }) }); await hooks.mount()
  assert.equal(state.jobText.value.kind, 'bad')
  assert.equal(state.jobText.value.text, 'Версия v0.24.3003 не прошла пост-проверку (проверка здоровья контейнера не проходит) и автоматически откачена на v0.24.2985. Автообновление её больше не ставит.')
  ;({ state, hooks } = setup({ job: job('succeeded', { finished_at: NOW, soak_state: 'auto_rolled_back', soak_reason: 'oom_killed', fallback: 'release_pin' }) })); await hooks.mount()
  assert.match(state.jobText.value.text, /контейнеру не хватило памяти \(OOM\)\) и автоматически откачена на версию из текущего релиза\./)
  ;({ state, hooks } = setup({ job: job('running', { source: 'auto', phase: 'pull' }) })); await hooks.mount()
  assert.equal(state.jobText.value.text, 'Автообновление до v0.24.3003: загрузка образа…')
})

test('versions skipped by auto-update are listed and reset only after confirmation', async () => {
  const suppressed = [{ version: 'v0.24.3003', reason: 'auto_rolled_back', suppressed_at: NOW }, { version: 'v0.24.2999', reason: 'self_heal', suppressed_at: NOW }]
  const { state, requests, hooks, ctl } = setup({ suppressed }); await hooks.mount()
  assert.deepEqual(state.suppressedList.value.map(s => s.version), ['v0.24.3003', 'v0.24.2999'])
  await state.resetSuppressed(); assert.equal(posts(requests).length, 0, 'nothing is reset without confirmation')
  state.askReset(); assert.equal(state.confirmingReset.value, true)
  ctl.post = () => ({ data: { reset: 2 } })
  ctl.versions = versions({ suppressed: [] })
  await state.resetSuppressed()
  const [sent] = posts(requests)
  assert.equal(sent.url, '/api/v1/admin/services/jackett/shared/suppressed/reset'); assert.deepEqual(sent.body, { confirm: 'shared' })
  assert.equal(state.confirmingReset.value, false)
  assert.equal(state.notice.value, 'Сброшено пропущенных версий: 2. Автообновление снова может их установить.')
  assert.equal(state.suppressedList.value.length, 0, 'the list is re-read from the server')
  const other = setup({ suppressed }); await other.hooks.mount(); other.state.askReset()
  other.ctl.post = () => { throw rejected('unknown_target') }
  await other.state.resetSuppressed()
  assert.equal(other.state.error.value, 'Сервис не найден.'); assert.equal(other.state.confirmingReset.value, false)
  assert.equal(other.state.suppressedList.value.length, 2, 'a failed reset changes nothing')
})
