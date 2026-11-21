<script setup lang="ts">
import UserAvatar from './UserAvatar.vue'
import { t } from '@/i18n'
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Home, Bell, ArrowRight, Layers,
  Swords, Compass, Sparkles, Smile, Footprints, Video,
  Theater, Users, Wand2, Landmark, Ghost, Music,
  Search, Heart, Rocket, Zap, Shield, Sun, Tv
} from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import SearchBar from '@/components/SearchBar.vue'
import BrandLogo from '@/components/CinemaBrand.vue'
import TvConnectModal from '@/components/TvConnectModal.vue'

const router = useRouter()
const route = useRoute()
const torrentMode = computed(() => route.path === '/torrents' || route.path.startsWith('/torrents/'))
const authStore = useAuthStore()

interface TorrentGenreItem {
  id: number
  name: string
  slug: string
  icon: any
}

const TORRENT_MOVIE_GENRES: TorrentGenreItem[] = [
  { id: 28, name: 'Боевик', slug: 'boevik', icon: Swords },
  { id: 12, name: 'Приключения', slug: 'prikljuchenija', icon: Compass },
  { id: 16, name: 'Мультфильм', slug: 'multfilm', icon: Sparkles },
  { id: 35, name: 'Комедия', slug: 'komedija', icon: Smile },
  { id: 80, name: 'Криминал', slug: 'kriminal', icon: Footprints },
  { id: 99, name: 'Документальный', slug: 'dokumentalnyj', icon: Video },
  { id: 18, name: 'Драма', slug: 'drama', icon: Theater },
  { id: 10751, name: 'Семейный', slug: 'semejnyj', icon: Users },
  { id: 14, name: 'Фэнтези', slug: 'fentezi', icon: Wand2 },
  { id: 36, name: 'История', slug: 'istorija', icon: Landmark },
  { id: 27, name: 'Ужасы', slug: 'uzhasy', icon: Ghost },
  { id: 10402, name: 'Музыка', slug: 'muzyka', icon: Music },
  { id: 9648, name: 'Детектив', slug: 'detektiv', icon: Search },
  { id: 10749, name: 'Мелодрама', slug: 'melodrama', icon: Heart },
  { id: 878, name: 'Фантастика', slug: 'fantastika', icon: Rocket },
  { id: 10770, name: 'Телефильм', slug: 'televizionnyj-fil-m', icon: Tv },
  { id: 53, name: 'Триллер', slug: 'triller', icon: Zap },
  { id: 10752, name: 'Военный', slug: 'voennyj', icon: Shield },
  { id: 37, name: 'Вестерн', slug: 'vestern', icon: Sun },
]

const TORRENT_TV_GENRES: TorrentGenreItem[] = [
  { id: 10759, name: 'Боевик и приключения', slug: 'boevik', icon: Swords },
  { id: 16, name: 'Мультфильм', slug: 'multfilm', icon: Sparkles },
  { id: 35, name: 'Комедия', slug: 'komedija', icon: Smile },
  { id: 80, name: 'Криминал', slug: 'kriminal', icon: Footprints },
  { id: 99, name: 'Документальный', slug: 'dokumentalnyj', icon: Video },
  { id: 18, name: 'Драма', slug: 'drama', icon: Theater },
  { id: 10751, name: 'Семейный', slug: 'semejnyj', icon: Users },
  { id: 10762, name: 'Детский', slug: 'semejnyj', icon: Sparkles },
  { id: 9648, name: 'Детектив', slug: 'detektiv', icon: Search },
  { id: 10763, name: 'Новости', slug: 'dokumentalnyj', icon: Video },
  { id: 10764, name: 'Реалити-шоу', slug: 'televizionnyj-fil-m', icon: Tv },
  { id: 10765, name: 'НФ и Фэнтези', slug: 'fantastika', icon: Rocket },
  { id: 10766, name: 'Мыльная опера', slug: 'melodrama', icon: Heart },
  { id: 10767, name: 'Ток-шоу', slug: 'komedija', icon: Smile },
  { id: 10768, name: 'Война и политика', slug: 'voennyj', icon: Shield },
  { id: 37, name: 'Вестерн', slug: 'vestern', icon: Sun },
]

