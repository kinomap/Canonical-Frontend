/**
 * Detail-page watch state: live preparation progress, quality / voice / episode
 * choice and the KINOSOTA Player hand-off. Server data is authoritative; the
 * page only remembers what the user picked.
 */
import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import { ApiError } from '@/api/client'
import {
  torrentPlaybackApi,
  type StreamChoice,
  type TorrentEpisode,
  type TorrentItem,
  type TorrentLanguage,
  type TorrentPlaybackStatus,
  type TorrentSource,
  type TorrentSourcesView,
} from '@/api/torrents'
import { IN_PROGRESS, PREP_PROGRESS } from '@/api/preparation'
import { useLibrary } from '@/stores/library'
import { openDeepLink, waitForPlayer } from '@/lib/desktopLaunch'

export const POLL_MS = 4000
/** Pill text; RU / UA get a CSS-drawn flag (flag emoji are not rendered on Windows). */
export const LANGUAGE_LABELS: Record<TorrentLanguage, string> = { ru: 'RU', uk: 'UA', en: 'EN' }
export const LANGUAGE_FLAGS: Record<TorrentLanguage, boolean> = { ru: true, uk: true, en: false }
export const LANGUAGE_NAMES: Record<TorrentLanguage, string> = { ru: 'Русская озвучка', uk: 'Украинская озвучка', en: 'Английская дорожка' }

export type ProgressView = { status: TorrentPlaybackStatus; progress: number; startMs: number | null; label?: string }
export type WatchAction =
  | 'checking' | 'subscribe' | 'loading' | 'retry' | 'library' | 'discover'
  | 'prepare' | 'wait' | 'missing' | 'launch'
type Prefs = { quality?: string | null; language?: TorrentLanguage | null; episode?: TorrentEpisode | null }

/** Titles already re-searched in this tab (the server also enforces a cooldown). */
const autoDiscovered = new Set<string>()

export const hasEpisode = (source: TorrentSource, e: TorrentEpisode) =>
  source.episodes.some((x) => x.season === e.season && x.episode === e.episode)

