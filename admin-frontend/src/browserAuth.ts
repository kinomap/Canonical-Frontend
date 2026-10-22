// Browser sessions are HttpOnly host-only cookies. Stored marker is NOT a credential.
const marker = 'cookie-session'
for (const key of ['admin_token', 'tg_stream_access_token']) {
  const old = localStorage.getItem(key)
  if (old && old !== marker) localStorage.removeItem(key)
}
export function csrfToken(): string {
  return document.cookie.split('; ').find(x => x.startsWith('kinosota_csrf='))?.slice('kinosota_csrf='.length) || ''
}
export function handleSessionFailure(status: number, input: string): void {
  const url = new URL(input, window.location.origin)
  if (status !== 401 || url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) return
  // Incorrect login credentials are not an expired protected session.
  if (/^\/api\/v1\/auth\/(login|register|mfa)(\/|$)/.test(url.pathname)) return
  localStorage.removeItem('admin_token')
  window.dispatchEvent(new Event('admin-session-expired'))
}
const nativeFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) return nativeFetch(input, init)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((v,k) => headers.set(k,v))
  if (headers.get('Authorization') === `Bearer ${marker}`) headers.delete('Authorization')
  headers.set('X-Session-Mode', 'cookie')
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!['GET','HEAD','OPTIONS'].includes(method) && csrfToken()) headers.set('X-CSRF-Token', csrfToken())
  const response = await nativeFetch(input, {...init, credentials:'same-origin', headers})
  handleSessionFailure(response.status, url.href)
  return response
}
