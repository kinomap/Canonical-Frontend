import './browserAuth'
// Global base styles/tokens first, so component and App.vue styles always win.
import './style.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)



import axios from 'axios'
import { csrfToken } from './browserAuth'
axios.interceptors.request.use(config => {
  const u = new URL(config.url || '', window.location.origin)
  if (u.origin === window.location.origin && u.pathname.startsWith('/api/v1/')) {
    if (config.headers.get('Authorization') === 'Bearer cookie-session') config.headers.delete('Authorization')
    config.headers.set('X-Session-Mode','cookie')
    if (!['get','head','options'].includes((config.method || 'get').toLowerCase()) && csrfToken()) config.headers.set('X-CSRF-Token',csrfToken())
    config.withCredentials=true
  }
  return config
})

app.mount('#app')
