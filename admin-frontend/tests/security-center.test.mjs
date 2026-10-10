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

const lib = {}
vm.runInNewContext(toCjs(read('../src/lib/securityView.ts')), { exports: lib, require })

function compileSfc(rel, id) {
  const { descriptor } = parse(read(rel))
  const script = compileScript(descriptor, { id })
  const template = compileTemplate({ source: descriptor.template.content, filename: rel, id,
    compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
  return { scriptJs: toCjs(script.content), templateJs: toCjs(template.code) }
}

const view = compileSfc('../src/views/SecurityCenter.vue', 'security-center-test')
const topo = compileSfc('../src/components/SecurityTopology.vue', 'security-topology-test')
const stub = (name) => ({ __esModule: true, default: { name, render: () => null } })

function instantiate({ scriptJs, templateJs }, routes, extra = {}) {
  const requests = []
  const axios = {
    get: async (url, cfg) => {
      requests.push({ url, auth: cfg?.headers?.Authorization })
      const r = routes[url.replace('/api/v1/admin/security/', '')]
      if (r instanceof Error) throw r
      return { data: r }
    },
    post: async (url) => { requests.push({ url, method: 'POST' }); return { data: { accepted: true } } },
  }
  const sandboxRequire = (name) => {
    if (name === 'vue') return vue
    if (name === 'axios') return { __esModule: true, default: axios }
    if (name === '../lib/securityView') return lib
    if (name.endsWith('SecurityTopology.vue')) return extra.topology || stub('SecurityTopology')
    return require(name)
  }
  const sandbox = {
    exports: {}, require: sandboxRequire,
    localStorage: { getItem: () => 'tok-123' },
    window: { setInterval: () => 1, clearInterval: () => {}, prompt: () => '' },
  }
  vm.runInNewContext(scriptJs, sandbox)
  const tpl = { exports: {} }
  vm.runInNewContext(templateJs, { exports: tpl.exports, require: sandboxRequire })
  return { base: sandbox.exports.default, render: tpl.exports.render, requests }
}

async function renderView(routes, after) {
  const { base, render, requests } = instantiate(view, routes)
  let b
  const app = vue.createSSRApp({ ...base, async setup(p, c) { b = base.setup(p, c); await b.load(); if (after) await after(b); return b }, render })
  const warnings = []
  app.config.warnHandler = (m) => warnings.push(m)
  const html = await renderToString(app)
  const unexpected = warnings.filter((w) => !/(onMounted|onUnmounted) is called/.test(w))
  assert.deepEqual(unexpected, [], unexpected.join(' | '))
  return { html, text: html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), requests }
}

const src = (over) => ({ source: 'host', check_status: 'OK', observed_at: '2026-10-10T20:00:00Z', data_age_seconds: 30,
  max_age_seconds: 600, freshness: 'FRESH', error_reason: null, ...over })
const routes = (over = {}) => ({
  overview: { generated_at: '2026-10-10T20:00:00Z', policy_version: '2026-10-10.1', run: { running: false, progress: [] },
    summary: { overall: 'DEGRADED', checks: { PASS: 10, FAIL: 2, UNKNOWN: 3 },
      findings_by_severity: { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 0 } },
    sources: [src(), src({ source: 'aws', check_status: 'NOT_CONFIGURED', freshness: 'MISSING', data_age_seconds: null })] },
  topology: { nodes: [{ id: 'backend', label: 'Backend', type: 'backend', layer: 'control', actual_state: 'HEALTHY', sources: [] }], edges: [] },
  exposure: { items: [
    { host: 'control-plane', role: 'control_plane', proto: 'tcp', port: 8000, listening: { value: false, scopes: [] },
      exposed: { value: false }, reachable: { value: 'NOT_REACHABLE' }, expected: { policy: 'private', value: 'YES' }, last_verified: {} },
    { host: 'control-plane', role: 'control_plane', proto: 'tcp', port: 5432, listening: { value: true, scopes: ['wildcard'] },
      exposed: { value: true }, reachable: { value: 'REACHABLE' }, expected: { policy: 'private', value: 'NO' }, last_verified: {} }] },
  checks: { items: [{ id: 'SC-003', version: 1, title: 'Backend private', result: 'PASS', reason: 'ok', last_verified: null }] },
  findings: { items: [{ id: 'SCF-0123456789ab', severity: 'HIGH', status: 'OPEN', title: 'WireGuard too wide', target: 'wg',
    check_id: 'SC-006', evidence_summary: 'peer 0.0.0.0/0', impact: 'x', remediation: 'y', sources: ['wireguard'], evidence: {} }] },
  history: { total: 1, limit: 50, offset: 0, items: [{ id: '1', created_at: '2026-10-10T20:00:00Z', kind: 'state_change',
    target: 'backend', from_state: 'HEALTHY', to_state: 'DEGRADED', summary: 'Component backend: HEALTHY → DEGRADED' }] },
  run: { running: false, progress: [] },
  ...over,
})

test('state meta renders text + icon + colour for every state (not colour only)', () => {
  for (const s of ['HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN', 'STALE', 'MISSING', 'UNAVAILABLE', 'PASS', 'FAIL']) {
    const m = lib.stateMeta(s)
    assert.ok(m.label && m.icon && m.color, s)
  }
  assert.equal(lib.stateMeta('nonsense').label, 'Unknown')
})

test('layout scales from one to 100 media nodes without overlaps', () => {
  for (const count of [1, 100]) {
    const nodes = [{ id: 'internet', layer: 'external' }, { id: 'backend', layer: 'control' },
      ...Array.from({ length: count }, (_, i) => ({ id: `node:node-${i}`, layer: 'media' }))]
    const { placed, width, height } = lib.layoutTopology(nodes)
    const boxes = Object.values(placed)
    assert.equal(boxes.length, nodes.length)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`)
    }
    assert.ok(width > 0 && height > 0 && height < 1000, 'tall bands wrap into columns')
  }
})

test('root-cause highlight includes dependencies and links', () => {
  const nodes = [{ id: 'n', root_cause: ['wg_controller'] }, { id: 'wg_controller' }]
  const edges = [{ id: 'e1', source: 'wg_controller', target: 'n' }]
  const s = lib.highlightSet('n', nodes, edges)
  assert.ok(s.has('n') && s.has('wg_controller') && s.has('e1'))
})

test('Security Center page renders overview, partial-evidence banner and admin-authenticated requests', async () => {
  const { text, html, requests } = await renderView(routes())
  assert.match(text, /Overall: Degraded/)
  assert.match(text, /Partial evidence: 1 source/)
  assert.match(text, /10 pass/)
  assert.match(html, /data-test="tab-History"/)
  assert.ok(requests.every((r) => r.method === 'POST' || r.auth === 'Bearer tok-123'))
  assert.ok(requests.some((r) => r.url.endsWith('/findings')))
})

test('Exposure and Findings tabs show policy violations and triage controls', async () => {
  const exp = await renderView(routes(), async (b) => { b.setTab('Exposure') })
  assert.match(exp.text, /VIOLATES policy/)
  assert.match(exp.text, /matches policy/)
  const fnd = await renderView(routes(), async (b) => { b.setTab('Findings') })
  assert.match(fnd.text, /WireGuard too wide/)
  assert.match(fnd.text, /Acknowledge/)
  assert.match(fnd.text, /SC-003/)
})

test('History tab is paginated', async () => {
  const h = await renderView(routes(), async (b) => { b.setTab('History'); await b.loadHistory() })
  assert.match(h.text, /HEALTHY → DEGRADED/)
  assert.match(h.text, /1–1 of 1/)
})

test('API failure shows an explicit error instead of a healthy-looking page', async () => {
  const err = Object.assign(new Error('Request failed'), { response: { status: 403, data: { detail: 'Admin access required' } } })
  const { text } = await renderView(routes({ overview: err }))
  assert.match(text, /Security data unavailable: Admin access required/)
  assert.doesNotMatch(text, /Overall:/)
})

test('topology component renders nodes with state text and traffic legend', async () => {
  const { base, render } = instantiate(topo, {})
  const nodes = [{ id: 'internet', label: 'Internet', layer: 'external', actual_state: 'UNKNOWN' },
    { id: 'backend', label: 'Backend', layer: 'control', actual_state: 'HEALTHY' },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `node:n${i}`, label: `n${i}`, layer: 'media', actual_state: i ? 'HEALTHY' : 'CRITICAL', root_cause: [] }))]
  const edges = [{ id: 'e', source: 'internet', target: 'node:n0', traffic: 'direct_media', protocol: 'HTTPS', port: '443/tcp', actual_state: 'CRITICAL' }]
  const app = vue.createSSRApp({ ...base, render }, { nodes, edges, selectedId: 'node:n0' })
  const html = await renderToString(app)
  assert.match(html, /Critical/)
  assert.match(html, /Direct media/)
  assert.equal(html.split('class="node').length - 1 >= 32, true)
})
