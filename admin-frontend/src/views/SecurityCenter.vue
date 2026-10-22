<template>
  <div class="sc-page">
    <header class="sc-header">
      <div>
        <h1 class="sc-title">Security Center</h1>
        <p class="sc-sub">
          Evidence-based posture of the KINOSOTA platform · policy {{ overview?.policy_version || '—' }}
          · generated {{ fmtTime(overview?.generated_at) }}
        </p>
      </div>
      <div class="sc-actions">
        <span v-if="overview" class="state-pill" data-test="overall"
              :style="{ color: stateMeta(overall).color, background: stateMeta(overall).bg }">
          {{ stateMeta(overall).icon }} Overall: {{ stateMeta(overall).label }}
        </span>
        <button class="sc-btn" :disabled="running || runBusy" data-test="run-scan" @click="runScan">
          {{ running ? 'Scanning…' : 'Run scan now' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="sc-error" role="alert">{{ error }}</div>
    <div v-if="runMessage" class="sc-info">{{ runMessage }}</div>
    <div v-if="running && run?.progress?.length" class="sc-progress" data-test="progress">
      <span v-for="p in run.progress" :key="p.source" class="prog-item" :class="p.state">
        {{ p.state === 'running' ? '…' : (p.check_status === 'OK' ? '✓' : '!') }} {{ p.source }}
      </span>
    </div>

    <div v-if="loading && !overview" class="sc-loading">Loading security evidence…</div>

    <template v-if="overview">
      <div v-if="degradedSources.length" class="sc-warn" data-test="partial">
        Partial evidence: {{ degradedSources.length }} source(s) are missing, stale or failing — affected
        components and checks are shown as UNKNOWN/STALE, never as healthy.
      </div>

      <section class="sc-cards">
        <div class="card">
          <div class="card-label">Checks</div>
          <div class="card-row">
            <span :style="{ color: stateMeta('PASS').color }">✓ {{ overview.summary.checks.PASS || 0 }} pass</span>
            <span :style="{ color: stateMeta('FAIL').color }">✕ {{ overview.summary.checks.FAIL || 0 }} fail</span>
            <span :style="{ color: stateMeta('UNKNOWN').color }">? {{ overview.summary.checks.UNKNOWN || 0 }} unknown</span>
          </div>
        </div>
        <div class="card">
          <div class="card-label">Findings (current)</div>
          <div class="card-row">
            <span v-for="(n, sev) in overview.summary.findings_by_severity" :key="sev" :style="{ color: SEVERITY_COLORS[sev] }">
              {{ sev }} {{ n }}
            </span>
          </div>
        </div>
        <div class="card card-wide">
          <div class="card-label">Evidence sources</div>
          <div class="src-list">
            <span v-for="s in overview.sources" :key="s.source" class="src" :title="s.error_reason || ''"
                  :style="{ color: srcColor(s), borderColor: srcColor(s) }">
              {{ s.freshness === 'FRESH' && s.check_status !== 'ERROR' ? '✓' : (s.freshness === 'STALE' ? '⧖' : '?') }}
              {{ s.source }} · {{ s.check_status }} · {{ formatAge(s.data_age_seconds) }}
            </span>
          </div>
        </div>
      </section>

      <nav class="sc-tabs" role="tablist">
        <button v-for="t in TABS" :key="t" role="tab" class="tab" :class="{ active: tab === t }"
                :aria-selected="tab === t" :data-test="'tab-' + t" @click="setTab(t)">{{ t }}</button>
      </nav>

      <!-- Topology -->
      <section v-if="tab === 'Topology'" class="sc-topo">
        <SecurityTopology :nodes="topology?.nodes || []" :edges="topology?.edges || []"
                          :selected-id="selected?.item.id || null" @select="selected = $event" />
        <aside v-if="selected" class="detail" data-test="detail">
          <div class="detail-head">
            <strong>{{ selected.kind === 'node' ? (selected.item as any).label : (selected.item as any).purpose }}</strong>
            <button class="x" @click="selected = null">✕</button>
          </div>
          <p><span class="state-pill" :style="{ color: stateMeta(selected.item.actual_state).color, background: stateMeta(selected.item.actual_state).bg }">
            {{ stateMeta(selected.item.actual_state).icon }} {{ selected.item.actual_state }}</span></p>
          <p v-if="selected.kind === 'edge'" class="muted">
            {{ (selected.item as any).protocol }} {{ (selected.item as any).port }} · {{ (selected.item as any).traffic }}
          </p>
          <p><b>Expected:</b> {{ selected.item.expected_state }}</p>
          <p v-if="selected.item.reason"><b>Reason:</b> {{ selected.item.reason }}</p>
          <p v-if="(selected.item as any).root_cause?.length"><b>Root cause:</b> {{ (selected.item as any).root_cause.join(', ') }}</p>
          <p><b>Last verified:</b> {{ fmtTime(selected.item.last_verified) }}</p>
          <div><b>Sources</b>
            <ul class="src-ul">
              <li v-for="s in selected.item.sources || []" :key="s.source" :style="{ color: srcColor(s) }">
                {{ s.source }} — {{ s.check_status }}/{{ s.freshness }} ({{ formatAge(s.data_age_seconds) }} old,
                max {{ formatAge(s.max_age_seconds) }}){{ s.error_reason ? ' — ' + s.error_reason : '' }}
              </li>
            </ul>
          </div>
          <details v-if="(selected.item as any).details"><summary>Evidence details</summary>
            <pre class="json">{{ JSON.stringify((selected.item as any).details, null, 2) }}</pre>
          </details>
        </aside>
      </section>

      <!-- Exposure -->
      <section v-if="tab === 'Exposure'">
        <label class="chk"><input v-model="hideLoopback" type="checkbox" /> Hide loopback-only listeners</label>
        <div class="table-wrap">
          <table class="tbl" data-test="exposure-table">
            <thead><tr><th>Host</th><th>Port</th><th>Listening</th><th>Exposed</th><th>Reachable (external)</th><th>Policy</th><th>Verified</th></tr></thead>
            <tbody>
              <tr v-for="e in exposureRows" :key="e.host + e.proto + e.port" :class="expClass(e)">
                <td>{{ e.host }}</td>
                <td>{{ e.port }}/{{ e.proto }}</td>
                <td>{{ tri(e.listening?.value) }} <span class="muted">{{ (e.listening?.scopes || []).join(', ') || e.listening?.note || '' }}</span></td>
                <td>{{ tri(e.exposed?.value) }}</td>
                <td>{{ e.reachable?.value ?? '—' }}</td>
                <td>{{ e.expected?.policy }} — <b>{{ expLabel(e.expected?.value) }}</b></td>
                <td class="muted">{{ fmtTime(e.last_verified?.external || e.last_verified?.host || e.last_verified?.probe) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Findings -->
      <section v-if="tab === 'Findings'">
        <div class="filters">
          <select v-model="fStatus" data-test="f-status"><option value="">All open/unknown</option>
            <option v-for="s in ['OPEN','UNKNOWN','ACKNOWLEDGED','FALSE_POSITIVE','RESOLVED']" :key="s" :value="s">{{ s }}</option></select>
          <select v-model="fSeverity"><option value="">All severities</option>
            <option v-for="s in Object.keys(SEVERITY_COLORS)" :key="s" :value="s">{{ s }}</option></select>
          <button class="sc-btn ghost" @click="loadFindings">Apply</button>
        </div>
        <p v-if="!findings.length" class="muted">No findings for this filter.</p>
        <article v-for="f in findings" :key="f.id" class="finding" data-test="finding"
                 :style="{ borderLeftColor: SEVERITY_COLORS[f.severity] }">
          <div class="finding-head">
            <span class="sev" :style="{ color: SEVERITY_COLORS[f.severity] }">{{ f.severity }}</span>
            <span class="status">{{ f.status }}</span>
            <strong>{{ f.title }}</strong>
            <span class="muted">· {{ f.target }} · {{ f.check_id }} · {{ f.id }}</span>
          </div>
          <p>{{ f.evidence_summary }}</p>
          <p class="muted"><b>Why this severity:</b> {{ f.severity_reason || '—' }} · <b>Impact:</b> {{ f.impact }}</p>
          <p><b>Remediation:</b> {{ f.remediation }}</p>
          <p class="muted">Sources: {{ (f.sources || []).join(', ') }} · first seen {{ fmtTime(f.first_seen_at) }}
            · last verified {{ fmtTime(f.last_verified_at) }}<span v-if="f.status_note"> · note: {{ f.status_note }}</span></p>
          <details><summary>Evidence</summary><pre class="json">{{ JSON.stringify(f.evidence, null, 2) }}</pre></details>
          <div v-if="f.status !== 'RESOLVED'" class="triage">
            <button v-if="f.status !== 'ACKNOWLEDGED'" class="sc-btn ghost" @click="triage(f, 'ACKNOWLEDGED')">Acknowledge</button>
            <button v-if="f.status !== 'FALSE_POSITIVE'" class="sc-btn ghost" @click="triage(f, 'FALSE_POSITIVE')">False positive</button>
            <button v-if="f.admin_status" class="sc-btn ghost" @click="triage(f, 'OPEN')">Reopen</button>
          </div>
        </article>

        <h2 class="sc-h2">Security checks</h2>
        <div class="table-wrap">
          <table class="tbl" data-test="checks-table">
            <thead><tr><th>ID</th><th>Check</th><th>Result</th><th>Reason</th><th>Verified</th></tr></thead>
            <tbody>
              <tr v-for="c in checks" :key="c.id">
                <td>{{ c.id }} <span class="muted">v{{ c.version }}</span></td>
                <td>{{ c.title }}</td>
                <td :style="{ color: stateMeta(c.result).color }">{{ stateMeta(c.result).icon }} {{ c.result }}</td>
                <td>{{ c.reason }}</td>
                <td class="muted">{{ fmtTime(c.last_verified) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- History -->
      <section v-if="tab === 'History'">
        <div class="table-wrap">
          <table class="tbl" data-test="history-table">
            <thead><tr><th>Time</th><th>Event</th><th>Target</th><th>Change</th><th>Summary</th></tr></thead>
            <tbody>
              <tr v-for="h in history.items" :key="h.id">
                <td class="muted">{{ fmtTime(h.created_at) }}</td><td>{{ h.kind }}</td><td>{{ h.target }}</td>
                <td>{{ h.from_state || '—' }} → {{ h.to_state || '—' }}</td><td>{{ h.summary }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <button class="sc-btn ghost" :disabled="hOffset === 0" @click="page(-1)">← Newer</button>
          <span class="muted">{{ hOffset + 1 }}–{{ Math.min(hOffset + H_LIMIT, history.total) }} of {{ history.total }}</span>
          <button class="sc-btn ghost" :disabled="hOffset + H_LIMIT >= history.total" @click="page(1)">Older →</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'
import SecurityTopology from '../components/SecurityTopology.vue'
import { formatAge, SEVERITY_COLORS, stateMeta, type SourceMeta, type TopoEdge, type TopoNode } from '../lib/securityView'

const TABS = ['Topology', 'Exposure', 'Findings', 'History'] as const
const H_LIMIT = 50
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const overview = ref<any>(null)
const topology = ref<{ nodes: TopoNode[]; edges: TopoEdge[] } | null>(null)
const exposure = ref<any[]>([])
const checks = ref<any[]>([])
const findings = ref<any[]>([])
const history = ref<{ total: number; items: any[] }>({ total: 0, items: [] })
const run = ref<any>(null)
const tab = ref<(typeof TABS)[number]>('Topology')
const selected = ref<{ kind: 'node' | 'edge'; item: TopoNode | TopoEdge } | null>(null)
const loading = ref(true)
const error = ref('')
const runMessage = ref('')
const runBusy = ref(false)
const hideLoopback = ref(true)
const fStatus = ref('')
const fSeverity = ref('')
const hOffset = ref(0)
let refreshTimer: number | null = null
let runTimer: number | null = null

const overall = computed(() => overview.value?.summary?.overall || 'UNKNOWN')
const running = computed(() => !!run.value?.running)
const degradedSources = computed(() => (overview.value?.sources || []).filter(
  (s: SourceMeta) => s.freshness !== 'FRESH' || s.check_status === 'ERROR'))
const exposureRows = computed(() => exposure.value.filter(
  (e) => !hideLoopback.value || !(e.listening?.scopes?.length === 1 && e.listening.scopes[0] === 'loopback')))

const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—')
const tri = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : '—')
const srcColor = (s: SourceMeta) => (s.freshness === 'FRESH' && s.check_status !== 'ERROR'
  ? stateMeta('HEALTHY').color : s.freshness === 'STALE' ? stateMeta('STALE').color : stateMeta('UNKNOWN').color)
// expected.value: YES = matches policy, NO = violates policy, UNVERIFIED / NOT_IN_POLICY otherwise
const expClass = (e: any) => (e.expected?.value === 'NO' ? 'row-bad' : e.expected?.value === 'YES' ? 'row-ok' : '')
const expLabel = (v?: string) => ({ YES: '✓ matches policy', NO: '✕ VIOLATES policy', UNVERIFIED: '? unverified',
  NOT_IN_POLICY: '∅ not in policy' } as Record<string, string>)[v || ''] || (v || '—')

const errText = (e: any) => e?.response?.data?.detail || e?.message || 'request failed'

async function loadFindings() {
  const params: Record<string, string> = {}
  if (fStatus.value) params.status = fStatus.value
  if (fSeverity.value) params.severity = fSeverity.value
  const r = await axios.get('/api/v1/admin/security/findings', { ...auth(), params })
  findings.value = r.data.items
}

async function loadHistory() {
  const r = await axios.get('/api/v1/admin/security/history', { ...auth(), params: { limit: H_LIMIT, offset: hOffset.value } })
  history.value = r.data
}

async function load() {
  try {
    const [o, t, e, c] = await Promise.all([
      axios.get('/api/v1/admin/security/overview', auth()),
      axios.get('/api/v1/admin/security/topology', auth()),
      axios.get('/api/v1/admin/security/exposure', auth()),
      axios.get('/api/v1/admin/security/checks', auth()),
    ])
    overview.value = o.data
    topology.value = { nodes: t.data.nodes, edges: t.data.edges }
    exposure.value = e.data.items
    checks.value = c.data.items
    run.value = o.data.run
    await loadFindings()
    if (tab.value === 'History') await loadHistory()
    error.value = ''
  } catch (e: any) {
    error.value = `Security data unavailable: ${errText(e)}`
  } finally {
    loading.value = false
  }
}

async function pollRun() {
  try {
    const r = await axios.get('/api/v1/admin/security/run', auth())
    run.value = r.data
    if (!r.data.running) {
      stopRunPoll()
      runMessage.value = r.data.last_error ? `Scan finished with error: ${r.data.last_error}` : 'Scan finished.'
      await load()
    }
  } catch { stopRunPoll() }
}
function stopRunPoll() { if (runTimer) { window.clearInterval(runTimer); runTimer = null } }

async function runScan() {
  runBusy.value = true
  runMessage.value = ''
  try {
    await axios.post('/api/v1/admin/security/run', {}, auth())
    run.value = { ...(run.value || {}), running: true, progress: [] }
    runMessage.value = 'Scan started…'
    stopRunPoll()
    runTimer = window.setInterval(pollRun, 2000)
  } catch (e: any) {
    runMessage.value = e?.response?.status === 429
      ? `Please wait ${e.response.headers?.['retry-after'] || 'a few'} s before the next manual scan.`
      : `Scan not started: ${errText(e)}`
  } finally {
    runBusy.value = false
  }
}

async function triage(f: any, status: string) {
  const note = status === 'OPEN' ? null : window.prompt(`Note for ${status.toLowerCase().replace('_', ' ')} (optional)`) 
  try {
    await axios.post(`/api/v1/admin/security/findings/${f.id}/status`, { status, note: note || null }, auth())
    await loadFindings()
  } catch (e: any) { error.value = `Could not update finding: ${errText(e)}` }
}

function setTab(t: (typeof TABS)[number]) {
  tab.value = t
  if (t === 'History') loadHistory().catch((e) => { error.value = errText(e) })
}
function page(d: number) { hOffset.value = Math.max(0, hOffset.value + d * H_LIMIT); loadHistory() }

onMounted(() => { load(); refreshTimer = window.setInterval(load, 30000) })
onUnmounted(() => { if (refreshTimer) window.clearInterval(refreshTimer); stopRunPoll() })
</script>

<style scoped>
.sc-page { padding: 24px; color: var(--ui-secondary); max-width: 1500px; }
.sc-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.sc-title { color: var(--ui-text); font-size: 24px; margin: 0; }
.sc-sub { color: var(--ui-link); margin: 4px 0 0; font-size: 13px; }
.sc-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.state-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 13px; }
.sc-btn { background: var(--ui-primary); color: var(--ui-on-primary); border: 0; border-radius: var(--ui-radius); padding: 8px 14px; font-weight: 600; cursor: pointer; }
.sc-btn:disabled { opacity: .5; cursor: default; }
.sc-btn.ghost { background: transparent; color: var(--ui-link); border: 1px solid var(--ui-control); padding: 5px 10px; }
.sc-error { background: rgba(239,68,68,.12); color: var(--ui-danger); padding: 10px 12px; border-radius: var(--ui-radius); margin-bottom: 10px; }
.sc-info { color: var(--ui-link); margin-bottom: 10px; }
.sc-warn { background: rgba(245,158,11,.1); color: var(--ui-warning); padding: 10px 12px; border-radius: var(--ui-radius); margin-bottom: 12px; font-size: 13px; }
.sc-loading { color: var(--ui-link); }
.sc-progress { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; font-size: 12px; }
.prog-item { padding: 2px 8px; border-radius: var(--ui-radius); background: var(--ui-raised); }
.sc-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
.card { background: var(--ui-bg); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); padding: 12px 14px; }
.card-wide { grid-column: span 2; }
.card-label { color: var(--ui-link); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
.card-row { display: flex; gap: 14px; flex-wrap: wrap; font-weight: 600; }
.src-list { display: flex; flex-wrap: wrap; gap: 6px; }
.src { border: 1px solid; border-radius: var(--ui-radius); padding: 2px 8px; font-size: 12px; }
.sc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--ui-control); margin-bottom: 14px; overflow-x: auto; }
.tab { background: none; border: 0; color: var(--ui-link); padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 14px; }
.tab.active { color: var(--ui-text); border-bottom-color: var(--ui-control); }
.sc-topo { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; }
.sc-topo:not(:has(.detail)) { grid-template-columns: minmax(0, 1fr); }
.detail { background: var(--ui-bg); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); padding: 12px; font-size: 13px; overflow: auto; max-height: 75vh; }
.detail-head { display: flex; justify-content: space-between; color: var(--ui-text); margin-bottom: 6px; }
.x { background: none; border: 0; color: var(--ui-link); cursor: pointer; }
.src-ul { padding-left: 16px; margin: 4px 0; }
.json { background: var(--ui-bg); padding: 8px; border-radius: var(--ui-radius); font-size: 11.5px; overflow: auto; max-height: 300px; white-space: pre-wrap; word-break: break-all; }
.muted { color: var(--ui-link); }
.table-wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: var(--ui-link); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--ui-control); white-space: nowrap; }
.tbl td { padding: 6px 8px; border-bottom: 1px solid var(--ui-border); vertical-align: top; }
.row-bad td { background: rgba(239,68,68,.08); }
.chk { display: inline-flex; gap: 6px; margin-bottom: 8px; font-size: 13px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.filters select { background: var(--ui-bg); color: var(--ui-text); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); padding: 5px 8px; }
.finding { background: var(--ui-bg); border: 1px solid var(--ui-control); border-left: 4px solid; border-radius: var(--ui-radius); padding: 10px 14px; margin-bottom: 10px; font-size: 13px; }
.finding p { margin: 6px 0; }
.finding-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; color: var(--ui-text); }
.sev { font-weight: 700; }
.status { font-size: 12px; padding: 1px 6px; border-radius: 4px; background: var(--ui-raised); }
.triage { display: flex; gap: 6px; flex-wrap: wrap; }
.sc-h2 { color: var(--ui-text); font-size: 16px; margin: 20px 0 8px; }
.pager { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
@media (max-width: 900px) {
  .sc-page { padding: 14px; }
  .sc-topo { grid-template-columns: minmax(0, 1fr); }
  .card-wide { grid-column: span 1; }
}
</style>
