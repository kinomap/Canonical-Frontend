<script setup lang="ts">
/**
 * Title card of the TV layer (/tv/details, same query as /tv/player): backdrop with a cinema gradient,
 * poster, facts and the actions «Смотреть» (default focus) / «В закладки / Кинотеку» (torrent titles:
 * the account library API). Series: seasons strip + episodes carousel, OK on an episode plays exactly it.
 * Torrent releases: the list of sources (quality, size, voices, seeders); the chosen one goes to the player.
 * Data: apiClient.getMovie / getSeriesDetail, torrentsApi.detail, torrentPlaybackApi.sources, libraryApi.
 * «Трейлер» is not shown: no API returns a trailer.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '@/api/client'
import { torrentPlaybackApi, torrentsApi, type TorrentSource, type TorrentSourcesView, type TorrentItem } from '@/api/torrents'
import { libraryApi } from '@/api/library'
import { posterUrl } from '@/utils/poster'
import { useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import { parseTvPlayTarget, tvPlayerLocation, type TvPlayTarget } from './tvPlayback'
import TvIcon from './TvIcon.vue'
import type { TvIconName } from './tvIcons'

interface DetailsEpisode { key: string; season: number; number: number; title: string; episodeId?: string }
interface DetailsAction { id: 'watch' | 'bookmark'; label: string; icon: TvIconName }

const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const target = ref<TvPlayTarget | null>(parseTvPlayTarget(route.query))
const status = ref<'loading' | 'ready' | 'error'>('loading')

const title = ref('')
const originalTitle = ref('')
const poster = ref('')
const backdrop = ref('')
const year = ref<number | null>(null)
const rating = ref<number | null>(null)
const genres = ref<string[]>([])
const runtime = ref<number | null>(null)
const director = ref('')
const overview = ref('')

const episodes = ref<DetailsEpisode[]>([])
const seasonIndex = ref(0)
const sources = ref<TorrentSource[]>([])
const selectedSourceId = ref<string | null>(null)
const saved = ref<boolean | null>(null)

const isTorrent = computed(() => target.value?.src === 'torrent')
const isSeries = computed(() => target.value?.kind === 'tv' || target.value?.kind === 'series')
const ratingLabel = computed(() => (isTorrent.value ? 'TMDB' : 'Рейтинг'))

const seasons = computed(() => [...new Set(episodes.value.map(item => item.season))].sort((a, b) => a - b))
const activeSeason = computed(() => seasons.value[seasonIndex.value] ?? seasons.value[0] ?? null)
const seasonEpisodes = computed(() => episodes.value.filter(item => item.season === activeSeason.value))

const actions = computed<DetailsAction[]>(() => [
  { id: 'watch', label: isSeries.value ? 'Смотреть' : 'Смотреть фильм', icon: 'play' },
  ...(isTorrent.value
    ? [{ id: 'bookmark' as const, label: saved.value ? 'В Кинотеке' : 'В закладки / Кинотеку', icon: (saved.value ? 'check' : 'bookmark') as TvIconName }]
    : []),
])

function qualityRank(source: TorrentSource): number {
  const value = `${source.quality ?? ''} ${source.title}`.toLowerCase()
  if (/2160|4k|uhd/.test(value)) return 4
  if (/1080/.test(value)) return 3
  if (/720/.test(value)) return 2
  return 1
}

function sortSources(list: TorrentSource[]): TorrentSource[] {
  return [...list].sort((a, b) => qualityRank(b) - qualityRank(a) || (b.seeders ?? 0) - (a.seeders ?? 0))
}

const focusedEpisode = ref<DetailsEpisode | null>(null)

/** Sources that hold the chosen episode (all of them for a film). */
const visibleSources = computed(() => {
  const episode = focusedEpisode.value ?? seasonEpisodes.value[0] ?? null
  const list = target.value?.kind === 'tv' && episode
    ? sources.value.filter(source => !source.episodes?.length || source.episodes.some(item => item.season === episode.season && item.episode === episode.number))
    : sources.value
  return sortSources(list.filter(source => source.source_id))
})

