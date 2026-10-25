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
  HEALTHY: { label: 'Healthy', icon: '✓', color: 'var(--ui-success)', bg: 'var(--ui-success-bg)' },
  PASS: { label: 'Pass', icon: '✓', color: 'var(--ui-success)', bg: 'var(--ui-success-bg)' },
  DEGRADED: { label: 'Degraded', icon: '!', color: 'var(--ui-warning)', bg: 'var(--ui-warning-bg)' },
  CRITICAL: { label: 'Critical', icon: '✕', color: 'var(--ui-danger)', bg: 'var(--ui-danger-bg)' },
  FAIL: { label: 'Fail', icon: '✕', color: 'var(--ui-danger)', bg: 'var(--ui-danger-bg)' },
  UNKNOWN: { label: 'Unknown', icon: '?', color: 'var(--ui-muted)', bg: 'var(--ui-raised)' },
  STALE: { label: 'Stale', icon: '⧖', color: 'var(--ui-primary)', bg: 'var(--ui-active)' },
  DISABLED: { label: 'Optional / Disabled', icon: '—', color: 'var(--ui-muted)', bg: 'var(--ui-raised)' },
  MISSING: { label: 'Missing', icon: '∅', color: 'var(--ui-muted)', bg: 'var(--ui-raised)' },
  UNAVAILABLE: { label: 'Unavailable', icon: '⊘', color: 'var(--ui-warning)', bg: 'var(--ui-warning-bg)' },
}

export function stateMeta(state: string | null | undefined): StateMeta {
  return STATES[(state || 'UNKNOWN').toUpperCase()] || STATES.UNKNOWN
}

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'var(--ui-danger)', HIGH: 'var(--ui-warning)', MEDIUM: 'var(--ui-warning)', LOW: 'var(--ui-muted)', INFO: 'var(--ui-muted)',
}

export const TRAFFIC_STYLES: Record<string, { color: string; dash: string; width: number; label: string }> = {
  public: { color: '#0369a1', dash: '', width: 2, label: 'Public' },
  private_control: { color: 'var(--ui-primary)', dash: '6 4', width: 2, label: 'Private control (WireGuard / Docker)' },
  direct_media: { color: 'var(--ui-success)', dash: '', width: 3.5, label: 'Direct media (client → node)' },
  forbidden: { color: 'var(--ui-danger)', dash: '2 5', width: 1.5, label: 'Must NOT exist (probed)' },
}

export const LAYERS = ['external', 'edge', 'control', 'private', 'media'] as const
export const LAYER_LABELS: Record<string, string> = {
  external: 'External', edge: 'Edge / Public Frontend', control: 'Control Plane', private: 'Private / Control Plane', media: 'Media Plane',
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
      placed[n.id] = { id: n.id, x: x + col * (w + 16), y: 94 + row * (h + gapY), w, h }
    })
    const width = cols * w + (cols - 1) * 16
    bands.push({ layer, x, width })
    maxHeight = Math.max(maxHeight, 94 + rows * (h + gapY))
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

/** Route media above all cards, using the narrow gutters beside endpoint columns.
 * Four lanes stay above the first card even when 100 nodes wrap into columns. */
export function mediaEdgeRoute(a: Placed, b: Placed, index = 0) {
  const sign = b.x >= a.x ? 1 : -1
  const start = sign > 0 ? a.x + a.w : a.x
  const end = sign > 0 ? b.x : b.x + b.w
  const sy = a.y + a.h / 2, ey = b.y + b.h / 2
  const sx = start + sign * 8, ex = end - sign * 8
  const lane = 44 + (index % 4) * 10
  const d = `M ${start} ${sy} Q ${sx} ${sy}, ${sx} ${sy - 8} L ${sx} ${lane + 8} Q ${sx} ${lane}, ${sx + sign * 8} ${lane} L ${ex - sign * 8} ${lane} Q ${ex} ${lane}, ${ex} ${lane + 8} L ${ex} ${ey - 8} Q ${ex} ${ey}, ${end} ${ey}`
  return { d, mx: (sx + ex) / 2, my: lane }
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
