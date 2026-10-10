import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const vue = require('vue')
const { renderToString } = require('vue/server-renderer')

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const toCjs = (code) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// ── helpers module ──
const libExports = {}
vm.runInNewContext(toCjs(read('../src/lib/mediaNodeView.ts')), { exports: libExports, require })

// ── MediaNodes.vue (script + template compiled separately so setup bindings stay reachable) ──
const { descriptor } = parse(read('../src/views/MediaNodes.vue'))
const script = compileScript(descriptor, { id: 'media-nodes-test' })
const template = compileTemplate({
  source: descriptor.template.content,
  filename: 'MediaNodes.vue',
  id: 'media-nodes-test',
  compilerOptions: { bindingMetadata: script.bindings },
})
assert.deepEqual(template.errors, [])
const scriptJs = toCjs(script.content)
const templateJs = toCjs(template.code)

const stub = (name) => ({ __esModule: true, default: { name, render: () => null } })

function makeComponent(responses) {
  const requests = []
  let call = 0
  const axios = {
    get: async (url) => {
      requests.push(url)
      const next = responses[Math.min(call++, responses.length - 1)]
      if (next instanceof Error) throw next
      return { data: next }
    },
    post: async () => ({ data: {} }),
  }
  const sandboxRequire = (name) => {
    if (name === 'vue') return vue
    if (name === 'axios') return { __esModule: true, default: axios }
    if (name === 'vue-router') return { useRouter: () => ({ push: () => {} }) }
    if (name === '../toast') return { addToast: () => {} }
    if (name === '../lib/mediaNodeView') return libExports
    if (name.endsWith('AddMediaNodeWizard.vue')) return stub('AddMediaNodeWizard')
    if (name.endsWith('RemoveMediaNodeModal.vue')) return stub('RemoveMediaNodeModal')
    return require(name)
  }
  const storage = new Map()
  const sandbox = {
    exports: {},
    require: sandboxRequire,
    localStorage: {
      get length() { return storage.size },
      key: (i) => [...storage.keys()][i] ?? null,
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    window: { setInterval: () => 1, clearInterval: () => {} },
    clearInterval: () => {},
  }
  vm.runInNewContext(scriptJs, sandbox)
  const tpl = { exports: {} }
  vm.runInNewContext(templateJs, { exports: tpl.exports, require: sandboxRequire })
  const base = sandbox.exports.default
  return { base, render: tpl.exports.render, requests }
}

/** Render after `fetches` calls to fetchNodes (onMounted does not run during SSR). */
async function renderPage(responses, fetches = 1) {
  const { base, render, requests } = makeComponent(responses)
  let bindings
  const component = {
    ...base,
    async setup(props, ctx) {
      bindings = base.setup(props, ctx)
      for (let i = 0; i < fetches; i++) await bindings.fetchNodes()
      return bindings
    },
    render,
  }
  const app = vue.createSSRApp(component)
  const warnings = []
  app.config.warnHandler = (msg) => warnings.push(msg)
  const html = await renderToString(app)
  const benign = /(onMounted|onUnmounted) is called when there is no active component instance/
  const unexpected = warnings.filter((w) => !benign.test(w))
  assert.deepEqual(unexpected, [], 'unexpected Vue warnings: ' + unexpected.join(' | '))
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  return { html, text, bindings, requests }
}

const count = (html, needle) => html.split(needle).length - 1
const httpError = (status, detail) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data: { detail } },
})

const node = (over) => ({
  id: 'id-' + over.node_id, name: over.node_id, hostname: null, public_url: null,
  media_endpoint: 'http://10.8.0.2:8100', region: null, status: 'ACTIVE', health_status: 'HEALTHY',
  enabled: true, active_streams: 0, routing_eligible: true, routing_exclusion_reasons: [],
  heartbeat_age_seconds: 5, heartbeat_freshness_seconds: 90, effective_stream_capacity: 10,
  available_capacity: 10, node_version: '1.4.0', node_commit: 'f6d3d6b0123', ...over,
})

test('a failed request is an error state with retry, never the empty state', async () => {
  const { html, text, bindings } = await renderPage([httpError(500, 'Internal Server Error')])
  assert.equal(bindings.state.value, 'error')
  assert.ok(html.includes('data-test="state-error"'))
  assert.ok(text.includes('Could not load Media Nodes'))
  assert.ok(text.includes('HTTP 500: Internal Server Error'))
  assert.ok(html.includes('data-test="retry"'))
  assert.ok(!text.includes('No Media Nodes registered'))
  assert.ok(!html.includes('data-test="state-empty"'))
})

test('an empty list is the empty state and explains playback is unavailable', async () => {
  const { html, text, bindings } = await renderPage([[]])
  assert.equal(bindings.state.value, 'empty')
  assert.ok(text.includes('No Media Nodes registered'))
  assert.ok(text.includes('503'))
  assert.equal(count(html, 'data-test="node-row"'), 0)
  assert.ok(!html.includes('data-test="state-error"'))
})

test('retry after an error loads the data', async () => {
  const { bindings, requests } = await renderPage([httpError(502, 'Bad Gateway'), [node({ node_id: 'a' })]], 2)
  assert.equal(requests.length, 2)
  assert.equal(bindings.state.value, 'populated')
  assert.equal(bindings.loadError.value, null)
})

