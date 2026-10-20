<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import SearchBar from '@/components/SearchBar.vue'
import BrandLogo from '@/components/BrandLogo.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const searchQuery = ref('')
const mobileMenuOpen = ref(false)

onMounted(() => {
  if (authStore.token.value && !authStore.user.value) {
    authStore.fetchCurrentUser()
  }
})

function handleSearch(query: string) {
  if (query.trim().length > 0) {
    router.push({ path: '/movies', query: { q: query.trim() } })
  }
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

watch(route, () => {
  closeMobileMenu()
})
</script>

<template>
  <header class="app-header">
    <div class="header-container">
      <!-- Left: Logo & Brand -->
      <div class="header-left">
        <router-link to="/" class="brand-link" tabindex="0">
          <div class="desktop-logo">
            <BrandLogo />
          </div>
          <div class="mobile-logo">
            <BrandLogo compact />
          </div>
        </router-link>

        <!-- Desktop Navigation Links -->
        <nav class="desktop-nav">
          <router-link to="/" class="nav-link" :class="{ active: route.path === '/' }">{{ t("Home") }}</router-link>
          <router-link to="/movies" class="nav-link" :class="{ active: route.path.startsWith('/movies') }">{{ t("Movies") }}</router-link>
          <router-link to="/series" class="nav-link" :class="{ active: route.path.startsWith('/series') }">{{ t("Series") }}</router-link>
          <router-link to="/genres" class="nav-link" :class="{ active: route.path === '/genres' }">{{ t("Genres") }}</router-link>
        </nav>
      </div>

      <!-- Right: Search & User Controls -->
      <div class="header-right">
        <div class="header-search">
          <SearchBar
            v-model="searchQuery"
            :placeholder="t('Search movies...')"
            @search="handleSearch"
          />
        </div>

        <!-- Auth Navigation -->
        <div class="auth-controls">
          <template v-if="authStore.isAuthenticated.value">
            <router-link to="/profile" class="profile-btn" :title="t('User Profile')">
              <div class="avatar-circle">
                <img v-if="authStore.user.value" :src="authStore.user.value.avatar_url || ('/avatars/'+(authStore.user.value.avatar_preset||0)+'.svg')" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>
                <span v-else>U</span>
              </div>
              <span class="user-name">{{ authStore.user.value?.display_name || authStore.user.value?.username || t('User Profile') }}</span>
            </router-link>
          </template>
          <template v-else>
            <router-link to="/login" class="login-btn">{{ t("Sign In") }}</router-link>
            <router-link to="/register" class="register-btn">{{ t("Register") }}</router-link>
          </template>
        </div>

        <!-- Mobile Hamburger Toggle -->
        <button
          class="mobile-hamburger-btn"
          :aria-expanded="mobileMenuOpen"
          :aria-label="t('Toggle Navigation Menu')"
          @click="toggleMobileMenu"
        >
          <svg v-if="!mobileMenuOpen" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" x2="20" y1="12" y2="12"/>
            <line x1="4" x2="20" y1="6" y2="6"/>
            <line x1="4" x2="20" y1="18" y2="18"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile Drawer Menu -->
    <div v-if="mobileMenuOpen" class="mobile-menu-drawer">
      <div class="mobile-search-wrapper">
        <SearchBar
          v-model="searchQuery"
          :placeholder="t('Search movies...')"
          @search="handleSearch"
        />
      </div>

      <nav class="mobile-nav">
        <router-link to="/" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Home") }}</router-link>
        <router-link to="/movies" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Movies") }}</router-link>
        <router-link to="/series" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Series") }}</router-link>
        <router-link to="/genres" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Genres") }}</router-link>

        <div class="mobile-auth-divider"></div>

        <template v-if="authStore.isAuthenticated.value">
          <router-link to="/profile" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Profile (") }}{{ authStore.user.value?.username }})</router-link>
          <button class="mobile-logout-btn" @click="authStore.logout(); closeMobileMenu()">{{ t("Sign Out") }}</button>
        </template>
        <template v-else>
          <router-link to="/login" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Sign In") }}</router-link>
          <router-link to="/register" class="mobile-nav-link register" @click="closeMobileMenu">{{ t("Create Account") }}</router-link>
        </template>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(13, 14, 18, 0.88);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand-link {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: #f3f4f6;
  outline: none;
}

.brand-link:focus-visible {
  box-shadow: 0 0 0 2px #3b82f6;
  border-radius: 8px;
}

.desktop-logo {
  display: none;
}

.mobile-logo {
  display: flex;
}

@media (min-width: 640px) {
  .desktop-logo {
    display: flex;
  }
  .mobile-logo {
    display: none;
  }
}

.desktop-nav {
  display: none;
  align-items: center;
  gap: 20px;
}

@media (min-width: 768px) {
  .desktop-nav {
    display: flex;
  }
}

.nav-link {
  color: #9ca3af;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: color 0.15s ease;
  outline: none;
  padding: 4px 8px;
  border-radius: 6px;
}

.nav-link:hover,
.nav-link:focus-visible {
  color: #f3f4f6;
}

.nav-link.active {
  color: #3b82f6;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-search {
  display: none;
  width: 240px;
}

@media (min-width: 1024px) {
  .header-search {
    display: block;
    width: 320px;
  }
}

.auth-controls {
  display: none;
  align-items: center;
  gap: 12px;
}

@media (min-width: 640px) {
  .auth-controls {
    display: flex;
  }
}

.login-btn {
  color: #d1d5db;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  transition: color 0.15s ease;
}

.login-btn:hover {
  color: #ffffff;
}

.register-btn {
  background: #3b82f6;
  color: #ffffff;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.register-btn:hover {
  background: #2563eb;
}

.profile-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #f3f4f6;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.avatar-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-size: 0.85rem;
  font-weight: 600;
}

.mobile-hamburger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #f3f4f6;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}

@media (min-width: 768px) {
  .mobile-hamburger-btn {
    display: none;
  }
}

.mobile-menu-drawer {
  background: #14151a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mobile-search-wrapper {
  margin-bottom: 8px;
}

.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-nav-link {
  color: #d1d5db;
  text-decoration: none;
  font-size: 1rem;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 8px;
}

.mobile-nav-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}

.mobile-nav-link.register {
  color: #3b82f6;
}

.mobile-auth-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.mobile-logout-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
}
</style>
