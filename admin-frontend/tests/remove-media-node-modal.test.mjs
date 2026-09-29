import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(fileURLToPath(new URL('../src/components/RemoveMediaNodeModal.vue', import.meta.url)), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'remove-modal-test' })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function mount(initialOperation, get) {
  const stored = new Map(initialOperation ? [['node-removal:node-1', initialOperation]] : [])
  const requests = []
  const intervals = []
  const emitted = []
  const axios = {
    get: async (url) => { requests.push(url); return get(url) },
    post: async () => ({ data: { safe_to_remove: true } }),
  }
  const sandbox = {
    exports: {},
    require: (name) => name === 'axios' ? { __esModule: true, default: axios }
      : name === '../toast' ? { addToast: () => {} } : require(name),
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
    window: {
      setInterval: (callback) => { intervals.push(callback); return intervals.length },
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
    clearInterval: () => {},
    clearTimeout: () => {},
  }
  vm.runInNewContext(javascript, sandbox)
  const component = sandbox.exports.default
  const state = component.setup(
    { node: { id: 'node-1', name: 'Node', node_id: 'node', hostname: null, status: 'ACTIVE' } },
    { expose: () => {}, emit: (...args) => emitted.push(args) },
  )
  return { state, requests, intervals, emitted }
}

test('terminal success resolves by operation ID after node deletion', async () => {
  const app = mount('operation-1', async () => ({ data: { status: 'COMPLETED', stages: {} } }))
  await app.state.pollStatus()
  assert.equal(app.state.phase.value, 'completed')
  assert.ok(app.requests.every((url) => url.includes('/operation-1/removal')))
})

test('terminal failure shows persisted stage and reason', async () => {
  const app = mount('operation-2', async () => ({
    data: { status: 'DECOMMISSION_FAILED', error_stage: 'verify_clean',
      error_reason: 'RESIDUAL_FOUND: image', stages: { verify_clean: { status: 'failed' } } },
  }))
  await app.state.pollStatus()
  assert.equal(app.state.phase.value, 'failed')
  assert.equal(app.state.errorStage.value, 'verify_clean')
  assert.match(app.state.errorReason.value, /RESIDUAL_FOUND/)
})

test('404 is unknown, not success or backend failure', async () => {
  const app = mount('operation-3', async () => { throw { response: { status: 404 } } })
  await app.state.pollStatus()
  assert.equal(app.state.phase.value, 'not_found')
  assert.notEqual(app.state.removalStatus.value, 'DECOMMISSION_FAILED')
})

test('transient errors do not fake terminal state; repeated errors stop spinner', async () => {
  const app = mount('operation-4', async () => { throw new Error('connection refused') })
  await app.state.pollStatus()
  assert.equal(app.state.phase.value, 'progress')
  assert.match(app.state.pollError.value, /Retrying/)
  for (let i = 0; i < 4; i++) await app.state.pollStatus()
  assert.equal(app.state.phase.value, 'status_unavailable')
  assert.equal(app.state.removalStatus.value, '')
})