function rank(s: TorrentSource, p: Prefs): number[] {
  return [
    s.state === 'failed' ? 1 : 0,
    p.quality && s.quality !== p.quality ? 1 : 0,
    p.language && !s.languages.includes(p.language) ? 1 : 0,
    p.episode && !hasEpisode(s, p.episode) ? 1 : 0,
    s.state === 'ready' ? 0 : 1,
    -s.seeders,
    -s.size_bytes,
  ]
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** Prefer working, matching, already prepared, then best-seeded sources. */
export function bestSource(list: TorrentSource[], prefs: Prefs = {}): TorrentSource | null {
  let best: TorrentSource | null = null
  let bestRank: number[] = []
  for (const source of list) {
    const r = rank(source, prefs)
    if (!best || compareRank(r, bestRank) < 0) { best = source; bestRank = r }
  }
  return best
}

const inFlight = (v: TorrentSourcesView) =>
  v.discovering || IN_PROGRESS.includes(v.status.status) || v.sources.some((s) => s.state === 'queued' || s.state === 'loading')

export function useTorrentWatch(item: Ref<TorrentItem | null>, access: Ref<boolean | null>) {
  const library = useLibrary()
  const view = ref<TorrentSourcesView | null>(null)
  const loadError = ref(false)
  const selectedId = ref<string | null | undefined>(undefined)
  const language = ref<TorrentLanguage | null>(null)
  const season = ref<number | null>(null)
  const episode = ref<number | null>(null)
  const busy = ref<'' | 'prepare' | 'discover' | 'library' | 'launch'>('')
  const message = ref('')
  const error = ref('')
  const installPrompt = ref(false)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let launchController: AbortController | undefined

  const key = computed(() => (item.value ? `${item.value.kind}:${item.value.tmdb_id}` : ''))
  const isTv = computed(() => item.value?.kind === 'tv')
  const sources = computed(() => view.value?.sources ?? [])
  const selected = computed<TorrentSource | null>(() => {
    const list = sources.value
    if (!list.length) return null
    if (selectedId.value !== undefined) {
      const hit = list.find((s) => s.source_id === selectedId.value)
      if (hit) return hit
    }
    return list.find((s) => s.default) ?? bestSource(list)
  })
  const audioLanguage = computed<TorrentLanguage | null>(() => {
    const langs = selected.value?.languages ?? []
    if (language.value && (langs.includes(language.value) || !langs.length)) return language.value
    return langs.includes('ru') ? 'ru' : (langs[0] ?? null)
  })

  const knownEpisodes = computed<TorrentEpisode[]>(() => {
    const seen = new Map<string, TorrentEpisode>()
    for (const e of [...(view.value?.episodes ?? []), ...(selected.value?.episodes ?? [])]) seen.set(`${e.season}:${e.episode}`, e)
    return [...seen.values()].sort((a, b) => a.season - b.season || a.episode - b.episode)
  })
  const showEpisodes = computed(() => isTv.value && knownEpisodes.value.length > 0)
  const seasonOptions = computed(() => {
    const available = new Set(knownEpisodes.value.map((e) => e.season))
    const options = new Map<number, { value: number; label: string; episodes: number; available: boolean }>()
    for (const s of item.value?.season_list ?? []) {
      if (s.season > 0 || available.has(s.season)) options.set(s.season, { value: s.season, label: s.season ? `Сезон ${s.season}` : 'Спецвыпуски', episodes: s.episodes, available: available.has(s.season) })
    }
    for (const n of available) if (!options.has(n)) options.set(n, { value: n, label: n ? `Сезон ${n}` : 'Спецвыпуски', episodes: 0, available: true })
    return [...options.values()].sort((a, b) => a.value - b.value)
  })
  const episodeOptions = computed(() => {
    if (season.value === null) return []
    const available = new Set(knownEpisodes.value.filter((e) => e.season === season.value).map((e) => e.episode))
    const count = Math.min(2000, Math.max(seasonOptions.value.find((s) => s.value === season.value)?.episodes ?? 0, 0, ...available))
    return Array.from({ length: count }, (_, i) => ({ value: i + 1, available: available.has(i + 1) }))
  })
  const currentEpisode = computed<TorrentEpisode | null>(() =>
    showEpisodes.value && season.value !== null && episode.value !== null ? { season: season.value, episode: episode.value } : null)
  const episodeReady = computed(() => !currentEpisode.value || (!!selected.value && hasEpisode(selected.value, currentEpisode.value)))
  watch(knownEpisodes, (list) => {
    if (!isTv.value || !list.length || (season.value !== null && episode.value !== null)) return
    const first = selected.value?.episodes[0] ?? list[0]
    season.value = first.season
    episode.value = first.episode
  }, { immediate: true })

  const progress = computed<ProgressView | null>(() => {
    const v = view.value
    if (access.value !== true || !v?.allowed) return null
    const s = selected.value
    if (s && !s.default) {
      if (s.state === 'failed') return { status: 'unavailable', progress: 0, startMs: null, label: 'Раздача не отвечает' }
      if (s.state === 'candidate') return { status: 'queued', progress: 0, startMs: null, label: 'Раздача не подготовлена' }
      const status: TorrentPlaybackStatus = s.state === 'ready' ? 'playable' : s.state === 'loading' ? 'loading' : 'queued'
      return { status, progress: s.progress, startMs: s.start_ms }
    }
    const st = v.status.status
    if (st === 'not_queued') return null
    return { status: st, progress: v.status.progress ?? PREP_PROGRESS[st], startMs: v.status.start_ms ?? s?.start_ms ?? null }
  })

  const action = computed<WatchAction>(() => {
    if (access.value === null) return 'checking'
    if (access.value === false) return 'subscribe'
    const v = view.value
    if (!v) return loadError.value ? 'retry' : 'loading'
    if (!v.allowed) return 'subscribe'
    const s = selected.value
    if (s?.state === 'ready') return episodeReady.value ? 'launch' : 'missing'
    if (s && s.source_id && (s.state === 'candidate' || s.state === 'failed')) return 'prepare'
    if (s && (s.state === 'queued' || s.state === 'loading')) return 'wait'
    const st = v.status.status
    if (IN_PROGRESS.includes(st) || v.discovering) return 'wait'
    if (st === 'not_queued') return v.in_library ? 'discover' : 'library'
    return 'discover'
  })
  const choice = computed<StreamChoice>(() => ({
    source_id: selected.value?.source_id ?? null,
    season: currentEpisode.value?.season ?? null,
    episode: currentEpisode.value?.episode ?? null,
  }))

  function schedule() {
    clearTimeout(timer)
    const v = view.value
    if (!v || !inFlight(v)) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    timer = setTimeout(() => { void refresh() }, loadError.value ? POLL_MS * 2 : POLL_MS)
  }

  async function refresh() {
    const target = item.value
    if (!target || access.value !== true) return
    const version = generation
    clearTimeout(timer)
    controller?.abort()
    controller = new AbortController()
    try {
      const result = await torrentPlaybackApi.sources(target.kind, target.tmdb_id, controller.signal)
      if (version !== generation) return
      view.value = result
      loadError.value = false
      autoDiscover(result)
    } catch (e) {
      if (version !== generation || (e instanceof Error && e.name === 'AbortError')) return
      loadError.value = true
    }
    if (version === generation) schedule()
  }

  /** A title prepared before alternatives were tracked: look once for other qualities/voices. */
  function autoDiscover(v: TorrentSourcesView) {
    const target = item.value
    if (!target || !v.allowed || !v.in_library || v.discovering) return
    if (v.status.status !== 'playable' && v.status.status !== 'partial') return
    if (v.sources.filter((s) => s.state !== 'failed').length > 1) return
    const k = `${target.kind}:${target.tmdb_id}`
    if (autoDiscovered.has(k)) return
    autoDiscovered.add(k)
    torrentPlaybackApi.discover(target.kind, target.tmdb_id)
      .then((r) => { if (r.result === 'queued' && key.value === k) void refresh() })
      .catch(() => { /* optional refresh */ })
  }

  function choose(source: TorrentSource | null) {
    if (!source) return
    selectedId.value = source.source_id
    error.value = ''
    if (source.source_id && (source.state === 'candidate' || source.state === 'failed')) void prepare(source)
  }
  function pickQuality(quality: string) {
    const options = sources.value.filter((s) => s.quality === quality && s.state !== 'failed')
    if (selected.value?.quality === quality) return
    choose(bestSource(options, { language: language.value, episode: currentEpisode.value }))
  }
  function pickLanguage(lang: TorrentLanguage) {
    language.value = lang
    if (selected.value?.languages.includes(lang)) return
    const options = sources.value.filter((s) => s.languages.includes(lang) && s.state !== 'failed')
    choose(bestSource(options, { quality: selected.value?.quality, episode: currentEpisode.value }))
  }
  function followEpisode() {
    const e = currentEpisode.value
    if (!e || !selected.value || hasEpisode(selected.value, e)) return
    const options = sources.value.filter((s) => s.state === 'ready' && hasEpisode(s, e))
    const alt = bestSource(options, { quality: selected.value.quality, language: audioLanguage.value })
    if (alt) selectedId.value = alt.source_id
  }
  function pickSeason(value: number) {
    if (!Number.isInteger(value)) return
    season.value = value
    const inSeason = knownEpisodes.value.filter((e) => e.season === value)
    episode.value = (selected.value?.episodes.find((e) => e.season === value) ?? inSeason[0])?.episode ?? 1
    followEpisode()
  }
  function pickEpisode(value: number) {
    if (!Number.isInteger(value) || value < 1) return
    episode.value = value
    followEpisode()
  }

  async function prepare(source: TorrentSource | null = selected.value) {
    if (!source?.source_id || busy.value) return
    busy.value = 'prepare'
    error.value = ''
    try {
      await torrentPlaybackApi.prepareSource(source.source_id)
      message.value = 'Раздача поставлена в очередь на проверку'
    } catch (e) {
      error.value = e instanceof ApiError && (e.status === 429 || e.status === 404) ? e.message : 'Не удалось поставить раздачу в очередь. Повторите попытку.'
    } finally {
      busy.value = ''
    }
    await refresh()
  }

  async function discover() {
    const target = item.value
    if (!target || busy.value) return
    busy.value = 'discover'
    error.value = ''
    message.value = ''
    try {
      const { result } = await torrentPlaybackApi.discover(target.kind, target.tmdb_id)
      message.value = result === 'cooldown' ? 'Повторный поиск станет доступен чуть позже'
        : result === 'no_demand' ? 'Добавьте запись в кинотеку, чтобы начать поиск' : 'Ищем раздачи…'
    } catch (e) {
      error.value = e instanceof ApiError && e.status < 500 ? e.message : 'Не удалось запустить поиск. Повторите попытку.'
    } finally {
      busy.value = ''
    }
    await refresh()
  }

  /** «Смотреть» on a title nobody asked for yet: save it, the server starts the search. */
  async function addToLibrary() {
    const target = item.value
    if (!target || busy.value) return
    const row = library.entry(target)
    if (row.saved || view.value?.in_library) { await discover(); return }
    if (!row.known) { library.ensure(target); message.value = 'Проверяем кинотеку… Нажмите ещё раз'; return }
    busy.value = 'library'
    error.value = ''
    try {
      await library.toggle(target)
      const after = library.entry(target)
      if (after.saved) message.value = 'Добавлено в кинотеку — ищем раздачи'
      else if (after.error) error.value = after.error
    } finally {
      busy.value = ''
    }
  }

  async function launch() {
    const target = item.value
    const source = selected.value
    if (!target || !source || busy.value) return
    launchController?.abort()
    const ctl = new AbortController()
    launchController = ctl
    busy.value = 'launch'
    error.value = ''
    message.value = ''
    installPrompt.value = false
    try {
      const res = await torrentPlaybackApi.desktopLaunch({
        kind: target.kind, tmdb_id: target.tmdb_id, source_id: source.source_id,
        season: currentEpisode.value?.season ?? null, episode: currentEpisode.value?.episode ?? null,
        audio_lang: audioLanguage.value,
      })
      if (ctl.signal.aborted) return
      openDeepLink(res.deep_link)
      message.value = 'Открываем KINOSOTA Player…'
      const opened = await waitForPlayer(res.launch_id, { signal: ctl.signal })
      if (ctl.signal.aborted) return
      if (opened) {
        message.value = 'Открыто в KINOSOTA Player'
      } else {
        message.value = ''
        installPrompt.value = true
        void waitForPlayer(res.launch_id, { signal: ctl.signal, quietMs: 60000, focusLostMs: 60000, intervalMs: 3000 })
          .then((late) => { if (late && !ctl.signal.aborted) { installPrompt.value = false; message.value = 'Открыто в KINOSOTA Player' } })
      }
    } catch (e) {
      if (!ctl.signal.aborted) error.value = e instanceof ApiError && e.status < 500 ? e.message : 'Не удалось открыть KINOSOTA Player. Повторите попытку.'
    } finally {
      if (launchController === ctl) busy.value = ''
    }
  }
  function closeInstall() {
    installPrompt.value = false
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && view.value && inFlight(view.value)) void refresh()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  watch([key, () => access.value], () => {
    generation++
    clearTimeout(timer)
    controller?.abort()
    launchController?.abort()
    view.value = null
    loadError.value = false
    selectedId.value = undefined
    language.value = null
    season.value = null
    episode.value = null
    busy.value = ''
    error.value = ''
    message.value = ''
    installPrompt.value = false
    if (item.value && access.value === true) void refresh()
  }, { immediate: true })
  watch(() => library.revision.value, () => { if (item.value && access.value === true) void refresh() })
  onBeforeUnmount(() => {
    generation++
    clearTimeout(timer)
    controller?.abort()
    launchController?.abort()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  })

  return reactive({
    view, loadError, selected, sources, audioLanguage, language, season, episode,
    seasonOptions, episodeOptions, showEpisodes, currentEpisode, progress, action, choice,
    busy, message, error, installPrompt,
    refresh, pickQuality, pickLanguage, pickSeason, pickEpisode, prepare, discover, addToLibrary, launch, closeInstall,
  })
}

export type TorrentWatch = ReturnType<typeof useTorrentWatch>
