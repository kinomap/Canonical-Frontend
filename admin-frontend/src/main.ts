import './browserAuth'
import './httpClient'
// Global base styles/tokens first, so component and App.vue styles always win.
import './style.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)




window.addEventListener('admin-session-expired', () => {
  const current = router.currentRoute.value
  if (current.meta.requiresAuth) void router.replace({name:'login', query:{reason:'expired', redirect:current.fullPath}})
})

app.use(router)
app.mount('#app')
