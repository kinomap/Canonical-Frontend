import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
const require = createRequire(import.meta.url), vue = require('vue')
const source = readFileSync(new URL('../src/components/ServiceVersion.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'service-version-test' })
const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const node = { target: 'node-1', name: 'Node 1', current_version: '1.0.0', current_error: null, update_available: true, latest_installed: false, update_allowed: true, job: null }
function setup() {
 const events = []
 const axios = { get: async () => ({ data: { services: {} } }), post: async () => ({ data: {} }), put: async () => ({ data: {} }) }
 const sandbox = { exports: {}, require: n => n === 'vue' ? { ...vue, onMounted: () => {}, onBeforeUnmount: () => {} } : { default: axios, __esModule: true }, localStorage: { getItem: () => 'synthetic-admin' }, setTimeout, clearTimeout }
 vm.runInNewContext(compiled, sandbox)
 const state = sandbox.exports.default.setup({ service: 'torrserver', target: 'node-1' }, { expose: () => {}, emit: (name, ...args) => events.push([name, ...args]) })
 // The job as the backend reports it; the watcher that remembers running jobs settles on a tick.
 const show = async (job) => { state.item.value = { ...node, job: job && { job_id: 'job-1', from_version: '1.0.0', to_version: '1.1.0', error_code: null, phase: null, rolled_back_to: null, late_report: false, created_at: null, finished_at: null, ...job } }; await tick() }
 const bar = () => state.progress.value && { ...state.progress.value }
 return { state, show, bar, events }
}

test('update progress: each phase of the job is a step, 10 % accepted … 95 % health check', async () => {
 const { show, bar } = setup()
 assert.equal(bar(), null)
 await show({ state: 'queued' })
 assert.deepEqual(bar(), { percent: 10, label: 'Запрос принят', kind: 'run' })
 for (const [phase, percent, label] of [[null, 20, 'Подготовка'], ['claimed', 20, 'Подготовка'], ['precheck', 35, 'Проверка состояния'], ['pull', 55, 'Загрузка образа'], ['backup', 70, 'Резервная копия'], ['start', 85, 'Перезапуск'], ['health', 95, 'Проверка работоспособности'], ['a-new-phase', 20, 'Подготовка']]) {
  await show({ state: 'running', phase })
  assert.deepEqual(bar(), { percent, label, kind: 'run' }, String(phase))
 }
 await show({ state: 'running', phase: 'rollback' })
 assert.deepEqual(bar(), { percent: 90, label: 'Откат на прежнюю версию', kind: 'warn' })
})

test('a job watched while running ends on a full bar; finished jobs found at load show none', async () => {
 const done = new Date().toISOString()
 const fresh = setup()
 await fresh.show({ state: 'succeeded', finished_at: done })
 assert.equal(fresh.bar(), null)
 assert.deepEqual(fresh.events, [], 'a finished job found at load is not reported as a new update')
 const { show, bar, events } = setup()
 await show({ state: 'running', phase: 'health' })
 await show({ state: 'succeeded', finished_at: done })
 assert.deepEqual(bar(), { percent: 100, label: 'Завершено', kind: 'ok' })
 assert.deepEqual(events.filter(([name]) => name === 'busy-change').map(([, busy]) => busy), [true, false], 'the host card learns when the update starts and ends')
 assert.deepEqual(events.filter(([name]) => name === 'updated').map(([, j]) => j.state), ['succeeded'], 'a finished watched job is reported once')
 for (const state of ['failed', 'rolled_back']) {
  await show({ state, error_code: 'health_failed', finished_at: done })
  assert.equal(bar(), null, state)
 }
 await show(null)
 assert.equal(bar(), null)
})

test('the bar is an accessible progressbar with a percentage, animated only without reduced motion', () => {
 const template = descriptor.template.content
 assert.match(template, /v-if="progress"[^>]*role="progressbar"[^>]*aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress\.percent"/)
 assert.match(template, /class="sv-progress-bar" :style="\{ width: `\$\{progress\.percent\}%` \}"/)
 assert.match(template, /\{\{ progress\.label \}\}/)
 assert.match(template, /\{\{ progress\.percent \}\}%/)
 const css = descriptor.styles.map(s => s.content).join('\n')
 assert.match(css, /\.sv-progress-bar\{[^}]*transition:width \.6s ease/)
 assert.match(css, /@keyframes sv-shine/)
 assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.sv-progress-bar\{transition:none\}\.sv-progress-bar:after\{animation:none\}\}/)
})
