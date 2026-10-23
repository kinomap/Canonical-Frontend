<script setup lang="ts">
import UserAvatar from './UserAvatar.vue'
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
            <router-link to="/profile" class="profile-btn" :title="t('User Profile')" :aria-label="t('User Profile')">
              <div class="avatar-circle">
                <UserAvatar :user="authStore.user.value" :size="44" />

              </div>
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
  background: #0d0e12;
  backdrop-filter: none;
  border-bottom: 1px solid var(--ui-border);
}

.header-container {
  width: 100%;
  max-width: var(--page-frame-max, 1440px);
  margin: 0 auto;
  padding: 12px var(--page-frame-gutter, 16px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.header-left {
  flex: 1 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand-link {
  flex: 0 0 176px;
  min-height: 44px;
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--ui-text);
  outline: none;
}

.brand-link:focus-visible {
  box-shadow: 0 0 0 2px var(--ui-link);
  border-radius: var(--ui-radius);
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

@media (min-width: 1024px) {
  .desktop-nav {
    display: flex;
  }
}

.nav-link {
  color: var(--ui-secondary);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: color 0.15s ease;
  outline: none;
  padding: 10px 8px;
  border-radius: var(--ui-radius);
}

.nav-link:hover,
.nav-link:focus-visible {
  color: var(--ui-text);
}

.nav-link.active {
  background: var(--ui-raised);
  color: var(--ui-link);
  font-weight: 600;
}

.header-right {
  flex: 0 1 440px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-search {
  display: none;
  flex: 1 1 320px;
  min-width: 160px;
  width: auto;
}

@media (min-width: 1024px) {
  .header-search {
    display: block;
    width: auto;
  }
}

.auth-controls {
  flex: 0 0 auto;
  min-width: 64px;
  justify-content: flex-end;
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
  color: var(--ui-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: var(--ui-radius);
  transition: color 0.15s ease;
}

.login-btn:hover {
  color: var(--ui-text);
}

.register-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: var(--ui-radius);
  transition: background 0.15s ease;
}

.register-btn:hover {
  background: var(--ui-primary);
  color:var(--ui-on-primary);
}

.profile-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  box-shadow: none;
  text-decoration: none;
  color: var(--ui-text);
}

.profile-btn:focus-visible {
  outline: 2px solid var(--ui-link);
  outline-offset: 4px;
}

.avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  box-shadow: none;
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
  color: var(--ui-text);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--ui-radius);
}

@media (min-width: 1024px) {
  .mobile-hamburger-btn {
    display: none;
  }
}

.mobile-menu-drawer {
  background: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border);
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
  color: var(--ui-secondary);
  text-decoration: none;
  font-size: 1rem;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: var(--ui-radius);
}

.mobile-nav-link:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.mobile-nav-link.register {
  color: var(--ui-link);
}

.mobile-auth-divider {
  height: 1px;
  background: var(--ui-raised);
  margin: 4px 0;
}

.mobile-logout-btn {
  background: transparent;
  border: none;
  color: var(--ui-danger);
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
}

@media (min-width: 1024px) and (max-width: 1100px) {
  .desktop-nav { gap:12px; }
  .header-left { gap:24px; }
  .header-container { gap:20px; }
}
@media (max-width: 1023px) {
  .header-right { flex: 0 0 auto; }
}
@media (max-width: 639px) {
  .brand-link { flex-basis:64px; }
}
</style>