const rows = computed<TvRow[]>(() => [
  { id: 'actions', size: status.value === 'ready' ? actions.value.length : 0 },
  ...(isSeries.value ? [{ id: 'seasons', size: seasons.value.length }, { id: 'episodes', size: seasonEpisodes.value.length }] : []),
  ...(isTorrent.value ? [{ id: 'sources', size: visibleSources.value.length }] : []),
])

const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function showNotice(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
}

// ── Formatting ──
function qualityLabel(source: TorrentSource): string {
  const rank = qualityRank(source)
  const base = rank === 4 ? '4K' : rank === 3 ? '1080p' : rank === 2 ? '720p' : (source.quality || 'SD')
  return /hdr|dolby ?vision|\bdv\b/i.test(`${source.title} ${source.file_name ?? ''}`) ? `${base} HDR` : base
}

function sizeLabel(bytes: number): string {
  if (!(bytes > 0)) return ''
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.round(bytes / 1024 ** 2)} МБ`
}

function voicesLabel(source: TorrentSource): string {
  if (source.voices?.length) return source.voices.slice(0, 3).join(', ')
  const names: Record<string, string> = { ru: 'Русский', uk: 'Украинский', en: 'Английский' }
  return (source.languages ?? []).map(lang => names[lang] ?? lang).join(', ')
}

const runtimeLabel = computed(() => {
  const minutes = runtime.value ?? 0
  if (!(minutes > 0)) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} ч ${m} мин` : `${m} мин`
})

// ── Actions ──
function play(choice: { episode?: DetailsEpisode } = {}) {
  const current = target.value
  if (!current) return
  if (current.src === 'catalog') {
    if (current.kind === 'movie') { void router.push(tvPlayerLocation({ src: 'catalog', kind: 'movie', id: current.id })); return }
    const episode = choice.episode ?? seasonEpisodes.value[0] ?? episodes.value[0]
    if (!episode?.episodeId) { showNotice('Серии ещё готовятся. Попробуйте чуть позже.'); return }
    void router.push(tvPlayerLocation({ src: 'catalog', kind: 'series', id: current.id, episodeId: episode.episodeId }))
    return
  }
  const episode = current.kind === 'tv' ? (choice.episode ?? focusedEpisode.value ?? seasonEpisodes.value[0] ?? episodes.value[0]) : undefined
  const fits = (source: TorrentSource) => !episode || !source.episodes?.length || source.episodes.some(item => item.season === episode.season && item.episode === episode.number)
  const chosen = sources.value.find(source => source.source_id === selectedSourceId.value && fits(source))
  void router.push(tvPlayerLocation({
    src: 'torrent',
    kind: current.kind,
    id: current.id,
    ...(episode ? { season: episode.season, episode: episode.number } : {}),
    ...(chosen?.source_id ? { sourceId: chosen.source_id } : {}),
  }))
}

async function toggleBookmark() {
  const current = target.value
  if (!current || current.src !== 'torrent') return
  const next = !saved.value
  try {
    const result = await libraryApi.set(current.kind, Number(current.id), next)
    saved.value = result.saved
    showNotice(result.saved ? 'Добавлено в Кинотеку' : 'Убрано из Кинотеки')
  } catch (error) {
    const code = (error as { status?: number } | null)?.status
    showNotice(code === 401 ? 'Войдите в аккаунт: «Профиль» в меню ТВ.' : 'Не удалось обновить Кинотеку. Попробуйте ещё раз.')
  }
}

function onSelect(selected: TvSelectTarget) {
  if (selected.area !== 'content') return
  if (selected.rowId === 'actions') {
    const action = actions.value[selected.index]
    if (action?.id === 'watch') play()
    else if (action?.id === 'bookmark') void toggleBookmark()
    return
  }
  if (selected.rowId === 'seasons') { seasonIndex.value = selected.index; return }
  if (selected.rowId === 'episodes') { const episode = seasonEpisodes.value[selected.index]; if (episode) play({ episode }); return }
  if (selected.rowId === 'sources') {
    const source = visibleSources.value[selected.index]
    if (source?.source_id) { selectedSourceId.value = source.source_id; showNotice(`Выбрана раздача ${qualityLabel(source)}`) }
  }
}

