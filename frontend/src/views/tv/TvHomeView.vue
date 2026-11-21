<script setup lang="ts">
/**
 * KINOSOTA TV home (/tv): spotlight hero + horizontal shelves + collapsible left menu,
 * driven by the remote (useTvNavigation). Lazy route chunk: desktop / mobile visitors never load it.
 * Only existing /api/v1 endpoints are used.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiClient } from '@/api/client'
import { torrentsApi } from '@/api/torrents'
import { useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import { useTvSpotlight } from '@/composables/useTvSpotlight'
import TvSideMenu from './TvSideMenu.vue'
import TvSpotlightHero from './TvSpotlightHero.vue'
import TvShelf from './TvShelf.vue'
import { TV_MENU_ITEMS } from './tvMenu'
import { movieCard, seriesCard, torrentCard, type TvCard } from './tvCards'
import { tvPlayerLocation } from './tvPlayback'

interface TvShelfModel { id: string; title: string; cards: TvCard[] }

const SHELF_LIMIT = 20
const MENU_SECTION_ROW: Record<string, string> = { home: 'hero', movies: 'popular', series: 'series', torrents: 'torrents' }

const router = useRouter()
const root = ref<HTMLElement | null>(null)
const { hero, loading: heroLoading, refreshHero } = useTvSpotlight()

const shelves = ref<TvShelfModel[]>([
  { id: 'popular', title: 'Популярное', cards: [] },
  { id: 'newest', title: 'Новинки', cards: [] },
  { id: 'series', title: 'Топ сериалов', cards: [] },
  { id: 'torrents', title: 'Торренты', cards: [] },
])
const shelvesLoading = ref(true)
const visibleShelves = computed(() => shelves.value.filter(shelf => shelf.cards.length > 0))

const rows = computed<TvRow[]>(() => [
  { id: 'hero', size: hero.value ? 1 : 0 },
  ...shelves.value.map(shelf => ({ id: shelf.id, size: shelf.cards.length })),
])

const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function showNotice(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
}

function openContent(rowId: string, index: number) {
  if (rowId === 'hero') {
    if (hero.value) void router.push(tvPlayerLocation({ src: 'torrent', kind: hero.value.kind, id: String(hero.value.tmdb_id) }))
    return
  }
  const card = shelves.value.find(shelf => shelf.id === rowId)?.cards[index]
  if (card) void router.push(tvPlayerLocation(card.play))
}

function openMenuItem(index: number) {
  const item = TV_MENU_ITEMS[index]
  if (!item) return
  if (item.id === 'search') { showNotice('Поиск с экранной клавиатурой скоро появится'); return }
  if (item.id === 'profile') { void router.push('/tv/auth'); return }
  const rowId = MENU_SECTION_ROW[item.id]
  if (rowId) nav.focusRow(rowId)
}

function onSelect(target: TvSelectTarget) {
  if (target.area === 'menu') openMenuItem(target.index)
  else openContent(target.rowId, target.index)
}

/** Back on a shelf returns to the banner; on the banner it is left to the TV (exit / previous page). */
function onBack(): boolean {
  if (nav.currentRow.value && nav.currentRow.value.id !== 'hero' && hero.value) {
    nav.focusRow('hero')
    return true
  }
  return false
}

const nav = useTvNavigation({ rows, menuSize: TV_MENU_ITEMS.length, memoryKey: 'home', onSelect, onBack, root })

const menuFocusedIndex = computed(() => (nav.area.value === 'menu' ? nav.menuIndex.value : -1))
const activeMenuIndex = computed(() => {
  const rowId = nav.currentRow.value?.id
  const id = rowId === 'hero' ? 'home' : rowId === 'popular' || rowId === 'newest' ? 'movies' : rowId
  return TV_MENU_ITEMS.findIndex(item => item.id === id)
})

function focusedIndexOf(rowId: string): number {
  const row = nav.currentRow.value
  if (nav.area.value !== 'content' || !row || row.id !== rowId) return -1
  const key = nav.focusKey.value ?? ''
  return Number(key.slice(key.lastIndexOf(':') + 1))
}

