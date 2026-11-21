<script setup lang="ts">
/**
 * TV genres screen (/tv/genres): tabs «Жанры каталога KINOSOTA» | «Жанры Торрентов» over a cinema grid of large
 * genre cards. Free D-pad movement (the column is kept between grid rows), neon glow on the focused card,
 * OK opens the genre showcase. Data: apiClient.listGenres() / torrentsApi.genres(kind).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '@/api/client'
import { torrentsApi } from '@/api/torrents'
import { resolveTvKey, useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import TvSideMenu from './TvSideMenu.vue'
import { TV_MENU_ITEMS } from './tvMenu'
import { useTvMenu } from './useTvMenu'
import { catalogGenreCards, torrentGenreCards, tvGenreLocation, type TvGenreCard, type TvGenreSource } from './tvGenres'

const GENRE_COLUMNS = 5

const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const TABS: { id: TvGenreSource; label: string }[] = [
  { id: 'catalog', label: '🎬 Жанры каталога KINOSOTA' },
  { id: 'torrents', label: '⚡ Жанры Торрентов' },
]

const source = ref<TvGenreSource>(route.query.source === 'torrents' ? 'torrents' : 'catalog')
const cards = ref<TvGenreCard[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')

const gridRows = computed(() => {
  const result: TvGenreCard[][] = []
  for (let i = 0; i < cards.value.length; i += GENRE_COLUMNS) result.push(cards.value.slice(i, i + GENRE_COLUMNS))
  return result
})

const rows = computed<TvRow[]>(() => [
  { id: 'tabs', size: TABS.length },
  ...(status.value === 'error' ? [{ id: 'retry', size: 1 }] : []),
  ...gridRows.value.map((row, index) => ({ id: `g${index}`, size: row.length })),
])

const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function showNotice(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
}
const menu = useTvMenu(showNotice)

let loadId = 0
async function load() {
  const id = ++loadId
  const current = source.value
  status.value = 'loading'
  cards.value = []
  try {
    let next: TvGenreCard[]
    if (current === 'catalog') {
      next = catalogGenreCards(await apiClient.listGenres())
    } else {
      const [movie, tv] = await Promise.allSettled([torrentsApi.genres('movie'), torrentsApi.genres('tv')])
      const lists = [
        ...(movie.status === 'fulfilled' ? [{ kind: 'movie' as const, items: movie.value.items ?? [] }] : []),
        ...(tv.status === 'fulfilled' ? [{ kind: 'tv' as const, items: tv.value.items ?? [] }] : []),
      ]
      if (!lists.length) throw new Error('GENRES_UNAVAILABLE')
      next = torrentGenreCards(lists)
    }
    if (id !== loadId) return
    cards.value = next
    status.value = 'ready'
  } catch {
    if (id !== loadId) return
    status.value = 'error'
  }
}

function setSource(next: TvGenreSource) {
  if (next === source.value) return
  source.value = next
  void router.replace({ path: '/tv/genres', query: { source: next } })
  void load()
}

function cardAt(rowId: string, index: number): TvGenreCard | undefined {
  if (!rowId.startsWith('g')) return undefined
  return gridRows.value[Number(rowId.slice(1))]?.[index]
}

function onSelect(target: TvSelectTarget) {
  if (target.area === 'menu') { menu.open(target.index); return }
  if (target.rowId === 'tabs') { setSource(TABS[target.index]?.id ?? 'catalog'); return }
  if (target.rowId === 'retry') { void load(); return }
  const card = cardAt(target.rowId, target.index)
  if (card) void router.push(tvGenreLocation(card))
}

function leave() {
  const back = (router.options.history.state as { back?: unknown } | undefined)?.back
  if (typeof back === 'string' && back.startsWith('/tv') && !back.startsWith('/tv/genres')) router.back()
  else void router.replace('/tv')
}

function onBack(): boolean {
  if (nav.currentRow.value?.id !== 'tabs') { nav.focusRow('tabs', TABS.findIndex(tab => tab.id === source.value)); return true }
  leave()
  return true
}

const nav = useTvNavigation({ rows, menuSize: TV_MENU_ITEMS.length, onSelect, onBack, root, listen: false })

function focusedCol(): number {
  const key = nav.focusKey.value ?? ''
  return Number(key.slice(key.lastIndexOf(':') + 1)) || 0
}

/** Up / Down in the grid keep the column (a real grid, not independent shelves). */
function onKeydown(event: KeyboardEvent) {
  const action = resolveTvKey(event)
  const row = nav.currentRow.value
  if (nav.area.value === 'content' && row && (action === 'up' || action === 'down')) {
    const list = rows.value.filter(item => item.size > 0)
    const index = list.findIndex(item => item.id === row.id)
    const next = list[index + (action === 'down' ? 1 : -1)]
    event.preventDefault()
    if (!next) return
    if (next.id === 'tabs') nav.focusRow('tabs', TABS.findIndex(tab => tab.id === source.value))
    else if (row.id === 'tabs' || next.id === 'retry') nav.focusRow(next.id, 0)
    else nav.focusRow(next.id, Math.min(focusedCol(), next.size - 1))
    return
  }
  nav.onKeydown(event)
}

/** Moving along the tabs switches the genre source. */
watch(() => nav.focusKey.value, (key) => {
  if (key?.startsWith('tabs:')) {
    const tab = TABS[Number(key.slice(5))]
    if (tab) setSource(tab.id)
  }
})

