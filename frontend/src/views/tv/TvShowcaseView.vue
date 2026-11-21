<script setup lang="ts">
/**
 * Category showcase of the TV layer: rotating hero + independent shelves (tvShowcases.ts), remote-driven.
 * One lazy chunk serves /tv/movies, /tv/series, /tv/torrents, /tv/torrents/movies, /tv/torrents/series,
 * /tv/genres/:source/:slug and /tv/library (route meta `showcase`). OK on a card opens the title card.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import type { TorrentKind } from '@/api/torrents'
import TvSideMenu from './TvSideMenu.vue'
import TvShelf from './TvShelf.vue'
import TvShowcaseHero from './TvShowcaseHero.vue'
import { TV_MENU_ITEMS } from './tvMenu'
import { useTvMenu } from './useTvMenu'
import { tvShowcase, type TvShowcaseId, type TvShowcaseSpec } from './tvShowcases'
import { tvDetailsLocation } from './tvPlayback'
import type { TvCard } from './tvCards'

const HERO_ROTATE_MS = 8000

const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

interface ShelfState { id: string; title: string; cards: TvCard[] }

const spec = ref<TvShowcaseSpec | null>(null)
const heroCards = ref<TvCard[]>([])
const heroIndex = ref(0)
const shelves = ref<ShelfState[]>([])
const loading = ref(true)
const visibleShelves = computed(() => shelves.value.filter(shelf => shelf.cards.length > 0))

const rows = computed<TvRow[]>(() => [
  { id: 'hero', size: heroCards.value.length ? 1 : 0 },
  ...shelves.value.map(shelf => ({ id: shelf.id, size: shelf.cards.length })),
])

const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function showNotice(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
}

const menu = useTvMenu(showNotice)

function openCard(card: TvCard | undefined) {
  if (card) void router.push(tvDetailsLocation(card.play))
}

function onSelect(target: TvSelectTarget) {
  if (target.area === 'menu') { menu.open(target.index); return }
  if (target.rowId === 'hero') { openCard(heroCards.value[heroIndex.value]); return }
  openCard(shelves.value.find(shelf => shelf.id === target.rowId)?.cards[target.index])
}

function leave() {
  const back = (router.options.history.state as { back?: unknown } | undefined)?.back
  if (typeof back === 'string' && back.startsWith('/tv') && !back.startsWith('/tv/player')) router.back()
  else void router.replace('/tv')
}

/** Back on a shelf returns to the hero; on the hero it leaves the showcase. */
function onBack(): boolean {
  const row = nav.currentRow.value
  if (row && row.id !== 'hero' && heroCards.value.length) { nav.focusRow('hero'); return true }
  leave()
  return true
}

const nav = useTvNavigation({ rows, menuSize: TV_MENU_ITEMS.length, memoryKey: `showcase:${route.fullPath}`, onSelect, onBack, root })

const menuFocusedIndex = computed(() => (nav.area.value === 'menu' ? nav.menuIndex.value : -1))

function focusedIndexOf(rowId: string): number {
  const row = nav.currentRow.value
  if (nav.area.value !== 'content' || !row || row.id !== rowId) return -1
  const key = nav.focusKey.value ?? ''
  return Number(key.slice(key.lastIndexOf(':') + 1))
}

function onMenuClick(index: number) {
  nav.closeMenu()
  menu.open(index)
}

// ── Hero rotation (paused while the hero holds the focus, so OK opens what is on screen) ──
let rotateTimer: ReturnType<typeof setInterval> | undefined
function startRotation() {
  clearInterval(rotateTimer)
  rotateTimer = setInterval(() => {
    if (heroCards.value.length < 2 || nav.isFocused('hero', 0)) return
    heroIndex.value = (heroIndex.value + 1) % heroCards.value.length
  }, HERO_ROTATE_MS)
}

function text(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item.trim() : ''
}

function currentSpec(): TvShowcaseSpec {
  const id = (route.meta.showcase as TvShowcaseId | undefined) ?? 'movies'
  const kinds = text(route.query.kinds).split(',').filter((k): k is TorrentKind => k === 'movie' || k === 'tv')
  return tvShowcase(id, {
    source: text(route.params.source) || undefined,
    slug: text(route.params.slug) || undefined,
    name: text(route.query.name) || undefined,
    kinds,
  })
}

let controller: AbortController | null = null

async function load() {
  controller?.abort()
  const ctrl = new AbortController()
  controller = ctrl
  const next = currentSpec()
  spec.value = next
  heroCards.value = []
  heroIndex.value = 0
  loading.value = true
  shelves.value = next.shelves.map(shelf => ({ id: shelf.id, title: shelf.title, cards: [] }))
  const tasks = [
    next.hero(ctrl.signal).then(cards => { if (!ctrl.signal.aborted) heroCards.value = cards }).catch(() => {}),
    ...next.shelves.map(shelf => shelf.load(ctrl.signal)
      .then(cards => {
        if (ctrl.signal.aborted) return
        const state = shelves.value.find(item => item.id === shelf.id)
        if (state) state.cards = cards
      })
      .catch(() => { /* a failed shelf is hidden, the rest of the showcase keeps working */ })),
  ]
  await Promise.all(tasks)
  if (!ctrl.signal.aborted) loading.value = false
}

watch(() => route.fullPath, (path, old) => { if (old !== undefined && route.meta.showcase) void load() })

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  void load()
  startRotation()
})

onBeforeUnmount(() => {
  controller?.abort()
  clearInterval(rotateTimer)
  clearTimeout(noticeTimer)
  document.documentElement.classList.remove('tv-mode')
})

defineExpose({ load })
</script>

<template>
  <div ref="root" class="tv-layer" data-testid="tv-showcase">
    <TvSideMenu :open="nav.menuOpen.value" :focused-index="menuFocusedIndex" :active-index="menu.activeIndex.value" @select="onMenuClick" />

    <div class="tv-content">
      <TvShowcaseHero
        :cards="heroCards"
        :index="heroIndex"
        :focused="nav.isFocused('hero', 0)"
        :title="spec?.title ?? ''"
        :subtitle="spec?.subtitle ?? ''"
        @open="openCard(heroCards[heroIndex])"
      />

      <TvShelf
        v-for="shelf in visibleShelves"
        :id="shelf.id"
        :key="shelf.id"
        :title="shelf.title"
        :cards="shelf.cards"
        :focused-index="focusedIndexOf(shelf.id)"
        @select="index => openCard(shelf.cards[index])"
      />

      <p v-if="loading && !visibleShelves.length" class="tv-status">Загружаем подборки…</p>
      <p v-else-if="!loading && !visibleShelves.length" class="tv-status" data-testid="tv-showcase-empty">{{ spec?.emptyText }}</p>
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