function leave() {
  const back = (router.options.history.state as { back?: unknown } | undefined)?.back
  if (typeof back === 'string' && back.startsWith('/tv') && !back.startsWith('/tv/player') && !back.startsWith('/tv/details')) router.back()
  else void router.replace('/tv')
}

function onBack(): boolean {
  if (nav.currentRow.value && nav.currentRow.value.id !== 'actions') { nav.focusRow('actions', 0); return true }
  leave()
  return true
}

const nav = useTvNavigation({ rows, root, onSelect, onBack })

/** Moving along the seasons strip switches the episodes carousel; the focused episode filters the sources. */
watch(() => nav.focusKey.value, (key) => {
  if (!key) return
  if (key.startsWith('seasons:')) seasonIndex.value = Number(key.slice(8))
  if (key.startsWith('episodes:')) focusedEpisode.value = seasonEpisodes.value[Number(key.slice(9))] ?? null
})

function focusedIndexOf(rowId: string): number {
  const row = nav.currentRow.value
  if (!row || row.id !== rowId) return -1
  const key = nav.focusKey.value ?? ''
  return Number(key.slice(key.lastIndexOf(':') + 1))
}

// ── Loading ──
function applyTorrent(detail: TorrentItem) {
  title.value = detail.title
  originalTitle.value = detail.original_title && detail.original_title !== detail.title ? detail.original_title : ''
  poster.value = detail.poster ?? ''
  backdrop.value = detail.backdrop ?? ''
  year.value = detail.year ?? null
  rating.value = detail.rating > 0 ? detail.rating : null
  genres.value = (detail.genres ?? []).map(g => g.name.slice(0, 1).toLocaleUpperCase('ru-RU') + g.name.slice(1))
  runtime.value = detail.runtime ?? null
  director.value = detail.director_list?.[0]?.name ?? detail.directors?.[0] ?? ''
  overview.value = detail.overview ?? ''
}

function torrentEpisodes(view: TorrentSourcesView | null, detail: TorrentItem | null): DetailsEpisode[] {
  const make = (season: number, number: number): DetailsEpisode => ({ key: `${season}-${number}`, season, number, title: `Серия ${number}` })
  if (view?.seasons?.length) return view.seasons.flatMap(season => season.episodes.map(item => make(season.season, item.episode)))
  if (view?.episodes?.length) return view.episodes.map(item => make(item.season, item.episode))
  return (detail?.season_list ?? []).filter(s => s.season > 0).flatMap(s => Array.from({ length: s.episodes }, (_, i) => make(s.season, i + 1)))
}

async function load() {
  const current = target.value
  if (!current) { status.value = 'error'; return }
  status.value = 'loading'
  try {
    if (current.src === 'torrent') {
      const [detail, view, membership] = await Promise.allSettled([
        torrentsApi.detail(current.kind, current.id),
        torrentPlaybackApi.sources(current.kind, Number(current.id)),
        libraryApi.membership([`${current.kind}:${current.id}`]),
      ])
      if (detail.status !== 'fulfilled') throw detail.reason
      applyTorrent(detail.value)
      const sourcesView = view.status === 'fulfilled' ? view.value : null
      sources.value = sourcesView?.sources ?? []
      selectedSourceId.value = sourcesView?.selected_source_id ?? sortSources(sources.value)[0]?.source_id ?? null
      if (current.kind === 'tv') episodes.value = torrentEpisodes(sourcesView, detail.value)
      saved.value = membership.status === 'fulfilled' ? membership.value.saved.includes(`${current.kind}:${current.id}`) : null
    } else if (current.kind === 'movie') {
      const movie = await apiClient.getMovie(current.id)
      title.value = movie.title
      originalTitle.value = movie.original_title && movie.original_title !== movie.title ? movie.original_title : ''
      poster.value = posterUrl(movie.poster) ?? ''
      backdrop.value = movie.backdrop || ''
      year.value = movie.year ?? null
      rating.value = movie.rating && movie.rating > 0 ? movie.rating : null
      genres.value = (movie.genres ?? []).map(g => g.name)
      runtime.value = movie.runtime ?? null
      overview.value = movie.overview ?? ''
    } else {
      const series = await apiClient.getSeriesDetail(current.id)
      title.value = series.title
      originalTitle.value = series.original_title && series.original_title !== series.title ? series.original_title : ''
      poster.value = posterUrl(series.poster_url) ?? ''
      backdrop.value = series.backdrop_url || ''
      year.value = series.year ?? null
      rating.value = series.rating && series.rating > 0 ? series.rating : null
      genres.value = (series.genres ?? []).map(g => g.name)
      overview.value = series.overview ?? ''
      episodes.value = [...series.seasons]
        .sort((a, b) => a.season_number - b.season_number)
        .flatMap(season => [...season.episodes]
          .filter(item => item.is_playable !== false)
          .sort((a, b) => a.episode_number - b.episode_number)
          .map(item => ({ key: item.id, season: season.season_number, number: item.episode_number, title: item.title || `Серия ${item.episode_number}`, episodeId: item.id })))
    }
    status.value = 'ready'
    nav.focusRow('actions', 0)
  } catch {
    status.value = 'error'
  }
}

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  void load()
})

