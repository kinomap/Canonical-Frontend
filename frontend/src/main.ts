import '../../design-system/password-visibility.css'
import { installPasswordVisibility } from '../../design-system/password-visibility.js'
import '../../design-system/tokens.css'
import '../../design-system/foundation.css'
import './browserAuth'
import { createApp } from 'vue'
import App from './App.vue'
import router, { getPendingNavigation } from './router'
import { handleChunkLoadError } from './router/chunkReload'
import './style.css'
import './styles/pageFrame.css'
import './styles/showcase.css'

// Vite reports failed preloads of lazy chunks/CSS here (stale build after redeploy).
// During a route navigation the error is left to propagate to router.onError, which
// knows the navigation target and reloads that URL; otherwise reload the current URL.
window.addEventListener('vite:preloadError', (event) => {
  if (getPendingNavigation() !== null) return
  const err = (event as Event & { payload?: unknown }).payload
  if (handleChunkLoadError(err ?? new Error('Unable to preload CSS'), window.location.pathname + window.location.search)) {
    event.preventDefault()
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
installPasswordVisibility()

// Bounded first-touch attribution, no raw URL/referrer/query persistence.
try {
 const source=new URLSearchParams(location.search).get('utm_source')
 if(source && /^[A-Za-z0-9_.:/-]{1,128}$/.test(source) && !sessionStorage.getItem('acquisition_source')) sessionStorage.setItem('acquisition_source',source)
} catch { /* storage may be unavailable */ }
