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
const target = (over = {}) => ({ target: 'shared', name: 'Shared Jackett', current_version: 'v0.24.2985', current_error: null, update_available: true, latest_installed: false, job: null, ...over })
const versions = (over = {}, latest = {}) => ({ auto_update: false, checked_at: NOW, services: { jackett: { title: 'Jackett', targets_error: null, targets: [target(over)],
  latest: { latest_version: 'v0.24.3003', published_at: NOW, release_url: 'https://github.com/Jackett/Jackett/releases/tag/v0.24.3003', checked_at: NOW, error_code: null, image_published: true, ...latest } } } })
const job = (state, over = {}) => ({ job_id: JOB_ID, service: 'jackett', target: 'shared', state, from_version: 'v0.24.2985', to_version: 'v0.24.3003', error_code: null, phase: null, rolled_back_to: null, late_report: false, created_at: NOW, started_at: null, finished_at: null, updated_at: NOW, ...over })
const rejected = code => Object.assign(new Error(code), { response: { status: 409, data: { code, error: 'raw-upstream-detail' } } })

function setup(over = {}, latest = {}) {
  const requests = [], hooks = {}, timers = []
  const ctl = { versions: versions(over, latest), post: () => ({ data: { job: job('queued') } }), jobs: [], wait: null }
  const axios = {
    get: async (url) => {
      requests.push({ method: 'GET', url })
      if (url.includes('/jobs/')) { const next = ctl.jobs.shift(); if (next instanceof Error) throw next; return { data: { job: next } } }
      return { data: structuredClone(ctl.versions) }
    },
    post: async (url, body) => { requests.push({ method: 'POST', url, body: structuredClone(body) }); if (ctl.wait) await ctl.wait; return ctl.post() },
  }
  const sandbox = {
    exports: {}, localStorage: { getItem: () => 'synthetic-admin' },
    require: n => n === 'vue' ? { ...vue, onMounted: cb => { hooks.mount = cb }, onBeforeUnmount: cb => { hooks.unmount = cb } } : { default: axios, __esModule: true },
    setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true },
  }
  vm.runInNewContext(compiled, sandbox)
  const props = vue.reactive({ service: 'jackett', target: 'shared' })
  const state = sandbox.exports.default.setup(props, { expose: () => {} })
  return { state, requests, hooks, timers, props, ctl }
}
const pending = timers => timers.filter(x => !x.cleared && !x.done)
async function fire(timers) {
  const [next] = pending(timers); assert.ok(next, 'a poll is scheduled'); assert.equal(next.ms, 3000)
  next.done = true; await next.cb()
}
const posts = requests => requests.filter(x => x.method === 'POST')

test('compiles without HTML injection, raw errors or unsafe links', () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ServiceVersion.vue', id: 's' }).errors, [])
  assert.doesNotMatch(source, /v-html|iframe|response\.data\.error|console\.(log|error)|localStorage\.setItem/)
  for (const text of ['Текущая версия', 'Актуальная версия', 'Обновить сервис', 'Да, обновить', 'Автообновление выключено']) assert.ok(source.includes(text), text)
  for (const file of ['JackettSettings.vue', 'TorrentServices.vue']) {
    const host = readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
    assert.match(host, /<ServiceVersion v-if="[^"]+" service="(jackett|torrserver)" :target="[^"]+" \/>/)
  }
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