test('a refresh failure keeps the last good data and shows a banner', async () => {
  const { html, text, bindings } = await renderPage([[node({ node_id: 'a' })], httpError(503, 'down')], 2)
  assert.equal(bindings.state.value, 'populated')
  assert.equal(count(html, 'data-test="node-row"'), 1)
  assert.ok(html.includes('data-test="refresh-error"'))
  assert.ok(text.includes('Refresh failed'))
})

test('health comes from the backend: STALE/DEGRADED are never shown as HEALTHY', async () => {
  const nodes = [
    node({ node_id: 'stale', health_status: 'STALE', heartbeat_age_seconds: 400, routing_eligible: false,
      routing_exclusion_reasons: ['HEARTBEAT_STALE'], available_capacity: 10 }),
    node({ node_id: 'degraded', health_status: 'DEGRADED', routing_eligible: false,
      routing_exclusion_reasons: ['HEALTH_NOT_HEALTHY'] }),
  ]
  const { html, text } = await renderPage([nodes])
  const health = [...html.matchAll(/data-test="health"[^>]*>([^<]*)</g)].map(m => m[1].trim())
  assert.deepEqual(health, ['STALE', 'DEGRADED'])
  assert.ok(!health.includes('HEALTHY'))
  assert.ok(text.includes('No heartbeat within the last 90 s'))
  assert.ok(text.includes('Worker reports it is not HEALTHY'))
  assert.ok(text.includes('6m ago'))
  assert.equal(count(html, 'data-test="excluded"'), 2)
  assert.ok(text.includes('no eligible nodes'))
})

test('routing summary and per-node eligibility follow routing_eligible', async () => {
  const nodes = [
    node({ node_id: 'good' }),
    node({ node_id: 'off', enabled: false, routing_eligible: false, routing_exclusion_reasons: ['DISABLED'] }),
    node({ node_id: 'full', active_streams: 10, available_capacity: 0, routing_eligible: false,
      routing_exclusion_reasons: ['CAPACITY_FULL'] }),
  ]
  const { html, text } = await renderPage([nodes])
  assert.equal(count(html, 'data-test="node-row"'), 3)
  assert.equal(count(html, 'data-test="eligible"'), 1)
  assert.ok(text.includes('Routing: 1 of 3 nodes eligible'))
  assert.ok(text.includes('Disabled by an administrator'))
  assert.ok(text.includes('All stream slots are in use'))
  assert.ok(text.includes('1.4.0 · f6d3d6b'))
})

test('one primary add action in every state and no fictitious bootstrap command', async () => {
  for (const responses of [[httpError(500, 'x')], [[]], [[node({ node_id: 'a' })]]]) {
    const { html, text } = await renderPage(responses)
    assert.equal(count(html, 'data-test="add-node"'), 1)
    assert.equal(count(text, 'Add Media Node'), html.includes('state-empty') ? 2 : 1) // empty state mentions it in prose only
    assert.ok(!text.includes('Register Node'))
  }
  const source = read('../src/views/MediaNodes.vue')
  assert.ok(!source.includes('ENROLLMENT_TOKEN'))
  assert.ok(!source.includes('docker-compose.media-worker'))
})

test('helpers: view state, reasons and status classes', () => {
  const { viewState, reasonText, stateClass, formatAge } = libExports
  assert.equal(viewState(false, null, 0), 'loading')
  assert.equal(viewState(false, 'HTTP 500', 0), 'error')
  assert.equal(viewState(true, null, 0), 'empty')
  assert.equal(viewState(true, 'HTTP 500', 2), 'populated')
  assert.equal(reasonText('NO_HEARTBEAT'), 'Worker has never sent a heartbeat')
  assert.equal(reasonText('SOMETHING_NEW'), 'SOMETHING_NEW')
  assert.equal(stateClass('HEALTHY'), 'st-ok')
  assert.equal(stateClass('STALE'), 'st-warn')
  assert.equal(stateClass(null), 'st-unknown')
  assert.equal(formatAge(null), 'Never')
  assert.equal(formatAge(42.7), '42s ago')
})

test('reason texts cover every backend reason code', () => {
  const policy = readFileSync(fileURLToPath(new URL('../../src/telegram_stream/application/node_routing_policy.py', import.meta.url)), 'utf8')
  const codes = [...policy.matchAll(/^REASON_[A-Z_]+ = "([A-Z_]+)"/gm)].map(m => m[1])
  assert.ok(codes.length >= 8)
  for (const code of codes) assert.ok(libExports.ROUTING_REASON_TEXT[code], code)
})

test('global stylesheet no longer carries the Vite starter layout rules', () => {
  const css = read('../src/style.css').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/#app\s*\{[^}]*width\s*:/.test(css))
  assert.ok(!/#app\s*\{[^}]*border-inline/.test(css))
  assert.ok(!/#app\s*\{[^}]*text-align\s*:\s*center/.test(css))
  assert.ok(!/color-scheme:\s*light/.test(css))
  assert.ok(/color-scheme:\s*dark/.test(css))
  const main = read('../src/main.ts')
  assert.ok(main.indexOf("import './style.css'") < main.indexOf("import App from './App.vue'"))
})
