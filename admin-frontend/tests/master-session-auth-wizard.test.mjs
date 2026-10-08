// Master Telegram Session authorization wizard: the challenge returned by
// request-code ({phone, phone_code_hash}) must be sent back by submit-code, the
// 2FA step must continue the same flow, and real backend errors must be shown.
// Run: node --test tests/master-session-auth-wizard.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(fileURLToPath(new URL('../src/components/MasterSession.vue', import.meta.url)), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'master-session-test' })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const REQUEST_CODE = '/api/v1/admin/media/master-session/auth/request-code'
const SUBMIT_CODE = '/api/v1/admin/media/master-session/auth/submit-code'
const MASTER = '/api/v1/admin/media/master-session'
const HASH = 'challenge-hash-from-step-1'

function mount(postHandler) {
  const posts = []
  const gets = []
  const toasts = []
  const stored = []
  let master = { id: 'm1', session_identifier: 'tg_stream_backend', status: 'UNAUTHORIZED',
    health_status: 'UNHEALTHY', last_health_check: null }
  const axios = {
    get: async (url) => {
      gets.push(url)
      if (url === MASTER) return { data: master }
      return { data: { telegram_status: 'ok', channel_sync_worker: 'running', reconciliation_worker: 'running' } }
    },
    post: async (url, body) => {
      posts.push({ url, body: structuredClone(body) })
      const result = await postHandler(url, body)
      if (result?.authorized) master = { ...master, status: 'ACTIVE', health_status: 'HEALTHY',
        last_health_check: new Date().toISOString() }
      return result
    },
  }
  const sandbox = {
    exports: {},
    require: (name) => name === 'axios' ? { __esModule: true, default: axios }
      : name === '../toast' ? { addToast: (msg, kind) => toasts.push({ msg, kind }) } : require(name),
    localStorage: {
      getItem: () => 'admin-jwt',
      setItem: (k, v) => stored.push([k, v]),
      removeItem: () => {},
    },
    sessionStorage: { setItem: (k, v) => stored.push([k, v]), getItem: () => null, removeItem: () => {} },
    window: { setInterval: () => 1, clearInterval: () => {} },
    clearInterval: () => {},
  }
  vm.runInNewContext(javascript, sandbox)
  const state = sandbox.exports.default.setup({}, { expose: () => {}, emit: () => {} })
  return { state, posts, gets, toasts, stored, master: () => master }
}

const ok = (data) => ({ data })

async function requestCode(app) {
  app.state.startAuth()
  assert.equal(app.state.authStep.value, 'phone')
  app.state.authPhone.value = '+79990001122'
  await app.state.requestCode()
  assert.equal(app.state.authStep.value, 'code')
}

test('full flow: phone_code_hash from step 1 is sent with phone and code in step 2', async () => {
  const app = mount(async (url) => url === REQUEST_CODE
    ? ok({ phone: '+79990001122', phone_code_hash: HASH })
    : { ...ok({ success: true, requires_password: false }), authorized: true })
  await requestCode(app)
  assert.deepEqual(app.posts[0], { url: REQUEST_CODE, body: { phone: '+79990001122' } })

  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.deepEqual(app.posts[1], {
    url: SUBMIT_CODE,
    body: { phone: '+79990001122', phone_code_hash: HASH, code: '12489' },
  })
  // Success: wizard closed, master state re-fetched from the backend.
  assert.equal(app.state.authStep.value, 'idle')
  assert.ok(app.gets.includes(MASTER))
  assert.equal(app.state.session.value.status, 'ACTIVE')
  assert.equal(app.state.session.value.health_status, 'HEALTHY')
  assert.ok(app.state.session.value.last_health_check)
  assert.match(app.state.displayStatus.value.label, /AUTHORIZED/)
})

