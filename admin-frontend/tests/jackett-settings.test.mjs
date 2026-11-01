import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'
const require = createRequire(import.meta.url), vue = require('vue')
const source = readFileSync(new URL('../src/components/JackettSettings.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'jackett-test' })
const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const row = { id: 'tracker', name: 'Tracker', configured: true, type: 'private', language: 'ru-RU' }
const form = { revision: 'revision', unsupported: [], fields: [{ id: 'password', label: 'Password', type: 'inputstring', secret: true, saved: true, value: '' }, { id: 'username', label: 'Username', type: 'inputstring', secret: true, value: '' }, { id: 'flag', type: 'inputbool', value: true }, { id: 'sitelink', type: 'inputstring', value: 'https://tracker.example/' }] }
function setup() {
 const requests = [], hooks = {}, response = { error: null, wait: null }
 const axios = {
  get: async (url) => { requests.push({ method: 'GET', url }); if (url.endsWith('/config')) return { data: structuredClone(form) }; if (url.endsWith('/indexers')) return { data: { indexers: [row], observed_at: '2026-11-01T00:00:00Z' } }; return { data: { instances: [{ id: 'primary', name: 'Shared' }] } } },
  post: async (url, body) => { requests.push({ method: 'POST', url, body: structuredClone(body) }); if (response.wait) await response.wait; if (response.error) throw response.error; return { data: { ok: true } } },
  delete: async (url, config) => { requests.push({ method: 'DELETE', url, body: config.data }); return { data: { ok: true } } },
 }
 const sandbox = { exports: {}, require: n => n === 'vue' ? { ...vue, onMounted: cb => { hooks.mount = cb }, onBeforeUnmount: cb => { hooks.unmount = cb } } : { default: axios, __esModule: true }, localStorage: { getItem: () => 'synthetic-admin' }, document: { querySelector: () => null } }
 vm.runInNewContext(compiled, sandbox)
 const state = sandbox.exports.default.setup({}, { expose: () => {} })
 state.selected.value = 'primary'
 return { state, requests, hooks, response }
}
test('settings compiles without HTML injection, raw errors or direct Jackett UI', () => {
 assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'JackettSettings.vue', id: 'j' }).errors, [])
 assert.doesNotMatch(source, /v-html|iframe|response\.data\.error|console\.(log|error)|localStorage\.setItem/)
 const obs = readFileSync(new URL('../src/views/MediaInfrastructure.vue', import.meta.url), 'utf8')
 assert.ok(obs.indexOf('<JackettSettings />') < obs.indexOf('<template v-if="data">'))
})
test('mount lists instances and configured indexers', async () => {
 const { state, hooks } = setup(); await hooks.mount()
 assert.equal(state.indexers.value.length, 1); assert.equal(state.connected.value, 1); assert.equal(state.loading.value, false)
})
test('omitted saved password stays omitted; boolean fields remain typed', async () => {
 const { state, requests } = setup(); await state.open(row); await state.save()
 const sent = requests.find(x => x.method === 'POST').body
 assert.equal('password' in sent.changes, false); assert.equal('sitelink' in sent.changes, false)
 assert.equal(sent.changes.flag.value, true); assert.equal(state.form.value, null)
 assert.deepEqual(Object.keys(state.draft.value), [])
})
test('new password and explicit clear have distinct semantics', async () => {
 const { state, requests } = setup(); await state.open(row)
 state.draft.value.password = 'new-private'; state.cleared.value.username = true; await state.save()
 const changes = requests.find(x => x.method === 'POST').body.changes
 assert.equal(changes.password.mode, 'replace'); assert.equal(changes.password.value, 'new-private'); assert.equal(changes.username.mode, 'clear')
})
test('failed save clears entered secrets, reloads form and never automatically retries', async () => {
 const { state, requests, response } = setup(); await state.open(row); state.draft.value.password = 'new-private'
 response.error = { response: { data: { code: 'jackett_action_failed', error: 'raw-upstream-secret' } } }
 await state.save()
 assert.equal(requests.filter(x => x.method === 'POST').length, 1)
 assert.equal(state.draft.value.password, ''); assert.ok(state.error.value); assert.doesNotMatch(state.error.value, /raw-upstream/)
 assert.equal(state.notice.value, '')
})
test('double submit cannot create concurrent writes', async () => {
 const { state, requests, response } = setup(); await state.open(row)
 let resolve; response.wait = new Promise(r => { resolve = r }); const first = state.save(); await state.save()
 assert.equal(requests.filter(x => x.method === 'POST').length, 1); resolve(); await first
})
test('delete is a fixed authenticated action with explicit tracker confirmation', async () => {
 const { state, requests } = setup(); await state.action(row, 'delete')
 const sent = requests.find(x => x.method === 'DELETE'); assert.equal(sent.body.confirm, 'tracker'); assert.ok(sent.url.endsWith('/indexers/tracker'))
})
test('unmount clears credentials and rejects late form response', async () => {
 const { state, hooks } = setup(); const pending = state.open(row); hooks.unmount(); await pending
 assert.equal(state.editing.value, null); assert.deepEqual(Object.keys(state.draft.value), [])
})
