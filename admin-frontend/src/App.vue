<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

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
  </div>
  <div v-else class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>KINOSOTA ADMIN</h2>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/">Dashboard</router-link>
        <router-link to="/movies">Movies</router-link>
        <router-link to="/blocked">Blocked</router-link>
        <router-link to="/without-poster">Without Poster</router-link>
        <router-link to="/descriptions">Descriptions</router-link>
        <router-link to="/system">System</router-link>
        <router-link to="/telegram">Telegram</router-link>
      </nav>
      <div class="sidebar-footer">
        <button @click="logout" class="logout-btn">Logout</button>
      </div>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style>
/* Reset and base styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: #0f172a;
  color: #f1f5f9;
}

.admin-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 250px;
  background-color: #1e293b;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #334155;
}

.sidebar-header {
  padding: 24px;
  border-bottom: 1px solid #334155;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  color: #38bdf8;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}

.sidebar-nav a {
  padding: 12px 24px;
  color: #94a3b8;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.sidebar-nav a:hover, .sidebar-nav a.router-link-active {
  color: #f8fafc;
  background-color: #334155;
  border-left: 3px solid #38bdf8;
}

.sidebar-footer {
  padding: 16px 24px;
  border-top: 1px solid #334155;
}

.logout-btn {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: #ef4444;
  color: white;
}

.main-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}
</style>