onBeforeUnmount(() => {
  clearTimeout(noticeTimer)
  document.documentElement.classList.remove('tv-mode')
})

defineExpose({ load, play })
</script>

<template>
  <div ref="root" class="tv-details" data-testid="tv-details">
    <img v-if="backdrop || poster" class="tv-details-bg" :class="{ blur: !backdrop }" :src="backdrop || poster" alt="" />
    <div class="tv-details-shade" aria-hidden="true" />

    <p v-if="status === 'loading'" class="tv-details-status" data-testid="tv-details-loading">Загружаем…</p>
    <section v-else-if="status === 'error'" class="tv-details-status" role="alert" data-testid="tv-details-error">
      <h2>Не удалось загрузить карточку</h2>
      <p>Нажмите «Назад», чтобы вернуться в каталог.</p>
    </section>

    <div v-else class="tv-details-body">
      <div class="tv-details-top">
        <img v-if="poster" class="tv-details-poster" :src="poster" alt="" />
        <div class="tv-details-info">
          <h1 data-testid="tv-details-title">{{ title }}</h1>
          <p v-if="originalTitle" class="tv-details-original">{{ originalTitle }}</p>
          <p class="tv-details-facts" data-testid="tv-details-facts">
            <span v-if="rating" class="tv-details-rating">★ {{ rating.toFixed(1) }} <small>{{ ratingLabel }}</small></span>
            <span v-if="year">{{ year }}</span>
            <span v-if="runtimeLabel">{{ runtimeLabel }}</span>
            <span v-if="genres.length">{{ genres.slice(0, 3).join(', ') }}</span>
          </p>
          <p v-if="director" class="tv-details-director">Режиссёр: {{ director }}</p>
          <p v-if="overview" class="tv-details-overview">{{ overview }}</p>
          <div class="tv-details-actions">
            <button
              v-for="(action, index) in actions"
              :key="action.id"
              type="button"
              class="tv-details-btn"
              :class="{ primary: action.id === 'watch', 'tv-focused': nav.isFocused('actions', index) }"
              :data-tv-key="`actions:${index}`"
              :data-testid="`tv-details-${action.id}`"
              @click="onSelect({ area: 'content', rowId: 'actions', index })"
            >
              <TvIcon class="tv-details-btn-icon" :name="action.icon" size="1.2em" />
              <span>{{ action.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <section v-if="isSeries && seasons.length" class="tv-details-strip" aria-label="Сезоны" data-testid="tv-details-seasons">
        <button
          v-for="(season, index) in seasons"
          :key="season"
          type="button"
          class="tv-details-chip"
          :class="{ active: index === seasonIndex, 'tv-focused': nav.isFocused('seasons', index) }"
          :data-tv-key="`seasons:${index}`"
          :data-testid="`tv-details-season-${season}`"
          @click="seasonIndex = index"
        >
          Сезон {{ season }}
        </button>
      </section>

      <section v-if="isSeries" class="tv-details-carousel" aria-label="Серии" data-testid="tv-details-episodes">
        <p v-if="!seasonEpisodes.length" class="tv-details-muted">Серии этого сезона ещё готовятся.</p>
        <button
          v-for="(episode, index) in seasonEpisodes"
          :key="episode.key"
          type="button"
          class="tv-details-episode"
          :class="{ 'tv-focused': nav.isFocused('episodes', index) }"
          :data-tv-key="`episodes:${index}`"
          :data-testid="`tv-details-episode-${episode.season}-${episode.number}`"
          @click="play({ episode })"
        >
          <span class="tv-details-frame" :style="backdrop ? { backgroundImage: `url('${backdrop}')` } : undefined">
            <span class="tv-details-ep-num">{{ episode.number }}</span>
          </span>
          <span class="tv-details-ep-title">{{ episode.title }}</span>
        </button>
      </section>

      <section v-if="isTorrent" class="tv-details-sources" aria-label="Раздачи" data-testid="tv-details-sources">
        <h2>Раздачи</h2>
        <p v-if="!visibleSources.length" class="tv-details-muted" data-testid="tv-details-no-sources">Раздачи ещё подбираются: «Смотреть» запустит лучшую доступную.</p>
        <div class="tv-details-source-list">
          <button
            v-for="(source, index) in visibleSources"
            :key="source.source_id ?? index"
            type="button"
            class="tv-details-source"
            :class="{ active: source.source_id === selectedSourceId, 'tv-focused': nav.isFocused('sources', index) }"
            :data-tv-key="`sources:${index}`"
            :data-testid="`tv-details-source-${index}`"
            @click="onSelect({ area: 'content', rowId: 'sources', index })"
          >
            <strong class="tv-details-quality">{{ qualityLabel(source) }}</strong>
            <span v-if="sizeLabel(source.size_bytes)">{{ sizeLabel(source.size_bytes) }}</span>
            <span v-if="voicesLabel(source)" class="tv-details-voices">{{ voicesLabel(source) }}</span>
            <span class="tv-details-seeds"><i class="tv-details-seeds-dot" aria-hidden="true" />{{ source.seeders }} сидов</span>
          </button>
        </div>
      </section>
    </div>

    <p v-if="notice" class="tv-details-notice" role="status" aria-live="polite" data-testid="tv-notice">{{ notice }}</p>
    <p class="tv-details-hint">OK — выбрать · ↑/↓ — разделы · Назад — в каталог</p>
  </div>
</template>

<style scoped>
.tv-details {
  position: fixed;
  inset: 0;
  z-index: 250;
  overflow-x: hidden;
  overflow-y: auto;
  background: #07080b;
  color: #f5f5f7;
  scrollbar-width: none;
}

.tv-details::-webkit-scrollbar { display: none; }

.tv-details-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tv-details-bg.blur { filter: blur(30px) brightness(0.6); transform: scale(1.15); }

.tv-details-shade {
  position: fixed;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(7, 8, 11, 0.97) 0%, rgba(7, 8, 11, 0.75) 45%, rgba(7, 8, 11, 0.25) 100%),
    linear-gradient(0deg, rgba(7, 8, 11, 0.95) 0%, rgba(7, 8, 11, 0) 60%);
}

.tv-details-body, .tv-details-status { position: relative; padding: 8vh 5vw 10vh; }
.tv-details-top { display: flex; gap: 3vw; align-items: flex-start; }
.tv-details-poster { width: 16vw; max-width: 340px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 18px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
.tv-details-info { max-width: 56vw; }
.tv-details-info h1 { margin: 0; font-size: clamp(34px, 3.2vw, 86px); font-weight: 900; line-height: 1.05; }
.tv-details-original { margin: 0.8vh 0 0; color: #9ca3af; font-size: clamp(16px, 1.1vw, 28px); }
.tv-details-facts { display: flex; flex-wrap: wrap; gap: 1.4vw; margin: 2vh 0 1vh; color: #e5e7eb; font-size: clamp(16px, 1.1vw, 28px); font-weight: 700; }
.tv-details-rating { color: #f4d45e; }
.tv-details-rating small { color: #9ca3af; font-weight: 600; }
.tv-details-director { margin: 0 0 1.4vh; color: #cbd5e1; font-size: clamp(15px, 1vw, 26px); }
.tv-details-overview { display: -webkit-box; margin: 0 0 3vh; overflow: hidden; color: #cbd5e1; font-size: clamp(15px, 1vw, 26px); line-height: 1.5; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.tv-details-actions { display: flex; gap: 1.2vw; }

.tv-details-btn, .tv-details-chip, .tv-details-source {
  border: 3px solid transparent;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.09);
  color: #e5e7eb;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.tv-details-btn { padding: 1.4vh 2vw; font-size: clamp(17px, 1.2vw, 30px); }
.tv-details-btn.primary { background: #f4d45e; color: #0d0e12; }
.tv-details-chip { padding: 1vh 1.6vw; font-size: clamp(15px, 1vw, 26px); }
.tv-details-chip.active { background: rgba(244, 212, 94, 0.18); color: #f4d45e; }

.tv-focused {
  border-color: #00d2ff !important;
  box-shadow: 0 0 0 4px rgba(0, 210, 255, 0.25), 0 0 32px rgba(0, 210, 255, 0.6);
  transform: scale(1.05);
}

.tv-details-strip { display: flex; gap: 1vw; margin-top: 5vh; overflow-x: auto; scrollbar-width: none; padding: 1vh 0.4vw; }
.tv-details-carousel { display: flex; gap: 1.4vw; margin-top: 2vh; padding: 1.6vh 0.4vw; overflow-x: auto; scrollbar-width: none; }
.tv-details-episode { flex: none; width: 18vw; padding: 0; border: 3px solid transparent; border-radius: 16px; background: transparent; color: #e5e7eb; font: inherit; text-align: left; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
.tv-details-frame { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 13px; background: #1a1f2e center/cover no-repeat; overflow: hidden; }
.tv-details-ep-num { position: absolute; left: 12px; bottom: 8px; font-size: clamp(26px, 2vw, 54px); font-weight: 900; text-shadow: 0 4px 18px rgba(0, 0, 0, 0.8); }
.tv-details-ep-title { display: block; padding: 1vh 0.4vw 0; font-size: clamp(14px, 0.95vw, 24px); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.tv-details-sources { margin-top: 5vh; }
.tv-details-sources h2 { margin: 0 0 1.6vh; font-size: clamp(20px, 1.5vw, 40px); }
/* A horizontal strip of release cards: ←/→ walk it like every other row of the remote model. */
.tv-details-source-list { display: flex; gap: 1.2vw; padding: 1.2vh 0.4vw; overflow-x: auto; scrollbar-width: none; }
.tv-details-source { flex: none; width: 20vw; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6vh; padding: 1.6vh 1.4vw; font-size: clamp(15px, 1vw, 26px); text-align: left; }
.tv-details-source.active { background: rgba(244, 212, 94, 0.14); }
.tv-details-quality { color: #f4d45e; font-size: 1.2em; }
.tv-details-voices { max-width: 100%; color: #cbd5e1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-details-seeds { color: #4ade80; }
.tv-details-seeds-dot { display: inline-block; width: 0.55em; height: 0.55em; margin-right: 0.45em; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px rgba(74, 222, 128, 0.8); }
.tv-details-muted { color: #9ca3af; font-size: clamp(15px, 1vw, 26px); }

.tv-details-notice { position: fixed; z-index: 30; right: 4vw; bottom: 8vh; margin: 0; padding: 1.4vh 1.6vw; border-radius: 14px; background: rgba(17, 19, 26, 0.95); color: #fff; font-size: clamp(16px, 1.1vw, 28px); font-weight: 700; }
.tv-details-hint { position: fixed; left: 5vw; bottom: 3vh; margin: 0; color: #6b7280; font-size: clamp(13px, 0.85vw, 22px); }

.tv-details-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6em;
}

.tv-details-btn.tv-focused .tv-details-btn-icon {
  filter: drop-shadow(0 0 6px rgba(0, 210, 255, 0.9));
}
</style>
