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
function setup(answer) {
 const requests = [], hooks = {}, timers = []
 const axios = { get: async (url, config) => { requests.push({ url, auth: config.headers.Authorization }); if (answer instanceof Error) throw answer; return { data: structuredClone(answer) } } }
 const sandbox = { exports: {}, setInterval: (fn, ms) => { timers.push(ms); return 1 }, clearInterval: () => { timers.push('cleared') },
  require: n => n === 'vue' ? { ...vue, onMounted: cb => { hooks.mount = cb }, onBeforeUnmount: cb => { hooks.unmount = cb } } : { default: axios, __esModule: true },
  localStorage: { getItem: () => 'synthetic-admin' } }
 vm.runInNewContext(compiled, sandbox)
 const state = sandbox.exports.default.setup({}, { expose: () => {} })
 return { state, requests, hooks, timers }
}
test('card compiles without HTML injection and sits above the Jackett settings', () => {
 assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'JackettCapacity.vue', id: 'c' }).errors, [])
 assert.doesNotMatch(source, /v-html|iframe|response\.data\.(error|detail)|console\.(log|error)|localStorage\.setItem/)
 const view = readFileSync(new URL('../src/views/MediaInfrastructure.vue', import.meta.url), 'utf8')
 assert.ok(view.indexOf('<JackettCapacity />') >= 0 && view.indexOf('<JackettCapacity />') < view.indexOf('<JackettSettings />'))
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
