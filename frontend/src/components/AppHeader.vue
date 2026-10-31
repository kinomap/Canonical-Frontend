<script setup lang="ts">
import UserAvatar from './UserAvatar.vue'
import { t } from '@/i18n'
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Home, Bell } from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import SearchBar from '@/components/SearchBar.vue'
import BrandLogo from '@/components/CinemaBrand.vue'

const router = useRouter()
const route = useRoute()
const torrentMode=computed(()=>route.path==='/torrents'||route.path.startsWith('/torrents/'))
const authStore = useAuthStore()

const searchQuery = ref(String(route.query.q||''))
watch(()=>route.query.q,value=>{searchQuery.value=String(value||'')})
const mobileMenuOpen = ref(false)
const desktopSearch = ref<InstanceType<typeof SearchBar> | null>(null)
const mobileSearch = ref<InstanceType<typeof SearchBar> | null>(null)
async function focusSearch() {
 if (window.matchMedia('(max-width: 1023px)').matches) { mobileMenuOpen.value=true; await nextTick(); mobileSearch.value?.focus() }
 else desktopSearch.value?.focus()
}
function shortcut(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k' && !event.altKey) {event.preventDefault();focusSearch()} }
onMounted(()=>{window.addEventListener('keydown',shortcut);window.addEventListener('showcase:search',focusSearch)})
onUnmounted(()=>{window.removeEventListener('keydown',shortcut);window.removeEventListener('showcase:search',focusSearch)})

onMounted(() => {
  if (authStore.token.value && !authStore.user.value) {
    authStore.fetchCurrentUser()
  }
})

function handleSearch(query: string) {
  if (query.trim().length > 0) {
    router.push({ path: torrentMode.value?'/torrents':'/movies', query: torrentMode.value?{kind:route.query.kind==='tv'||route.params.kind==='tv'?'tv':'movie',q:query.trim().slice(0,120)}:{q:query.trim()} })
  } else if(torrentMode.value) {
    router.push({path:'/torrents',query:{kind:route.query.kind==='tv'?'tv':'movie'}})
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
  document.querySelectorAll('.app-header details[open]').forEach(item=>item.removeAttribute('open'))
})
</script>

<template>
  <header class="app-header" :class="{'torrent-header':torrentMode}">
    <div class="header-container">
      <!-- Left: Logo & Brand -->
      <div class="header-left">
        <router-link :to="torrentMode?'/torrents':'/'" class="brand-link" tabindex="0">
          <div class="desktop-logo">
            <BrandLogo />
          </div>
          <div class="mobile-logo">
            <BrandLogo />
          </div>
        </router-link>

        <span v-if="torrentMode" class="torrent-brand-badge">TORRENTS</span>
        <!-- Desktop Navigation Links -->
        <nav v-if="!torrentMode" class="desktop-nav" aria-label="Основная навигация">
          <router-link to="/" class="nav-link" :class="{ active: route.path === '/' }"><Home :size="18" aria-hidden="true" />Главная</router-link>
          <router-link to="/movies" class="nav-link" :class="{ active: route.path.startsWith('/movies') }">{{ t("Movies") }}</router-link>
          <router-link to="/series" class="nav-link" :class="{ active: route.path.startsWith('/series') }">{{ t("Series") }}</router-link>
          <details class="header-genres"><summary class="nav-link" :class="{active:route.path==='/genres'}">Жанры ▾</summary><div class="genre-dropdown"><router-link v-for="genre in [{name:'Боевик',slug:'boevik'},{name:'Комедия',slug:'komedija'},{name:'Фантастика',slug:'fantastika'},{name:'Ужасы',slug:'uzhasy'},{name:'Триллер',slug:'triller'}]" :key="genre.slug" :to="`/genres?genre=${genre.slug}`">{{genre.name}}</router-link><router-link to="/genres">Все жанры</router-link></div></details>
          <router-link to="/torrents" class="nav-link torrent-nav-entry">Торренты</router-link>
        </nav>
        <nav v-else class="desktop-nav" aria-label="Торрент навигация">
          <router-link to="/torrents" class="nav-link" :class="{active:route.path==='/torrents'&&!route.query.kind&&!route.query.q}"><Home :size="16" stroke-width="1.7" /> Главная</router-link>
          <router-link to="/torrents?kind=movie" class="nav-link" :class="{active:route.query.kind==='movie'}">Фильмы</router-link>
          <router-link to="/torrents?kind=tv" class="nav-link" :class="{active:route.query.kind==='tv'}">Сериалы</router-link>
          <details class="header-genres"><summary class="nav-link">Жанры ▾</summary><div class="genre-dropdown"><router-link v-for="g in [{id:28,name:'Боевик'},{id:35,name:'Комедия'},{id:878,name:'Фантастика'},{id:27,name:'Ужасы'},{id:53,name:'Триллер'}]" :key="g.id" :to="`/torrents?kind=movie&genre=${g.id}`">{{g.name}}</router-link><router-link to="/torrents?kind=movie">Все жанры</router-link></div></details>
          <router-link to="/" class="nav-link main-catalog-link">Основной каталог →</router-link>
        </nav>
      </div>

      <!-- Right: Search & User Controls -->
      <div class="header-right">
        <div class="header-search">
          <SearchBar :torrent="torrentMode" ref="desktopSearch"
            v-model="searchQuery"
            placeholder="Поиск фильмов, сериалов..."
            @search="handleSearch"
          />
        </div>

        <details class="notification-menu"><summary aria-label="Уведомления"><Bell :size="21" /></summary><div class="genre-dropdown">Центр уведомлений пока недоступен. Новинки — в каталоге.</div></details>
        <!-- Auth Navigation -->
        <div class="auth-controls">
          <template v-if="authStore.isAuthenticated.value">
            <details class="profile-menu"><summary class="profile-btn" aria-label="Меню профиля"><UserAvatar :user="authStore.user.value" :size="44" /></summary><div class="genre-dropdown"><router-link to="/profile">Личный кабинет</router-link><button @click="authStore.logout()">Выйти</button></div></details>
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
        <SearchBar :torrent="torrentMode" ref="mobileSearch"
          v-model="searchQuery"
          placeholder="Поиск фильмов, сериалов..."
          @search="handleSearch"
        />
      </div>

      <nav v-if="!torrentMode" class="mobile-nav" aria-label="Мобильная навигация">
        <router-link to="/" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Home") }}</router-link>
        <router-link to="/movies" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Movies") }}</router-link>
        <router-link to="/series" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Series") }}</router-link>
        <router-link to="/genres" class="mobile-nav-link" @click="closeMobileMenu">{{ t("Genres") }}</router-link>

        <router-link to="/torrents" class="mobile-nav-link" @click="closeMobileMenu">Торренты</router-link>

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
      <nav v-else class="mobile-nav" aria-label="Мобильная торрент навигация"><router-link to="/torrents" class="mobile-nav-link">Главная</router-link><router-link to="/torrents?kind=movie" class="mobile-nav-link">Фильмы</router-link><router-link to="/torrents?kind=tv" class="mobile-nav-link">Сериалы</router-link><details class="mobile-genres"><summary class="mobile-nav-link">Жанры</summary><router-link v-for="g in [{id:28,name:'Боевик'},{id:35,name:'Комедия'},{id:878,name:'Фантастика'},{id:27,name:'Ужасы'},{id:53,name:'Триллер'}]" :key="g.id" :to="`/torrents?kind=movie&genre=${g.id}`" class="mobile-nav-link">{{g.name}}</router-link></details><router-link to="/" class="mobile-nav-link">Основной каталог →</router-link><template v-if="!authStore.isAuthenticated.value"><router-link to="/login" class="mobile-nav-link">Войти</router-link><router-link to="/register" class="mobile-nav-link">Регистрация</router-link></template></nav>
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
.torrent-header .header-left{gap:12px;flex:0 1 auto}.torrent-header .desktop-nav{gap:8px;white-space:nowrap}.torrent-header .nav-link{font-size:14px;display:inline-flex;align-items:center;gap:4px}.torrent-header .brand-link{flex:0 0 auto}.torrent-header .header-right{flex:1 1 440px}.torrent-header .torrent-brand-badge{padding:4px 8px;font-size:10px}.torrent-header .main-catalog-link{font-size:12px}.torrent-header :deep(.search-input:focus){border-color:#70bca8}.torrent-header :deep(.register-btn){background:#f4d45e}
@media(min-width:1024px) and (max-width:1499px){.torrent-header .main-catalog-link{display:none}.torrent-header .header-left{gap:8px}.torrent-header .desktop-nav{gap:0}.torrent-header .nav-link{font-size:12px}}
</style>

<style scoped>
.torrent-brand-badge{font-size:12px;line-height:16px;letter-spacing:.08em;color:#9ce8d7;border:1px solid #527d73;border-radius:8px;padding:8px;font-weight:600;white-space:nowrap}.torrent-header{--ui-link:#9ce8d7;--ui-accent:#f4d45e;background:var(--ui-bg)}.torrent-nav-entry{color:#9ce8d7}.torrent-header .nav-link.active{color:#9ce8d7;border-color:#527d73;background:#1f1f1f}
@media(max-width:767px){.torrent-header .header-left{gap:8px}.torrent-brand-badge{font-size:12px;padding:4px}.torrent-header :deep(.cinema-brand){font-size:18px}}
.torrent-header .header-left{gap:12px;flex:0 1 auto}.torrent-header .desktop-nav{gap:8px;white-space:nowrap}.torrent-header .nav-link{font-size:14px;display:inline-flex;align-items:center;gap:4px}.torrent-header .brand-link{flex:0 0 auto}.torrent-header .header-right{flex:1 1 440px}.torrent-header .torrent-brand-badge{padding:4px 8px;font-size:10px}.torrent-header .main-catalog-link{font-size:12px}.torrent-header :deep(.search-input:focus){border-color:#70bca8}.torrent-header :deep(.register-btn){background:#f4d45e}
@media(min-width:1024px) and (max-width:1499px){.torrent-header .main-catalog-link{display:none}.torrent-header .header-left{gap:8px}.torrent-header .desktop-nav{gap:0}.torrent-header .nav-link{font-size:12px}}
</style>
