/**
 * Device-flow sign-in of the KINOSOTA TV layer (/tv/auth): the TV shows a QR code and a
 * short code, the phone approves it (DesktopAuthorizeModal -> /desktop/pairing/approve),
 * the TV polls /desktop/pairing/exchange and receives an access token. Same backend
 * flow as the KINOSOTA Player desktop app; no new endpoints.
 */
export interface PairingStart {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export type PairingExchange =
  | { status: 'pending' }
  | { status: 'authorized'; access_token: string }

export class PairingError extends Error {
  constructor(public status: number, public code: string) {
    super(code || `HTTP ${status}`)
    this.name = 'PairingError'
  }
}

/** Short code split for reading from three metres: ABCD2345 -> ABCD-2345. */
export function formatUserCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Phone address shown next to the QR code (the code is part of it: no typing on the phone). */
export function phoneAuthUrl(userCode: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const host = origin.replace(/^https?:\/\//, '')
  return `${host}/auth/desktop?code=${encodeURIComponent(userCode)}`
}

/** Polling interval in ms, clamped to the 3-10 s band the backend rate limit allows. */
export function pollDelayMs(interval: number | undefined): number {
  const seconds = typeof interval === 'number' && Number.isFinite(interval) ? interval : 5
  return Math.min(10, Math.max(3, seconds)) * 1000
}

function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const csrf = document.cookie.split('; ').find(item => item.startsWith('kinosota_csrf='))?.slice('kinosota_csrf='.length)
  return csrf ? { 'X-CSRF-Token': csrf } : {}
}

async function pairingRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/desktop/pairing/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeader() },
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new PairingError(response.status, typeof data?.detail === 'string' ? data.detail : '')
  return data as T
}

export const tvPairingApi = {
  start: () => pairingRequest<PairingStart>('start'),
  exchange: (deviceCode: string) => pairingRequest<PairingExchange>('exchange', { device_code: deviceCode }),
}
