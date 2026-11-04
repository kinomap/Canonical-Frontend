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
const form = { revision: 'revision', unsupported: [], fields: [
 { id: 'password', label: 'Password', type: 'inputstring', secret: true, saved: true, value: '' },
 { id: 'username', label: 'Username', type: 'inputstring', secret: false, saved: true, value: 'saved-user' },
 { id: 'cookie', label: 'Cookie', type: 'inputstring', secret: true, saved: true, value: '' },
 { id: 'apikey', label: 'API key', type: 'inputstring', secret: true, saved: false, value: '' },
 { id: 'searchbyuploader', label: 'Search by uploader', type: 'inputstring', secret: false, saved: false, value: '' },
 { id: 'captchaimage', label: 'CAPTCHA', type: 'displayimage', value: 'data:image/png;base64,AAAA' },
 { id: 'captchatext', label: 'Captcha text', type: 'inputstring', secret: false, saved: false, value: '' },
 { id: 'proxyurl', label: 'Proxy', type: 'inputstring', secret: false, saved: false, value: '' },
 { id: 'flag', type: 'inputbool', value: true },
 { id: 'sitelink', type: 'inputstring', value: 'https://tracker.example/' }] }
function setup() {
 const requests = [], hooks = {}, response = { error: null, wait: null }
 const axios = {
  get: async (url) => { requests.push({ method: 'GET', url }); if (url.endsWith('/config')) return { data: structuredClone(form) }; if (url.endsWith('/indexers')) return { data: { indexers: structuredClone(response.indexers || [row]), observed_at: '2026-11-01T00:00:00Z' } }; return { data: { instances: [{ id: 'primary', name: 'Shared' }] } } },
  post: async (url, body) => { requests.push({ method: 'POST', url, body: structuredClone(body) }); if (response.wait) await response.wait; if (response.error) throw response.error; if (url.endsWith('/check')) return { data: { check: structuredClone(response.check || null), throttled: false } }; return { data: { ok: true } } },
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
 // Untouched ordinary values, captcha image and locked connection fields are not sent either.
 assert.deepEqual(Object.keys(sent.changes), ['flag'])
 assert.equal(sent.changes.flag.value, true); assert.equal(state.form.value, null)
 assert.deepEqual(Object.keys(state.draft.value), [])
})
test('new password and explicit clear have distinct semantics', async () => {
 const { state, requests } = setup(); await state.open(row)
 state.draft.value.password = 'new-private'; state.cleared.value.cookie = true; await state.save()
 const changes = requests.find(x => x.method === 'POST').body.changes
 assert.equal(changes.password.mode, 'replace'); assert.equal(changes.password.value, 'new-private'); assert.deepEqual(changes.cookie, { mode: 'clear' })
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

test('connected count stays global and switching to connected clears stale search', async () => {
 const { state, hooks } = setup(); await hooks.mount()
 state.indexers.value = [row, { ...row, id: 'other', name: 'NoNaMe Club' }, { ...row, id: 'available', configured: false }]
 state.filter.value = 'all'; state.query.value = 'Tracker'; state.page.value = 3
 assert.equal(state.connected.value, 2); assert.equal(state.matched.value.length, 2)
 state.filter.value = 'configured'; state.changeFilter()
 assert.equal(state.query.value, ''); assert.equal(state.page.value, 1)
 assert.equal(state.matched.value.length, 2); assert.equal(state.connected.value, 2)
})
test('successful save returns to complete connected list; failure preserves filter', async () => {
 const { state, response } = setup(); state.filter.value = 'all'; state.query.value = 'tracker'; await state.open(row); await state.save()
 assert.equal(state.filter.value, 'configured'); assert.equal(state.query.value, ''); assert.equal(state.page.value, 1)
 state.filter.value = 'all'; state.query.value = 'tracker'; await state.open(row); response.error = {}; await state.save()
 assert.equal(state.filter.value, 'all'); assert.equal(state.query.value, 'tracker')
})
test('ordinary fields show saved values, send only real edits and may be emptied', async () => {
 const { state, requests } = setup(); await state.open(row)
 assert.equal(state.draft.value.username, 'saved-user'); assert.equal(state.draft.value.password, '')
 state.draft.value.username = ''; state.draft.value.captchatext = 'x7k2'; await state.save()
 const changes = requests.find(x => x.method === 'POST').body.changes
 assert.deepEqual(changes.username, { mode: 'replace', value: '' }); assert.deepEqual(changes.captchatext, { mode: 'replace', value: 'x7k2' })
 assert.equal('searchbyuploader' in changes, false); assert.equal('proxyurl' in changes, false)
})
test('clear control exists only for saved real secrets', async () => {
 const { state, requests } = setup(); await state.open(row)
 state.cleared.value.username = true; state.cleared.value.apikey = true; state.cleared.value.searchbyuploader = true; await state.save()
 const changes = requests.find(x => x.method === 'POST').body.changes
 assert.equal('username' in changes, false); assert.equal('apikey' in changes, false); assert.equal('searchbyuploader' in changes, false)
 assert.match(source, /v-if="field\.secret && field\.saved" class="jackett-clear"/)
 assert.match(source, /:type="field\.secret \? 'password' : 'text'"/)
 assert.match(source, /:autocomplete="field\.secret \? 'new-password' : 'off'"/)
 assert.match(source, /:readonly="locked\(field\)"/)
})
test('captcha_required asks for the new image on a fresh form, keeps typed login, never secrets', async () => {
 const { state, requests, response } = setup(); await state.open(row)
 state.draft.value.username = 'new-user'; state.draft.value.password = 'typed-secret'; state.draft.value.captchatext = 'old'
 response.error = { response: { status: 409, data: { code: 'captcha_required', reload_required: true } } }
 await state.save()
 assert.equal(requests.filter(x => x.method === 'POST').length, 1)
 assert.equal(requests.filter(x => x.method === 'GET' && x.url.endsWith('/config')).length, 2)
 assert.match(state.notice.value, /^Введите символы с новой картинки/); assert.equal(state.error.value, '')
 assert.ok(state.form.value); assert.equal(state.draft.value.username, 'new-user')
 assert.equal(state.draft.value.password, ''); assert.equal(state.draft.value.captchatext, '')
 // The kept login is sent with the next attempt; nothing is retried automatically.
 response.error = null; state.draft.value.captchatext = 'new'; await state.save()
 const second = requests.filter(x => x.method === 'POST')[1].body.changes
 assert.deepEqual(second.username, { mode: 'replace', value: 'new-user' }); assert.equal('password' in second, false)
})
test('changed settings reload without replaying typed values', async () => {
 const { state, response } = setup(); await state.open(row); state.draft.value.username = 'stale'
 response.error = { response: { status: 409, data: { code: 'config_changed_reload' } } }
 await state.save()
 assert.equal(state.draft.value.username, 'saved-user'); assert.match(state.error.value, /Форма обновлена/)
})
test('Cloudflare block has an explicit operator message', async () => {
 const { state, response } = setup(); await state.open(row)
 response.error = { response: { status: 502, data: { code: 'cloudflare_challenge', error: 'Just a moment... raw' } } }
 await state.save()
 assert.equal(state.error.value, 'Сайт закрыт проверкой Cloudflare / требуется FlareSolverr или прокси.')
})

const AT = '2026-11-04T09:05:00Z'
const checks = requests => requests.filter(x => x.method === 'POST' && x.url.endsWith('/check'))
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
test('indexer status is the last real search, never just "connected"', () => {
 const { state } = setup()
 const ok = n => state.status({ ...row, check: { checked_at: AT, ok: true, result_count: n, error_code: null } })
 assert.match(ok(17), /^✓ Работает \(проверено \d\d\.\d\d, \d\d:\d\d, найдено 17 раздач\)$/)
 for (const [n, text] of [[1, '1 раздача'], [3, '3 раздачи'], [11, '11 раздач'], [21, '21 раздача'], [100, '100+ раздач'], [250, '100+ раздач']]) assert.ok(ok(n).endsWith(`найдено ${text})`), ok(n))
 const bad = code => state.status({ ...row, check: { checked_at: AT, ok: false, result_count: null, error_code: code } })
 assert.match(bad('cloudflare_403'), /^✗ Cloudflare 403 — сайт закрыт проверкой Cloudflare \(проверено /)
 assert.match(bad('auth_failed'), /^✗ Ошибка авторизации на трекере /)
 assert.match(bad('timeout'), /^✗ Timeout /); assert.match(bad('surprise'), /^✗ Ошибка проверки /)
 assert.equal(state.status({ ...row, check: null }), 'Ещё не проверялся'); assert.equal(state.status({ ...row, configured: false }), 'Не подключён')
 assert.equal(state.statusKind({ ...row, check: { ok: false } }), 'bad'); assert.equal(state.statusKind({ ...row, check: null }), 'unknown')
 assert.doesNotMatch(source, /\/test`|'Подключён' :/); assert.ok(source.includes(`@click="check(row, 'manual')"`))
})
test('«Проверить» runs one real check per click and shows its result', async () => {
 const { state, requests, response } = setup(); state.indexers.value = [{ ...row }]
 response.check = { checked_at: AT, ok: true, result_count: 42, error_code: null, duration_ms: 900, source: 'manual' }
 let resolve; response.wait = new Promise(r => { resolve = r })
 const first = state.check(state.indexers.value[0], 'manual'); await state.check(state.indexers.value[0], 'manual')
 assert.equal(checks(requests).length, 1); assert.match(state.status(state.indexers.value[0]), / · проверяется…$/)
 resolve(); await first
 const [sent] = checks(requests)
 assert.ok(sent.url.endsWith('/instances/primary/indexers/tracker/check')); assert.deepEqual(sent.body, { source: 'manual' })
 assert.match(state.status(state.indexers.value[0]), /^✓ Работает .*найдено 42 раздачи\)$/)
})
test('opening the list re-checks only stale trackers, one at a time', async () => {
 const { requests, response, hooks } = setup()
 response.indexers = [
  { ...row, id: 'fresh', check: { checked_at: new Date().toISOString(), ok: true, result_count: 5, error_code: null } },
  { ...row, id: 'old', check: { checked_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(), ok: false, result_count: null, error_code: 'timeout' } },
  { ...row, id: 'never', check: null }, { ...row, id: 'off', configured: false, check: null }]
 let resolve; response.wait = new Promise(r => { resolve = r })
 await hooks.mount()
 assert.deepEqual(checks(requests).map(x => [x.url.split('/').at(-2), x.body.source]), [['old', 'auto']])
 resolve(); await settle()
 assert.deepEqual(checks(requests).map(x => x.url.split('/').at(-2)), ['old', 'never'])
})
test('background check failures stay quiet; manual ones explain', async () => {
 const { state, response } = setup(); state.indexers.value = [{ ...row }]
 response.error = { response: { status: 409, data: { code: 'check_in_progress' } } }
 await state.check(state.indexers.value[0], 'auto'); assert.equal(state.notice.value, ''); assert.equal(state.error.value, '')
 await state.check(state.indexers.value[0], 'manual'); assert.match(state.notice.value, /проверка уже выполняется/)
 response.error = { response: { status: 503, data: { code: 'jackett_auth_failed', error: 'raw-upstream' } } }
 await state.check(state.indexers.value[0], 'manual'); assert.match(state.error.value, /^Backend не смог авторизоваться/)
 assert.equal(state.status(state.indexers.value[0]), 'Ещё не проверялся')
})
test('«Проверить все» checks every connected tracker sequentially', async () => {
 const { state, requests } = setup(); state.indexers.value = [{ ...row, id: 'a' }, { ...row, id: 'b' }, { ...row, id: 'c', configured: false }]
 await state.checkAll()
 assert.deepEqual(checks(requests).map(x => [x.url.split('/').at(-2), x.body.source]), [['a', 'manual'], ['b', 'manual']])
 assert.equal(state.checkingAll.value, false)
})
