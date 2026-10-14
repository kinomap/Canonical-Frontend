// Pure helpers for the Security Center views (unit-tested without a browser).

export interface TopoNode {
  id: string
  label: string
  type: string
  layer: string
  group?: string | null
  actual_state: string
  expected_state?: string
  severity?: string
  reason?: string | null
  root_cause?: string[]
  depends_on?: string[]
  last_verified?: string | null
  data_age_seconds?: number | null
  sources?: SourceMeta[]
  details?: Record<string, unknown>
}

export interface TopoEdge {
  id: string
  source: string
  target: string
  traffic: string
  protocol: string
  port: string
  purpose?: string
  expected_state?: string
  actual_state: string
  reason?: string | null
  sources?: SourceMeta[]
  last_verified?: string | null
}

export interface SourceMeta {
  source: string
  check_status: string
  observed_at: string | null
  data_age_seconds: number | null
  max_age_seconds: number
  freshness: string
  error_reason: string | null
}

export interface StateMeta { label: string; icon: string; color: string; bg: string }

const STATES: Record<string, StateMeta> = {
  HEALTHY: { label: 'Healthy', icon: '✓', color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
  PASS: { label: 'Pass', icon: '✓', color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
  DEGRADED: { label: 'Degraded', icon: '!', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  CRITICAL: { label: 'Critical', icon: '✕', color: '#ef4444', bg: 'rgba(239,68,68,.14)' },
  FAIL: { label: 'Fail', icon: '✕', color: '#ef4444', bg: 'rgba(239,68,68,.14)' },
  UNKNOWN: { label: 'Unknown', icon: '?', color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
  STALE: { label: 'Stale', icon: '⧖', color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
  DISABLED: { label: 'Optional / Disabled', icon: '—', color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
  MISSING: { label: 'Missing', icon: '∅', color: '#64748b', bg: 'rgba(100,116,139,.14)' },
  UNAVAILABLE: { label: 'Unavailable', icon: '⊘', color: '#f97316', bg: 'rgba(249,115,22,.12)' },
}

export function stateMeta(state: string | null | undefined): StateMeta {
  return STATES[(state || 'UNKNOWN').toUpperCase()] || STATES.UNKNOWN
}

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#94a3b8', INFO: '#64748b',
}

export const TRAFFIC_STYLES: Record<string, { color: string; dash: string; width: number; label: string }> = {
  public: { color: '#38bdf8', dash: '', width: 2, label: 'Public' },
  private_control: { color: '#818cf8', dash: '6 4', width: 2, label: 'Private control (WireGuard / Docker)' },
  direct_media: { color: '#34d399', dash: '', width: 3.5, label: 'Direct media (client → node)' },
  forbidden: { color: '#ef4444', dash: '2 5', width: 1.5, label: 'Must NOT exist (probed)' },
}

export const LAYERS = ['external', 'edge', 'control', 'private', 'media'] as const
export const LAYER_LABELS: Record<string, string> = {
  external: 'External', edge: 'Edge / DNS', control: 'Control Plane', private: 'Private', media: 'Media Plane',
}

export interface Placed { id: string; x: number; y: number; w: number; h: number }

/** Layered auto-layout: one band per layer, nodes wrap into extra columns when a band
 *  gets tall, so 1 or 100 Media Nodes stay readable. Deterministic (sorted by id). */
export function layoutTopology(nodes: TopoNode[], opts: { w?: number; h?: number; gapX?: number; gapY?: number; maxRows?: number } = {}) {
  const w = opts.w ?? 170, h = opts.h ?? 54, gapX = opts.gapX ?? 70, gapY = opts.gapY ?? 22
  const maxRows = opts.maxRows ?? 8
  const placed: Record<string, Placed> = {}
  const bands: { layer: string; x: number; width: number }[] = []
  let x = 20
  let maxHeight = 0
  for (const layer of LAYERS) {
    const items = nodes.filter((n) => (LAYERS as readonly string[]).includes(n.layer) ? n.layer === layer : layer === 'external')
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    if (!items.length) continue
    const cols = Math.ceil(items.length / maxRows)
    const rows = Math.min(items.length, maxRows)
    items.forEach((n, i) => {
      const col = Math.floor(i / maxRows), row = i % maxRows
      placed[n.id] = { id: n.id, x: x + col * (w + 16), y: 50 + row * (h + gapY), w, h }
    })
    const width = cols * w + (cols - 1) * 16
    bands.push({ layer, x, width })
    maxHeight = Math.max(maxHeight, 50 + rows * (h + gapY))
    x += width + gapX
  }
  return { placed, bands, width: Math.max(x, 400), height: Math.max(maxHeight + 20, 240) }
}

export function edgePath(a: Placed, b: Placed): string {
  const forward = b.x >= a.x
  const x1 = forward ? a.x + a.w : a.x, y1 = a.y + a.h / 2
  const x2 = forward ? b.x : b.x + b.w, y2 = b.y + b.h / 2
  if (Math.abs(a.x - b.x) < 1) {          // same column: arc on the right side
    const cx = a.x + a.w + 40
    return `M ${a.x + a.w} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${b.x + b.w} ${y2}`
  }
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 90) return `${Math.round(seconds)}s`
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

/** Ids to highlight when an item is selected: the item, its root causes and their links. */
export function highlightSet(selectedId: string | null, nodes: TopoNode[], edges: TopoEdge[]): Set<string> {
  const out = new Set<string>()
  if (!selectedId) return out
  out.add(selectedId)
  const n = nodes.find((x) => x.id === selectedId)
  for (const rc of n?.root_cause || []) out.add(rc)
  for (const e of edges) {
    if (e.source === selectedId || e.target === selectedId) out.add(e.id)
  }
  return out
}
