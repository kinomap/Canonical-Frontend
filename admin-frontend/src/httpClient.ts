import axios from 'axios'
import { csrfToken, handleSessionFailure } from './browserAuth'

axios.interceptors.request.use(config => {
  const url = new URL(config.url || '', window.location.origin)
  if (url.origin === window.location.origin && url.pathname.startsWith('/api/v1/')) {
    // A local marker must never replace the HttpOnly session credential.
    if (config.headers.get('Authorization') === 'Bearer cookie-session') config.headers.delete('Authorization')
    config.headers.set('X-Session-Mode', 'cookie')
    if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase()) && csrfToken()) config.headers.set('X-CSRF-Token', csrfToken())
    config.withCredentials = true
  }
  return config
})
axios.interceptors.response.use(response => response, error => {
  if (error.config?.url) handleSessionFailure(error.response?.status || 0, error.config.url)
  // Never retry mutations/uploads automatically after an authentication failure.
  return Promise.reject(error)
})
