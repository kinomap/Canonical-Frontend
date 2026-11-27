import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'
const require = createRequire(import.meta.url), vue = require('vue')
const source = readFileSync(new URL('../src/components/JackettCapacity.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'capacity-test' })
const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const busy = { level: 'red', reasons: ['backlog', 'rate_limited'], recommendation: 'add_instance', instances: 1, pending: 12, searching: 1, due: 11, due_wait_seconds: 75, retrying: 0, blocked_scopes: 1 }
const usage = { cpu_percent: 3.25, memory_mb: 612.4, jackett: { cpu_percent: 1, memory_mb: 300, memory_limit_mb: 512 }, flaresolverr: { cpu_percent: 2.25, memory_mb: 312.4, memory_limit_mb: 1024 } }
const resources = { observed_at: '2026-11-27T12:00:00Z', stale: false, host: { cpus: 4, memory_total_mb: 7936, memory_available_mb: 5120, disk_available_mb: 40960 }, instances: { shared: usage } }
const full = { ...busy, max_instances: 16, memory_required_mb: 1536, resources, can_add: { ok: true, reason: null }, job: null,
 instance_list: [{ id: 'shared', name: 'Shared Jackett', primary: true, removable: false, usage }, { id: 'shared-2', name: 'Shared Jackett 2', primary: false, removable: true, usage: null }] }
const job = (over = {}) => ({ job_id: '00000001-0000-4000-8000-000000000001', action: 'add', instance_id: 'shared-2', copy_from: 'shared', has_proxy: false, status: 'queued', phase: null, error_code: null, instances: null, indexers: null, copied_indexers: null, ...over })
function setup(answer, options = {}) {
 const requests = [], hooks = {}, timers = [], timeouts = [], emitted = []
 const replies = { jobs: [], post: null, delete: null, ...options }
 const axios = {
  get: async (url, config) => {
   requests.push({ method: 'GET', url, auth: config.headers.Authorization })
   if (url.includes('/instance-jobs/')) { const next = replies.jobs.shift(); if (next instanceof Error) throw next; return { data: { job: structuredClone(next) } } }
   if (answer instanceof Error) throw answer
   return { data: structuredClone(answer) }
  },
  post: async (url, body, config) => { requests.push({ method: 'POST', url, body: structuredClone(body), auth: config.headers.Authorization }); if (replies.post instanceof Error) throw replies.post; return { data: { job: structuredClone(replies.post || job()) } } },
  delete: async (url, config) => { requests.push({ method: 'DELETE', url, body: structuredClone(config.data), auth: config.headers.Authorization }); if (replies.delete instanceof Error) throw replies.delete; return { data: { job: structuredClone(replies.delete || job({ action: 'remove', copy_from: null })) } } },
 }
 const sandbox = { exports: {},
  setInterval: (fn, ms) => { timers.push(ms); return 1 }, clearInterval: () => { timers.push('cleared') },
  setTimeout: (fn, ms) => { timeouts.push({ fn, ms, cleared: false }); return timeouts.length }, clearTimeout: id => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true },
  require: n => n === 'vue' ? { ...vue, onMounted: cb => { hooks.mount = cb }, onBeforeUnmount: cb => { hooks.unmount = cb } } : { default: axios, __esModule: true },
  localStorage: { getItem: () => 'synthetic-admin' } }
 vm.runInNewContext(compiled, sandbox)
 const state = sandbox.exports.default.setup({}, { expose: () => {}, emit: (...a) => emitted.push(a) })
 const tick = async () => { const t = timeouts.filter(x => !x.cleared && !x.ran).pop(); assert.ok(t, 'a poll is scheduled'); assert.equal(t.ms, 3000); t.ran = true; await t.fn() }
 return { state, requests, hooks, timers, timeouts, emitted, replies, tick }
}
const failure = (code, status = 409) => Object.assign(new Error('raw server text'), { response: { status, data: { code, detail: 'raw server text' } } })

test('card compiles without HTML injection and sits above the Jackett settings', () => {
 assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'JackettCapacity.vue', id: 'c' }).errors, [])
 assert.doesNotMatch(source, /v-html|iframe|response\.data\.(error|detail)|console\.(log|error)|localStorage\.setItem/)
 const view = readFileSync(new URL('../src/views/MediaInfrastructure.vue', import.meta.url), 'utf8')
 const card = view.indexOf('<JackettCapacity @instances-changed="jackettInstancesChanged" />')
 assert.ok(card >= 0 && card < view.indexOf('<JackettSettings ref="jackettSettings" />'))
 assert.match(view, /jackettSettings\.value\?\.reloadInstances\(\)/)
})
test('overload shows red, the reasons and the add-instance advice; refreshes every 30 s', async () => {
 const { state, requests, hooks, timers } = setup(busy)
 await hooks.mount()
 assert.equal(requests[0].url, '/api/v1/admin/torrent-search/capacity'); assert.equal(requests[0].auth, 'Bearer synthetic-admin')
 assert.equal(state.level.value, 'red'); assert.equal(state.title.value, 'Перегрузка поиска')
 assert.equal(state.reasons.value.length, 2); assert.match(state.recommendation.value, /добавить инстанс Jackett/)
 assert.deepEqual(timers, [30000]); hooks.unmount(); assert.deepEqual(timers, [30000, 'cleared'])
})
test('normal load is green; a rate limit alone advises waiting', async () => {
 const green = setup({ ...busy, level: 'green', reasons: [], recommendation: 'none', due: 0, due_wait_seconds: 0, blocked_scopes: 0 })
 await green.hooks.mount(); assert.equal(green.state.title.value, 'Нагрузка в норме'); assert.match(green.state.recommendation.value, /достаточно/)
 const limited = setup({ ...busy, level: 'yellow', reasons: ['rate_limited'], recommendation: 'wait' })
 await limited.hooks.mount(); assert.match(limited.state.recommendation.value, /лимит трекера не снимет/)
})
test('errors show a fixed safe text, never the server message; bad shapes are refused', async () => {
 const denied = Object.assign(new Error('secret detail'), { response: { status: 403, data: { detail: 'secret detail' } } })
 const a = setup(denied); await a.hooks.mount(); assert.equal(a.state.error.value, 'Нужны права администратора.'); assert.equal(a.state.capacity.value, null)
 const b = setup({ level: '<script>' }); await b.hooks.mount(); assert.equal(b.state.error.value, 'Не удалось получить нагрузку поиска.')
})
test('instances list CPU/RAM from the collector; only added instances are removable', async () => {
 const { state, hooks } = setup(full); await hooks.mount()
 assert.equal(state.list.value.length, 2)
 assert.equal(state.cpu(state.list.value[0].usage.cpu_percent), '3.3 %'); assert.equal(state.mb(state.list.value[0].usage.memory_mb), '612 МБ')
 assert.equal(state.mb(state.list.value[1].usage?.memory_mb), '—'); assert.equal(state.cpu(undefined), '—')
 assert.equal(state.host.value.memory_available_mb, 5120); assert.equal(state.stale.value, false)
 state.askRemove(state.list.value[0]); assert.equal(state.removing.value, null)
 const old = setup({ ...busy }); await old.hooks.mount()                       // an older backend: no list, no buttons
 assert.equal(old.state.list.value.length, 0); assert.equal(old.state.canAdd.value, false); assert.equal(old.state.host.value, null)
})
test('add: copy trackers by default, proxy only in the request, then polling until done reloads the lists', async () => {
 const t = setup(full, { jobs: [job({ status: 'running', phase: 'starting' }), job({ status: 'succeeded', phase: 'done', copied_indexers: 4, instances: 2 })] })
 await t.hooks.mount()
 assert.equal(t.state.canAdd.value, true); t.state.openAdd()
 assert.equal(t.state.adding.value, true); assert.equal(t.state.copyTrackers.value, true)
 assert.equal(t.state.sameIpWarning.value, true)                               // 429 and no proxy: same IP
 t.state.proxy.value = ' socks5://user:pw-secret@proxy.example:1080 '
 assert.equal(t.state.sameIpWarning.value, false)
 await t.state.confirmAdd()
 const post = t.requests.find(r => r.method === 'POST')
 assert.equal(post.url, '/api/v1/admin/torrent-search/instances'); assert.equal(post.auth, 'Bearer synthetic-admin')
 assert.deepEqual(post.body, { confirm: true, copy_trackers: true, proxy: 'socks5://user:pw-secret@proxy.example:1080' })
 assert.equal(t.state.adding.value, false); assert.equal(t.state.proxy.value, '')     // the secret is not kept
 assert.equal(t.state.active.value, true); assert.equal(t.state.canAdd.value, false)
 assert.match(t.state.jobTitle.value, /ждёт исполнителя/)
 await t.tick()
 assert.equal(t.requests.at(-1).url, '/api/v1/admin/torrent-search/instance-jobs/00000001-0000-4000-8000-000000000001')
 assert.match(t.state.jobTitle.value, /запуск Jackett и FlareSolverr/); assert.deepEqual(t.emitted, [])
 const before = t.requests.length
 await t.tick()
 assert.equal(t.state.active.value, false); assert.match(t.state.jobTitle.value, /готово, скопировано трекеров: 4/)
 assert.deepEqual(t.emitted, [['instances-changed']])
 assert.equal(t.requests.slice(before).filter(r => r.url === '/api/v1/admin/torrent-search/capacity').length, 1)
 assert.equal(t.timeouts.filter(x => !x.cleared && !x.ran).length, 0)             // polling stopped
 assert.ok(JSON.stringify(t.state.jobTitle.value).indexOf('pw-secret') < 0)
})
test('add without copy or proxy sends only the confirmation', async () => {
 const t = setup({ ...full, reasons: [] }); await t.hooks.mount()
 t.state.openAdd(); assert.equal(t.state.sameIpWarning.value, false)
 t.state.copyTrackers.value = false; await t.state.confirmAdd()
 assert.deepEqual(t.requests.find(r => r.method === 'POST').body, { confirm: true, copy_trackers: false })
})
test('add is blocked with a reason from the server', async () => {
 const t = setup({ ...full, can_add: { ok: false, reason: 'insufficient_resources' } }); await t.hooks.mount()
 assert.equal(t.state.canAdd.value, false); assert.match(t.state.blockedText.value, /1536 МБ/)
 t.state.openAdd(); assert.equal(t.state.adding.value, false)
 const limit = setup({ ...full, can_add: { ok: false, reason: 'instance_limit_reached' } }); await limit.hooks.mount()
 assert.match(limit.state.blockedText.value, /16 инстансов/)
})
test('a refused request shows a fixed text for its code, never the server text', async () => {
 const t = setup(full, { post: failure('proxy_not_public', 422) }); await t.hooks.mount()
 t.state.openAdd(); t.state.proxy.value = 'http://10.0.0.1:3128'; await t.state.confirmAdd()
 assert.match(t.state.jobError.value, /публичным адресом/); assert.equal(t.state.adding.value, true); assert.equal(t.state.job.value, null)
 const u = setup(full, { post: failure('something_new') }); await u.hooks.mount()
 u.state.openAdd(); await u.state.confirmAdd()
 assert.equal(u.state.jobError.value, 'Не удалось поставить добавление инстанса в очередь.')
 assert.doesNotMatch(u.state.jobError.value, /raw server text/)
})
test('remove asks first, sends a confirmed DELETE and follows the job; a rollback is explained', async () => {
 const t = setup(full, { jobs: [job({ action: 'remove', status: 'failed', error_code: 'remove_failed', copy_from: null })] })
 await t.hooks.mount()
 t.state.askRemove(t.state.list.value[1]); assert.equal(t.state.removing.value.id, 'shared-2')
 await t.state.confirmRemove()
 const del = t.requests.find(r => r.method === 'DELETE')
 assert.equal(del.url, '/api/v1/admin/torrent-search/instances/shared-2'); assert.deepEqual(del.body, { confirm: true })
 assert.equal(t.state.removing.value, null); assert.match(t.state.jobTitle.value, /Удаление инстанса shared-2/)
 await t.tick()
 assert.match(t.state.jobTitle.value, /не удалось \(не удалось удалить контейнеры инстанса\)/)
 assert.deepEqual(t.emitted, [['instances-changed']])
 const r = setup({ ...full, job: job({ status: 'rolled_back', error_code: 'start_failed' }) }); await r.hooks.mount()
 assert.match(r.state.jobTitle.value, /Jackett или FlareSolverr не запустились\), изменения отменены/)
 assert.equal(r.timeouts.length, 0)
})
test('an operation running on the server is followed after a page load; unmount stops polling', async () => {
 const t = setup({ ...full, job: job({ status: 'running', phase: 'copy' }) }, { jobs: [new Error('network')] })
 await t.hooks.mount()
 assert.equal(t.state.active.value, true); assert.match(t.state.jobTitle.value, /копирование трекеров/)
 assert.equal(t.state.canAdd.value, false)
 await t.tick()                                                                 // a failed poll retries
 assert.match(t.state.jobError.value, /повторяем/)
 assert.equal(t.timeouts.filter(x => !x.cleared && !x.ran).length, 1)
 t.hooks.unmount()
 assert.equal(t.timeouts.filter(x => !x.cleared && !x.ran).length, 0)
})
