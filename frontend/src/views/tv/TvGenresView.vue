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
import TvIcon from './TvIcon.vue'
import type { TvIconName } from './tvIcons'
import { TV_MENU_ITEMS } from './tvMenu'
import { useTvMenu } from './useTvMenu'
import { catalogGenreCards, torrentGenreCards, tvGenreLocation, type TvGenreCard, type TvGenreSource } from './tvGenres'

const GENRE_COLUMNS = 5

const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const TABS: { id: TvGenreSource; label: string; icon: TvIconName }[] = [
  { id: 'catalog', label: 'Жанры каталога KINOSOTA', icon: 'movies' },
  { id: 'torrents', label: 'Жанры Торрентов', icon: 'torrents' },
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
            <TvIcon :name="tab.icon" size="1.2em" />
            <span>{{ tab.label }}</span>
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
            :class="[`theme-${card.theme}`, { 'tv-focused': nav.isFocused(`g${r}`, c) }]"
            :data-tv-key="`g${r}:${c}`"
            :data-testid="`tv-genre-${card.slug}`"
            :aria-label="card.title"
            @click="router.push(tvGenreLocation(card))"
          >
            <span class="tv-genre-glow" aria-hidden="true" />
            <span class="tv-genre-sheen" aria-hidden="true" />
            <span class="tv-genre-icon" aria-hidden="true"><TvIcon :name="card.icon" size="100%" /></span>
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
  display: inline-flex;
  align-items: center;
  gap: 0.6em;
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
  --g1: #1f2433;
  --g2: #0c0f17;
  --accent: #00d2ff;
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 1vh;
  padding: 2.2vh 1.4vw;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background: linear-gradient(135deg, var(--g1) 0%, var(--g2) 100%);
  color: #f5f5f7;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease, border-color 0.22s ease;
  will-change: transform;
}

.theme-fire { --g1: #8f1d2c; --g2: #2a0a10; --accent: #ff6a3d; }
.theme-indigo { --g1: #2b2f9e; --g2: #0b0d33; --accent: #7c8bff; }
.theme-mystic { --g1: #4b1d6b; --g2: #0a0610; --accent: #b46bff; }
.theme-amber { --g1: #a8620f; --g2: #2b1704; --accent: #ffc247; }
.theme-noir { --g1: #1d3557; --g2: #070b14; --accent: #7fb3ff; }
.theme-rose { --g1: #8f2457; --g2: #2a0918; --accent: #ff7ab6; }
.theme-violet { --g1: #5b2a86; --g2: #140a24; --accent: #c49bff; }
.theme-emerald { --g1: #0f6b4f; --g2: #04201a; --accent: #4fe3b0; }
.theme-gold { --g1: #8a6a12; --g2: #231a04; --accent: #f4d45e; }
.theme-ocean { --g1: #0f5f8a; --g2: #04192a; --accent: #00d2ff; }
.theme-steel { --g1: #2b3445; --g2: #0b0e15; --accent: #94a3b8; }

/* Soft light of the genre colour behind the sticker. */
.tv-genre-glow {
  position: absolute;
  top: -30%;
  right: -15%;
  width: 75%;
  height: 120%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent) 0%, transparent 65%);
  opacity: 0.28;
  pointer-events: none;
  transition: opacity 0.22s ease;
}

/* Glass sheen sweeping across the card on focus (transform only). */
.tv-genre-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.22) 50%, transparent 65%);
  transform: translate3d(-120%, 0, 0);
  pointer-events: none;
}

.tv-genre-icon {
  position: absolute;
  top: 14%;
  right: 8%;
  width: clamp(48px, 3.8vw, 110px);
  height: clamp(48px, 3.8vw, 110px);
  color: var(--accent);
  filter: drop-shadow(0 0 10px var(--accent));
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), color 0.22s ease;
}

.tv-genre-title {
  position: relative;
  font-size: clamp(18px, 1.3vw, 34px);
  font-weight: 900;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}

.tv-genre-card.tv-focused {
  color: #fff;
  border-color: #fff;
  box-shadow: 0 0 0 4px rgba(0, 210, 255, 0.35), 0 16px 40px rgba(0, 210, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform: scale(1.08);
}

.tv-genre-card.tv-focused .tv-genre-glow {
  opacity: 0.5;
}

.tv-genre-card.tv-focused .tv-genre-icon {
  color: #fff;
  transform: scale(1.12) rotate(-4deg);
}

.tv-genre-card.tv-focused .tv-genre-sheen {
  transform: translate3d(120%, 0, 0);
  transition: transform 0.9s ease;
}

@media (prefers-reduced-motion: reduce) {
  .tv-genre-card,
  .tv-genre-icon,
  .tv-genre-card.tv-focused .tv-genre-sheen {
    transition: none;
  }
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