test('2FA: requires_password continues the same flow with the same challenge', async () => {
  const app = mount(async (url, body) => {
    if (url === REQUEST_CODE) return ok({ phone: '+79990001122', phone_code_hash: HASH })
    if (!body.password) return ok({ success: false, requires_password: true, message: '2FA password required' })
    return { ...ok({ success: true }), authorized: true }
  })
  await requestCode(app)
  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.equal(app.state.authStep.value, 'password')
  app.state.authPassword.value = 'cloud-password'
  await app.state.submitPassword()
  assert.deepEqual(app.posts[2].body, {
    phone: '+79990001122', phone_code_hash: HASH, code: '12489', password: 'cloud-password',
  })
  assert.equal(app.state.authStep.value, 'idle')
  assert.equal(app.state.session.value.status, 'ACTIVE')
})

test('real Telegram error is shown, not a generic failure; retry keeps the challenge', async () => {
  let attempt = 0
  const app = mount(async (url) => {
    if (url === REQUEST_CODE) return ok({ phone: '+79990001122', phone_code_hash: HASH })
    attempt += 1
    if (attempt === 1) {
      throw { response: { status: 400, data: { detail: 'PHONE_CODE_INVALID: The phone code entered was invalid' } } }
    }
    return { ...ok({ success: true }), authorized: true }
  })
  await requestCode(app)
  app.state.authCode.value = '00000'
  await app.state.submitCode()
  assert.equal(app.state.authError.value, 'PHONE_CODE_INVALID: The phone code entered was invalid')
  assert.equal(app.toasts.at(-1).msg, 'PHONE_CODE_INVALID: The phone code entered was invalid')
  assert.equal(app.state.authStep.value, 'code')
  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.equal(app.posts.at(-1).body.phone_code_hash, HASH)
  assert.equal(app.state.authStep.value, 'idle')
})

test('expired code returns to the phone step and drops the challenge', async () => {
  const app = mount(async (url) => {
    if (url === REQUEST_CODE) return ok({ phone: '+79990001122', phone_code_hash: HASH })
    throw { response: { status: 400, data: { detail: 'PHONE_CODE_EXPIRED: The confirmation code has expired' } } }
  })
  await requestCode(app)
  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.equal(app.state.authStep.value, 'phone')
  assert.match(app.state.authError.value, /^PHONE_CODE_EXPIRED/)
  const before = app.posts.length
  await app.state.submitCode()  // no challenge any more: must not send a request
  assert.equal(app.posts.length, before)
})

test('already authorized: backend 409 is shown and the wizard closes', async () => {
  const app = mount(async () => {
    throw { response: { status: 409, data: { detail: 'SESSION_ALREADY_AUTHORIZED: the Master Telegram Session is already authorized' } } }
  })
  app.state.startAuth()
  app.state.authPhone.value = '+79990001122'
  await app.state.requestCode()
  assert.equal(app.state.authStep.value, 'idle')
  assert.match(app.toasts.at(-1).msg, /^SESSION_ALREADY_AUTHORIZED/)
})

test('422 validation detail is rendered readably', async () => {
  const app = mount(async (url) => {
    if (url === REQUEST_CODE) return ok({ phone: '+79990001122', phone_code_hash: HASH })
    throw { response: { status: 422, data: { detail: [
      { loc: ['body', 'phone_code_hash'], msg: 'Field required', type: 'missing' }] } } }
  })
  await requestCode(app)
  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.equal(app.state.authError.value, 'phone_code_hash: Field required')
})

test('phone_code_hash is never persisted, toasted or kept after the flow', async () => {
  const app = mount(async (url) => url === REQUEST_CODE
    ? ok({ phone: '+79990001122', phone_code_hash: HASH })
    : { ...ok({ success: true }), authorized: true })
  await requestCode(app)
  app.state.authCode.value = '12489'
  await app.state.submitCode()
  assert.deepEqual(app.stored, [])
  assert.ok(app.toasts.every((t) => !t.msg.includes(HASH)))
  assert.ok(!source.includes('localStorage.setItem'), 'wizard must not persist challenge state')
  // After completion a new submit has no challenge and sends nothing.
  const before = app.posts.length
  app.state.authStep.value = 'code'
  await app.state.submitCode()
  assert.equal(app.posts.length, before)
  assert.ok(!/\{\{[^}]*phone_code_hash[^}]*\}\}/.test(descriptor.template.content), 'hash must not be rendered')
})
