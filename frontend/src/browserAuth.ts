// Browser sessions are HttpOnly host-only cookies. Stored marker is NOT a credential.
const marker = 'cookie-session'
for (const key of ['admin_token', 'tg_stream_access_token']) {
  const old = localStorage.getItem(key)
  if (old && old !== marker) localStorage.removeItem(key)
}
export function csrfToken(): string {
  return document.cookie.split('; ').find(x => x.startsWith('kinosota_csrf='))?.slice('kinosota_csrf='.length) || ''
}
const nativeFetch = window.fetch.bind(window)
let renewing: Promise<boolean> | null = null
export function renewBrowserSession(): Promise<boolean> {
  if (!renewing) renewing = nativeFetch('/api/v1/auth/refresh', {
    method:'POST', credentials:'same-origin', headers:{'X-Session-Mode':'cookie','X-CSRF-Token':csrfToken()}
  }).then(r => r.ok).catch(() => false).finally(() => {renewing=null})
  return renewing
}
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) return nativeFetch(input, init)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((v,k) => headers.set(k,v))
  if (headers.get('Authorization') === `Bearer ${marker}`) headers.delete('Authorization')
  headers.set('X-Session-Mode', 'cookie')
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!['GET','HEAD','OPTIONS'].includes(method) && csrfToken()) headers.set('X-CSRF-Token', csrfToken())
  const options = {...init, credentials:'same-origin' as RequestCredentials, headers}
  // Clone before consuming a Request body so a single retry remains safe.
  const retryInput = input instanceof Request ? input.clone() : input
  let response = await nativeFetch(input, options)
  const authAction = /^\/api\/v1\/auth\/(login|register|refresh|mfa|social)(?:\/|$)/.test(url.pathname)
  const signedIn = localStorage.getItem('tg_stream_access_token') === marker
  if (response.status === 401 && signedIn && !authAction) {
    if (await renewBrowserSession()) {
      if (!['GET','HEAD','OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken())
      response = await nativeFetch(retryInput, options)
    }
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'))
  }
  return response
}
