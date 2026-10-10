/**
 * Presentation helpers for the Media Nodes page.
 *
 * Routing eligibility and health are computed by the backend
 * (application/node_routing_policy.py — the same function the playback router
 * uses).  These helpers only translate backend fields into text; they never
 * re-derive health or eligibility on the client.
 */

export interface MediaNodeRow {
  id: string
  node_id: string
  name: string
  hostname: string | null
  public_url?: string | null
  media_endpoint?: string | null
  region?: string | null
  status: string
  health_status: string
  enabled: boolean
  active_streams: number
  routing_eligible?: boolean
  routing_exclusion_reasons?: string[]
  heartbeat_age_seconds?: number | null
  heartbeat_freshness_seconds?: number
  effective_stream_capacity?: number
  available_capacity?: number
  node_version?: string | null
  node_commit?: string | null
  deployment_status?: string | null
  last_heartbeat?: string | null
}

export type ViewState = 'loading' | 'error' | 'empty' | 'populated'

/** Mirrors REASON_DESCRIPTIONS in node_routing_policy.py. */
export const ROUTING_REASON_TEXT: Record<string, string> = {
  REMOVED: 'Node was removed',
  STATUS_NOT_ACTIVE: 'Lifecycle status is not ACTIVE',
  DISABLED: 'Disabled by an administrator',
  NO_HEARTBEAT: 'Worker has never sent a heartbeat',
  HEARTBEAT_STALE: 'No heartbeat within the freshness window',
  HEALTH_NOT_HEALTHY: 'Worker reports it is not HEALTHY',
  NO_CAPACITY_CONFIGURED: 'Stream capacity is 0',
  CAPACITY_FULL: 'All stream slots are in use',
}

export function reasonText(code: string, freshnessSeconds?: number): string {
  if (code === 'HEARTBEAT_STALE' && freshnessSeconds) {
    return `No heartbeat within the last ${freshnessSeconds} s`
  }
  return ROUTING_REASON_TEXT[code] || code
}

/**
 * Page state.  A failed request is never shown as "no nodes": until the first
 * successful load, an error is the 'error' state; after that, the last good
 * data stays on screen with a refresh-failed banner.
 */
export function viewState(loaded: boolean, error: string | null, count: number): ViewState {
  if (!loaded) {
    if (error) return 'error'
    return 'loading'
  }
  return count === 0 ? 'empty' : 'populated'
}

export function routingSummary(nodes: MediaNodeRow[]) {
  const eligible = nodes.filter(n => n.routing_eligible === true).length
  return { total: nodes.length, eligible, excluded: nodes.length - eligible }
}

const CLASS_BY_STATE: Record<string, string> = {
  HEALTHY: 'st-ok', ACTIVE: 'st-ok', ONLINE: 'st-ok',
  REGISTERING: 'st-info', REGISTERED: 'st-info', PROVISIONING: 'st-info',
  DEGRADED: 'st-warn', WARNING: 'st-warn', DRAINING: 'st-warn', DECOMMISSIONING: 'st-warn',
  STALE: 'st-warn',
  OFFLINE: 'st-off', REMOVED: 'st-off', DISABLED: 'st-off',
  UNHEALTHY: 'st-bad', CRITICAL: 'st-bad', DECOMMISSION_FAILED: 'st-bad', FAILED: 'st-bad',
  UNKNOWN: 'st-unknown',
}

export function stateClass(value: string | null | undefined): string {
  return CLASS_BY_STATE[(value || '').toUpperCase()] || 'st-unknown'
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return 'Never'
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function endpointOf(node: MediaNodeRow): string {
  return node.public_url || node.media_endpoint || node.hostname || '—'
}

export function versionOf(node: MediaNodeRow): string {
  const commit = node.node_commit ? node.node_commit.slice(0, 7) : ''
  if (node.node_version && commit) return `${node.node_version} · ${commit}`
  return node.node_version || commit || '—'
}