const menuFocusedIndex = computed(() => (nav.area.value === 'menu' ? nav.menuIndex.value : -1))

function onMenuClick(index: number) {
  nav.closeMenu()
  menu.open(index)
}

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  window.addEventListener('keydown', onKeydown)
  nav.focusRow('tabs', TABS.findIndex(tab => tab.id === source.value))
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(noticeTimer)
  document.documentElement.classList.remove('tv-mode')
})

defineExpose({ load })
</script>

<template>
  <div ref="root" class="tv-layer" data-testid="tv-genres">
    <TvSideMenu :open="nav.menuOpen.value" :focused-index="menuFocusedIndex" :active-index="menu.activeIndex.value" @select="onMenuClick" />

    <div class="tv-content">
      <header class="tv-genres-head">
        <h1>Жанры</h1>
        <div class="tv-genres-tabs" role="tablist">
          <button
            v-for="(tab, index) in TABS"
            :key="tab.id"
            type="button"
            role="tab"
            class="tv-genres-tab"
            :aria-selected="source === tab.id"
            :class="{ active: source === tab.id, 'tv-focused': nav.isFocused('tabs', index) }"
            :data-tv-key="`tabs:${index}`"
            :data-testid="`tv-genres-tab-${tab.id}`"
            @click="setSource(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
      </header>

      <p v-if="status === 'loading'" class="tv-status" data-testid="tv-genres-loading">Загружаем жанры…</p>
      <div v-else-if="status === 'error'" class="tv-status" data-testid="tv-genres-error">
        <p>Жанры временно недоступны.</p>
        <button type="button" class="tv-genres-retry" :class="{ 'tv-focused': nav.isFocused('retry', 0) }" data-tv-key="retry:0" data-testid="tv-genres-retry" @click="load">
          Повторить
        </button>
      </div>
      <p v-else-if="!cards.length" class="tv-status" data-testid="tv-genres-empty">Жанры пока не добавлены.</p>

      <div v-else class="tv-genres-grid" role="grid" data-testid="tv-genres-grid">
        <div v-for="(row, r) in gridRows" :key="r" class="tv-genres-row" role="row">
          <button
            v-for="(card, c) in row"
            :key="card.key"
            type="button"
            role="gridcell"
            class="tv-genre-card"
            :class="{ 'tv-focused': nav.isFocused(`g${r}`, c) }"
            :data-tv-key="`g${r}:${c}`"
            :data-testid="`tv-genre-${card.slug}`"
            :aria-label="card.title"
            @click="router.push(tvGenreLocation(card))"
          >
            <span class="tv-genre-icon" aria-hidden="true">{{ card.icon }}</span>
            <span class="tv-genre-title">{{ card.title }}</span>
          </button>
        </div>
      </div>
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
  background: radial-gradient(ellipse at top, #141a2a 0%, #07080b 60%);
  color: #f5f5f7;
  scrollbar-width: none;
}

.tv-layer::-webkit-scrollbar {
  display: none;
}

.tv-content {
  margin-left: 96px;
  padding: 5vh 4vw 8vh;
}

.tv-genres-head h1 {
  margin: 0 0 2.4vh;
  font-size: clamp(30px, 2.6vw, 68px);
  font-weight: 900;
}

.tv-genres-tabs {
  display: flex;
  gap: 1.2vw;
  margin-bottom: 4vh;
}

.tv-genres-tab,
.tv-genres-retry {
  padding: 1.2vh 1.8vw;
  border: 3px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: #9ca3af;
  font: inherit;
  font-size: clamp(16px, 1.1vw, 28px);
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
}

.tv-genres-tab.active {
  color: #0d0e12;
  background: #f4d45e;
}

.tv-genres-tab.tv-focused,
.tv-genres-retry.tv-focused {
  border-color: #00d2ff;
  box-shadow: 0 0 24px rgba(0, 210, 255, 0.55);
  transform: scale(1.05);
}

.tv-genres-grid {
  display: flex;
  flex-direction: column;
  gap: 2.4vh;
}

.tv-genres-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1.6vw;
}

.tv-genre-card {
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.4vh;
  border: 3px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px;
  background: linear-gradient(145deg, #1a1f2e 0%, #10131c 100%);
  color: #e5e7eb;
  font: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.tv-genre-icon {
  font-size: clamp(38px, 3.2vw, 88px);
  line-height: 1;
}

.tv-genre-title {
  font-size: clamp(18px, 1.3vw, 34px);
  font-weight: 800;
}

.tv-genre-card.tv-focused {
  color: #fff;
  border-color: #00d2ff;
  box-shadow: 0 0 0 4px rgba(0, 210, 255, 0.25), 0 0 40px rgba(0, 210, 255, 0.65), inset 0 0 30px rgba(0, 210, 255, 0.18);
  transform: scale(1.07);
}

.tv-status {
  color: #9ca3af;
  font-size: clamp(18px, 1.3vw, 32px);
}

.tv-notice {
  position: fixed;
  z-index: 30;
  right: 4vw;
  bottom: 5vh;
  margin: 0;
  padding: 1.4vh 1.6vw;
  border-radius: 14px;
  background: rgba(17, 19, 26, 0.95);
  color: #fff;
  font-size: clamp(16px, 1.1vw, 28px);
  font-weight: 700;
}
</style>