function onMenuClick(index: number) {
  nav.closeMenu()
  openMenuItem(index)
}

function setShelf(id: string, cards: TvCard[]) {
  const shelf = shelves.value.find(item => item.id === id)
  if (shelf) shelf.cards = cards.slice(0, SHELF_LIMIT)
}

async function loadShelves() {
  const [home, series, torrents] = await Promise.allSettled([
    apiClient.getHomeCollections(),
    apiClient.listSeries({ sort: 'rating_desc', page_size: SHELF_LIMIT }),
    torrentsApi.list({ kind: 'movie' }),
  ])
  if (home.status === 'fulfilled') {
    setShelf('popular', (home.value.popular ?? []).map(movieCard))
    setShelf('newest', (home.value.newest ?? []).map(movieCard))
  }
  if (series.status === 'fulfilled') setShelf('series', (series.value.items ?? []).map(seriesCard))
  if (torrents.status === 'fulfilled') setShelf('torrents', (torrents.value.items ?? []).map(torrentCard))
  shelvesLoading.value = false
}

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  void refreshHero()
  void loadShelves()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('tv-mode')
  clearTimeout(noticeTimer)
})
</script>

<template>
  <div ref="root" class="tv-layer" data-testid="tv-home">
    <TvSideMenu
      :open="nav.menuOpen.value"
      :focused-index="menuFocusedIndex"
      :active-index="activeMenuIndex"
      @select="onMenuClick"
    />

    <div class="tv-content">
      <TvSpotlightHero
        :hero="hero"
        :loading="heroLoading"
        :focused="nav.isFocused('hero', 0)"
        @watch="openContent('hero', 0)"
      />

      <TvShelf
        v-for="shelf in visibleShelves"
        :id="shelf.id"
        :key="shelf.id"
        :title="shelf.title"
        :cards="shelf.cards"
        :focused-index="focusedIndexOf(shelf.id)"
        @select="index => openContent(shelf.id, index)"
      />

      <p v-if="shelvesLoading" class="tv-status">Загружаем подборки…</p>
      <p v-else-if="!visibleShelves.length" class="tv-status" data-testid="tv-empty">Подборки сейчас недоступны. Попробуйте чуть позже.</p>
    </div>

    <p v-if="notice" class="tv-notice" role="status" aria-live="polite" data-testid="tv-notice">{{ notice }}</p>
  </div>
</template>

<style scoped>
.tv-layer {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow-x: hidden;
  overflow-y: auto;
  background: #07080b;
  color: #f5f5f7;
  scrollbar-width: none;
}

.tv-layer::-webkit-scrollbar {
  display: none;
}

.tv-content {
  margin-left: 96px;
  padding-bottom: 8vh;
}

.tv-status {
  padding: 3vh 4vw;
  color: #9ca3af;
  font-size: clamp(18px, 1.3vw, 32px);
}

.tv-notice {
  position: fixed;
  z-index: 30;
  left: 50%;
  bottom: 6vh;
  transform: translateX(-50%);
  margin: 0;
  padding: 18px 28px;
  border: 2px solid #00d2ff;
  border-radius: 14px;
  background: rgba(13, 14, 18, 0.96);
  font-size: clamp(18px, 1.2vw, 30px);
  font-weight: 700;
}
</style>

<style>
/* Remote focus of the TV layer: shared by the hero button, menu items and shelf cards. */
.tv-layer :focus {
  outline: none;
}

.tv-layer .tv-focused {
  position: relative;
  z-index: 2;
  transform: scale(1.05);
  border-color: #00d2ff !important;
  box-shadow: 0 0 0 3px #00d2ff, 0 0 28px rgba(0, 210, 255, 0.55), 0 18px 40px rgba(0, 0, 0, 0.7);
}

html.tv-mode,
html.tv-mode body {
  overflow: hidden;
  background: #07080b;
}
</style>