const selectedGenreTab = ref<'movie' | 'tv'>('movie')
watch(() => route.query.kind, (val) => {
  if (val === 'tv') selectedGenreTab.value = 'tv'
  else if (val === 'movie') selectedGenreTab.value = 'movie'
}, { immediate: true })

function closeDropdowns() {
  document.querySelectorAll('.app-header details[open]').forEach(item => item.removeAttribute('open'))
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.header-genres') && !target?.closest('.notification-menu') && !target?.closest('.profile-menu')) {
    closeDropdowns()
  }
}



const searchQuery = ref(String(route.query.q||''))
watch(()=>route.query.q,value=>{searchQuery.value=String(value||'')})
const mobileMenuOpen = ref(false)
const desktopSearch = ref<InstanceType<typeof SearchBar> | null>(null)
const mobileSearch = ref<InstanceType<typeof SearchBar> | null>(null)
async function focusSearch() {
 if (window.matchMedia(torrentMode.value?'(max-width: 1279px)':'(max-width: 1023px)').matches) { mobileMenuOpen.value=true; await nextTick(); mobileSearch.value?.focus() }
 else desktopSearch.value?.focus()
}
function shortcut(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k' && !event.altKey) {event.preventDefault();focusSearch()} }
onMounted(()=>{window.addEventListener('keydown',shortcut);window.addEventListener('showcase:search',focusSearch);window.addEventListener('click',onDocumentClick)})
onUnmounted(()=>{window.removeEventListener('keydown',shortcut);window.removeEventListener('showcase:search',focusSearch);window.removeEventListener('click',onDocumentClick)})

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

const tvModalOpen = ref(false)
function openTvModal() {
  closeDropdowns()
  closeMobileMenu()
  tvModalOpen.value = true
}
function closeTvModal() {
  tvModalOpen.value = false
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
        <router-link to="/" class="brand-link" tabindex="0">
          <div class="desktop-logo">
            <BrandLogo />
          </div>
          <div class="mobile-logo">
            <BrandLogo />
          </div>
        </router-link>
        <!-- Desktop Navigation Links -->
        <nav v-if="!torrentMode" class="desktop-nav" aria-label="Основная навигация">
          <router-link to="/" class="nav-link" :class="{ active: route.path === '/' }"><Home :size="18" aria-hidden="true" />Главная</router-link>
          <router-link to="/movies" class="nav-link" :class="{ active: route.path.startsWith('/movies') }">{{ t("Movies") }}</router-link>
          <router-link to="/series" class="nav-link" :class="{ active: route.path.startsWith('/series') }">{{ t("Series") }}</router-link>
          <details class="header-genres"><summary class="nav-link" :class="{active:route.path==='/genres'}">Жанры ▾</summary><div class="genre-dropdown"><router-link v-for="genre in [{name:'Боевик',slug:'boevik'},{name:'Комедия',slug:'komedija'},{name:'Фантастика',slug:'fantastika'},{name:'Ужасы',slug:'uzhasy'},{name:'Триллер',slug:'triller'}]" :key="genre.slug" :to="`/genres?genre=${genre.slug}`">{{genre.name}}</router-link><router-link to="/genres">Все жанры</router-link></div></details>
          <router-link to="/torrents" class="nav-link torrent-nav-entry">Торренты</router-link>
          <button type="button" class="nav-link tv-nav-entry" data-testid="header-tv-desktop" aria-haspopup="dialog" @click="openTvModal"><Tv :size="18" aria-hidden="true" />ТВ</button>
        </nav>
        <nav v-else class="desktop-nav" aria-label="Торрент навигация">
          <router-link to="/torrents" class="nav-link" :class="{active:route.path==='/torrents'&&!Object.keys(route.query).length}"><Home :size="16" stroke-width="1.7" /> Главная</router-link>
          <router-link to="/torrents?kind=movie" class="nav-link" :class="{active:route.query.kind==='movie'}">Фильмы</router-link>
          <router-link to="/torrents?kind=tv" class="nav-link" :class="{active:route.query.kind==='tv'}">Сериалы</router-link>
          <details class="header-genres torrent-genres">
            <summary class="nav-link" :class="{ active: Boolean(route.query.genre) }">
              <Layers :size="15" stroke-width="2" /> Жанры ▾
            </summary>
            <div class="genres-mega-dropdown">
              <div class="mega-header">
                <div class="mega-tabs">
                  <button
                    type="button"
                    class="mega-tab"
                    :class="{ active: selectedGenreTab === 'movie' }"
                    @click.prevent="selectedGenreTab = 'movie'"
                  >
                    Фильмы
                  </button>
                  <button
                    type="button"
                    class="mega-tab"
                    :class="{ active: selectedGenreTab === 'tv' }"
                    @click.prevent="selectedGenreTab = 'tv'"
                  >
                    Сериалы
                  </button>
                </div>
                <router-link
                  :to="selectedGenreTab === 'movie' ? '/torrents?kind=movie' : '/torrents?kind=tv'"
                  class="mega-all-link"
                  @click="closeDropdowns"
                >
                  <span>Все {{ selectedGenreTab === 'movie' ? 'фильмы' : 'сериалы' }}</span>
                  <ArrowRight :size="14" />
                </router-link>
              </div>

              <div class="mega-grid">
                <router-link
                  v-for="g in (selectedGenreTab === 'movie' ? TORRENT_MOVIE_GENRES : TORRENT_TV_GENRES)"
                  :key="g.id"
                  :to="`/torrents?kind=${selectedGenreTab}&genre=${g.id}`"
                  class="genre-banner-card"
                  :class="{ active: String(route.query.genre) === String(g.id) && (route.query.kind || 'movie') === selectedGenreTab }"
                  @click="closeDropdowns"
                >
                  <div
                    class="genre-banner-bg"
                    :style="{ backgroundImage: `url('/genres/v2/${g.slug}.jpg')` }"
                  ></div>
                  <div class="genre-banner-overlay"></div>
                  <div class="genre-banner-content">
                    <component :is="g.icon" :size="15" class="genre-banner-icon" />
                    <span class="genre-banner-name">{{ g.name }}</span>
                  </div>
                </router-link>
              </div>
            </div>
          </details>
          <router-link to="/torrents/library" class="nav-link" :class="{ active: route.path === '/torrents/library' }">Кинотека</router-link><router-link to="/" class="nav-link main-catalog-link">Основной каталог</router-link>
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

        <router-link to="/torrents" class="mobile-nav-link torrent-nav-entry" @click="closeMobileMenu">Торренты</router-link>
        <button type="button" class="mobile-nav-link tv-nav-entry" data-testid="header-tv-mobile" aria-haspopup="dialog" @click="openTvModal"><Tv :size="18" aria-hidden="true" />ТВ</button>

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
      <nav v-else class="mobile-nav" aria-label="Мобильная торрент навигация">
        <router-link to="/torrents" class="mobile-nav-link" @click="closeMobileMenu">Главная</router-link>
        <router-link to="/torrents?kind=movie" class="mobile-nav-link" @click="closeMobileMenu">Фильмы</router-link>
        <router-link to="/torrents?kind=tv" class="mobile-nav-link" @click="closeMobileMenu">Сериалы</router-link>
        <details class="mobile-genres">
          <summary class="mobile-nav-link">Жанры ▾</summary>
          <div class="mobile-genres-panel">
            <div class="mobile-mega-tabs">
              <button
                type="button"
                class="mobile-mega-tab"
                :class="{ active: selectedGenreTab === 'movie' }"
                @click.prevent="selectedGenreTab = 'movie'"
              >
                Фильмы
              </button>
              <button
                type="button"
                class="mobile-mega-tab"
                :class="{ active: selectedGenreTab === 'tv' }"
                @click.prevent="selectedGenreTab = 'tv'"
              >
                Сериалы
              </button>
            </div>
            <router-link
              :to="selectedGenreTab === 'movie' ? '/torrents?kind=movie' : '/torrents?kind=tv'"
              class="mobile-all-link"
              @click="closeMobileMenu"
            >
              <span>Все {{ selectedGenreTab === 'movie' ? 'фильмы' : 'сериалы' }}</span>
              <ArrowRight :size="14" />
            </router-link>
            <div class="mobile-genre-grid">
              <router-link
                v-for="g in (selectedGenreTab === 'movie' ? TORRENT_MOVIE_GENRES : TORRENT_TV_GENRES)"
                :key="g.id"
                :to="`/torrents?kind=${selectedGenreTab}&genre=${g.id}`"
                class="mobile-genre-card"
                :class="{ active: String(route.query.genre) === String(g.id) && (route.query.kind || 'movie') === selectedGenreTab }"
                @click="closeMobileMenu"
              >
                <div
                  class="genre-banner-bg"
                  :style="{ backgroundImage: `url('/genres/v2/${g.slug}.jpg')` }"
                ></div>
                <div class="genre-banner-overlay"></div>
                <div class="genre-banner-content">
                  <component :is="g.icon" :size="13" class="genre-banner-icon" />
                  <span class="genre-banner-name">{{ g.name }}</span>
                </div>
              </router-link>
            </div>
          </div>
        </details>
        <router-link to="/torrents/library" class="mobile-nav-link" @click="closeMobileMenu">Кинотека</router-link>
        <router-link to="/" class="mobile-nav-link main-catalog-link" @click="closeMobileMenu">Основной каталог</router-link>
        <template v-if="!authStore.isAuthenticated.value">
          <router-link to="/login" class="mobile-nav-link" @click="closeMobileMenu">Войти</router-link>
          <router-link to="/register" class="mobile-nav-link" @click="closeMobileMenu">Регистрация</router-link>
        </template>
      </nav>
    </div>
    <TvConnectModal :show="tvModalOpen" @close="closeTvModal" />
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

.tv-nav-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

.nav-link.tv-nav-entry:hover,
.nav-link.tv-nav-entry:focus-visible {
  color: #00d2ff;
}

.mobile-nav-link.tv-nav-entry {
  width: 100%;
  text-align: left;
  color: #00d2ff !important;
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
  background: rgba(255, 255, 255, 0.08) !important;
  color: #ffffff !important;
}

.mobile-nav-link.torrent-nav-entry {
  color: #2dd4bf !important;
}

.mobile-nav-link.torrent-nav-entry:hover {
  color: #5eead4 !important;
  background: rgba(45, 212, 191, 0.08) !important;
}

.mobile-nav-link.main-catalog-link {
  color: #F5B800 !important;
}

.mobile-nav-link.main-catalog-link:hover {
  color: #ffd447 !important;
  background: rgba(245, 184, 0, 0.08) !important;
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
<style scoped>
.torrent-header{--ui-link:#9ce8d7;--ui-accent:#f4d45e}.torrent-brand-badge{display:flex;align-items:center;flex:none;padding:8px 6px;border:1px solid #527d7355;border-radius:6px}.torrent-brand-badge img{display:block;width:50px;height:auto}.torrent-header .brand-link{flex:0 0 auto}.torrent-header .header-left{flex:0 1 auto;gap:12px!important}.torrent-header .desktop-nav{gap:4px!important;white-space:nowrap}.torrent-header .nav-link{display:inline-flex;align-items:center;font-size:14px;padding:10px 12px!important}.torrent-header .header-right{flex:1 1 360px;gap:16px}.torrent-header .header-search{min-width:200px!important}.torrent-header .main-catalog-link{display:inline-flex;font-size:14px}.torrent-header .nav-link.active{color:#f4d45e!important}
@media(min-width:1280px) and (max-width:1439px){.torrent-header .header-container{gap:12px!important}.torrent-header .header-left{gap:8px!important}.torrent-header .nav-link{font-size:12px;padding:10px 8px!important}.torrent-header .header-right{gap:12px}.torrent-header .register-btn{display:none}}
@media(max-width:1279px){.torrent-header .desktop-nav,.torrent-header .header-search,.torrent-header .auth-controls,.torrent-header .notification-menu{display:none!important}.torrent-header .mobile-hamburger-btn{display:flex!important}.torrent-header .header-container{justify-content:space-between!important}.torrent-header .header-left{flex:1 1 auto}.torrent-header .header-right{flex:0 0 auto}.torrent-header .mobile-menu-drawer{display:block!important}}
@media(max-width:767px){.torrent-header .header-left{gap:8px!important}.torrent-brand-badge{padding:6px 4px}.torrent-brand-badge img{width:44px}.torrent-header :deep(.cinema-brand){font-size:18px}}

/* Torrent Genres Mega Dropdown (Option 1: Cinematic Banners) */
.torrent-header .header-genres.torrent-genres {
  position: static !important;
}

.genres-mega-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: min(1200px, calc(100vw - 32px));
  background: rgba(16, 19, 26, 0.98);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(245, 184, 0, 0.3);
  border-radius: 18px;
  padding: 18px 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(245, 184, 0, 0.08);
  z-index: 250;
  box-sizing: border-box;
  animation: megaFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes megaFadeIn {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.mega-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 16px;
  flex-wrap: wrap;
}

.mega-tabs {
  display: flex;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mega-tab {
  background: transparent;
  border: none;
  color: #a1a1aa;
  font-weight: 600;
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mega-tab:hover {
  color: #ffffff;
}

.mega-tab.active {
  background: #f5b800;
  color: #0b0d12;
  box-shadow: 0 2px 10px rgba(245, 184, 0, 0.35);
}

.mega-all-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #f5b800;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 8px;
  background: rgba(245, 184, 0, 0.08);
  border: 1px solid rgba(245, 184, 0, 0.25);
  transition: all 0.2s ease;
}

.mega-all-link:hover {
  background: rgba(245, 184, 0, 0.18);
  border-color: rgba(245, 184, 0, 0.5);
  color: #ffd24d;
}

.mega-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
  max-height: calc(80vh - 120px);
  overflow-y: auto;
  padding: 2px;
}

.genre-banner-card {
  position: relative;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.genre-banner-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transition: transform 0.35s ease;
}

.genre-banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(12, 15, 22, 0.9) 0%, rgba(12, 15, 22, 0.65) 100%);
  transition: background 0.2s ease;
}

.genre-banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  width: 100%;
}

.genre-banner-icon {
  color: #f5b800;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.genre-banner-name {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

.genre-banner-card:hover {
  transform: translateY(-2px);
  border-color: rgba(245, 184, 0, 0.7);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5), 0 0 16px rgba(245, 184, 0, 0.25);
}

.genre-banner-card:hover .genre-banner-bg {
  transform: scale(1.12);
}

.genre-banner-card:hover .genre-banner-overlay {
  background: linear-gradient(90deg, rgba(18, 22, 32, 0.8) 0%, rgba(245, 184, 0, 0.25) 100%);
}

.genre-banner-card:hover .genre-banner-icon {
  transform: scale(1.15);
}

.genre-banner-card:hover .genre-banner-name {
  color: #ffd24d;
}

.genre-banner-card.active {
  border-color: #f5b800;
  box-shadow: 0 0 14px rgba(245, 184, 0, 0.4);
  background: rgba(245, 184, 0, 0.15);
}

/* Mobile Genres Panel */
.mobile-genres-panel {
  padding: 10px 0;
}

.mobile-mega-tabs {
  display: flex;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px;
  border-radius: 10px;
  margin-bottom: 8px;
}

.mobile-mega-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: #a1a1aa;
  font-weight: 600;
  font-size: 13px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}

.mobile-mega-tab.active {
  background: #f5b800;
  color: #0b0d12;
}

.mobile-all-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #f5b800;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(245, 184, 0, 0.08);
  border: 1px solid rgba(245, 184, 0, 0.2);
  margin-bottom: 8px;
}

.mobile-genre-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.mobile-genre-card {
  position: relative;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.mobile-genre-card.active {
  border-color: #f5b800;
}
</style>
