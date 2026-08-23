<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import ToastContainer from './components/ToastContainer.vue'

const route = useRoute()
const router = useRouter()

const isLoginPage = computed(() => route.name === 'login')

const logout = () => {
  localStorage.removeItem('admin_token')
  router.push('/login')
}
</script>

<template>
  <div v-if="isLoginPage">
    <router-view />
    <ToastContainer />
  </div>
  <div v-else class="admin-layout">
    <ToastContainer />
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand-icon">K</div>
        <div class="brand-text">
          <span class="brand-name">KINOSOTA</span>
          <span class="brand-sub">ADMIN PANEL</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/" class="nav-item" exact-active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </router-link>

        <div class="nav-section-label">Content</div>

        <router-link to="/movies" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
            <line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
          Movies
        </router-link>

        <router-link to="/metadata" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Metadata
        </router-link>

        <router-link to="/blocked" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          Blocked
        </router-link>

        <router-link to="/without-poster" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Without Poster
        </router-link>

        <router-link to="/garbage" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
          Garbage
        </router-link>

        <router-link to="/comments" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Comments
        </router-link>

        <div class="nav-section-label">Sources</div>

        <router-link to="/telegram" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
          </svg>
          Telegram
        </router-link>

        <div class="nav-section-label">System</div>

        <router-link to="/system" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Health &amp; Workers
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <button @click="logout" class="logout-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Logout
        </button>
      </div>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0f172a;
  color: #f1f5f9;
  font-size: 14px;
  line-height: 1.5;
}

.admin-layout {
  display: flex;
  min-height: 100vh;
}

/* ── Sidebar ── */
.sidebar {
  width: 240px;
  background: linear-gradient(180deg, #1a2540 0%, #111827 100%);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 900;
  color: #0f172a;
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.brand-name {
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #f8fafc;
}

.brand-sub {
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  color: #64748b;
  font-weight: 500;
}

/* Section labels — NON-CLICKABLE visual dividers */
.nav-section-label {
  padding: 16px 16px 6px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #475569;
  pointer-events: none;
  user-select: none;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow-y: auto;
}

/* Navigation items */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  margin: 1px 8px;
  color: #94a3b8;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  border-radius: 8px;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.nav-item:hover {
  color: #f1f5f9;
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.04);
}

.nav-item--active {
  color: #38bdf8 !important;
  background: rgba(56, 189, 248, 0.1) !important;
  border-color: rgba(56, 189, 248, 0.15) !important;
  font-weight: 600;
}

.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-item--active .nav-icon {
  opacity: 1;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all 0.15s;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

/* ── Main content ── */
.main-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  min-width: 0;
}
</style>
