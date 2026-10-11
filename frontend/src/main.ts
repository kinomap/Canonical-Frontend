import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { handleChunkLoadError } from './router/chunkReload'
import './style.css'

// Vite reports failed preloads of lazy chunks/CSS here (stale build after redeploy).
window.addEventListener('vite:preloadError', (event) => {
  const err = (event as Event & { payload?: unknown }).payload
  if (handleChunkLoadError(err ?? new Error('Unable to preload CSS'), window.location.pathname + window.location.search)) {
    event.preventDefault()
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
