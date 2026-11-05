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
  type TorrentSource,
  type TorrentSourcesView,
} from '@/api/torrents'
import { ACTIVE_STAGES, PREP_POLL_MS, PREP_PROGRESS, stageLabel, stageOf, type PrepStage, type PrepStatus } from '@/api/preparation'
import { useLibrary } from '@/stores/library'
import { openDeepLink, waitForPlayer } from '@/lib/desktopLaunch'

/** Live refresh while something moves (the reference re-reads every 2–3 s). */
export const POLL_MS = PREP_POLL_MS
/** The server scheduled a retry (nothing found yet / tracker error): look again now and then. */
export const RETRY_POLL_MS = 30000
/** Language pill: flag + code; «UND» stands for sources whose audio language is not named. */
export type LanguagePill = TorrentLanguage | 'und'
export const LANGUAGE_ORDER: readonly LanguagePill[] = ['ru', 'uk', 'en', 'und']
export const LANGUAGE_LABELS: Record<LanguagePill, string> = { ru: 'RU', uk: 'UA', en: 'EN', und: 'UND' }
export const LANGUAGE_FLAGS: Record<LanguagePill, boolean> = { ru: true, uk: true, en: true, und: false }
export const LANGUAGE_NAMES: Record<LanguagePill, string> = {
  ru: 'Русская озвучка', uk: 'Украинская озвучка', en: 'Английская дорожка', und: 'Язык дорожки не указан',
}

export type ProgressView = { status: PrepStatus; stage: PrepStage; progress: number; startMs: number | null; label?: string; quality?: string | null }
export type QualityOption = { value: string; label: string; available: boolean; active: boolean }
export type SeasonOption = { value: number; label: string; episodes: number; available: boolean }
export type EpisodeOption = { value: number; available: boolean; sizeMb: number | null; sourceId: string | null }
/** Voice-over pill: «active» when the chosen source carries it, «best» for the top-ranked release's voice. */
export type VoiceOption = { value: string; active: boolean; best: boolean }
export type WatchAction =
  | 'checking' | 'subscribe' | 'loading' | 'retry' | 'library' | 'discover'
  | 'prepare' | 'wait' | 'missing' | 'launch'
type Prefs = { quality?: string | null; language?: LanguagePill | null; episode?: TorrentEpisode | null }

/** Titles already re-searched in this tab (the server also enforces a cooldown). */
const autoDiscovered = new Set<string>()

export const hasEpisode = (source: TorrentSource, e: TorrentEpisode) =>
  source.episodes.some((x) => x.season === e.season && x.episode === e.episode)
export const speaks = (source: TorrentSource, lang: LanguagePill) =>
  lang === 'und' ? !source.languages.length : source.languages.includes(lang)

function rank(s: TorrentSource, p: Prefs): number[] {
  return [
    s.state === 'failed' ? 1 : 0,
    p.quality && s.quality !== p.quality ? 1 : 0,
    p.language && !speaks(s, p.language) ? 1 : 0,
    p.episode && !hasEpisode(s, p.episode) ? 1 : 0,
    s.state === 'ready' ? 0 : 1,
    // Server viewer rank: 1080p > 2160p > 720p, ru/en/uk voices, more voices, seeders.
    s.rank ?? Number.MAX_SAFE_INTEGER,
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

/** Something the server is working on right now (stage or a queued / checked source). */
const moving = (v: TorrentSourcesView) =>
  ACTIVE_STAGES.includes(stageOf(v.status)) || v.sources.some((s) => s.state === 'queued' || s.state === 'loading')
/** Final for now: nothing found on the trackers / the attempt failed. */
const settled = (stage: PrepStage) => stage === 'not_found' || stage === 'failed'

function discoverMessage(result: string, scope: 'title' | 'episodes', stage: PrepStage): string {
  if (result === 'cooldown') return scope === 'episodes' ? 'Новые серии можно будет проверить чуть позже' : 'Повторный поиск станет доступен чуть позже'
  if (result === 'no_demand') return 'Добавьте запись в кинотеку, чтобы начать поиск'
  if (result === 'active') return settled(stage) ? 'Повторный поиск уже запланирован' : 'Поиск уже идёт'
  return scope === 'episodes' ? 'Проверяем новые серии…' : 'Ищем раздачи…'
}

export function useTorrentWatch(item: Ref<TorrentItem | null>, access: Ref<boolean | null>) {
  const library = useLibrary()
  const view = ref<TorrentSourcesView | null>(null)
  const loadError = ref(false)
  const selectedId = ref<string | null | undefined>(undefined)
  const language = ref<LanguagePill | null>(null)
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
  const offered = computed(() => sources.value.filter((s) => s.state !== 'failed'))
  const stage = computed<PrepStage>(() => stageOf(view.value?.status))
  const selected = computed<TorrentSource | null>(() => {
    const list = sources.value
    if (!list.length) return null
    if (selectedId.value !== undefined) {
      const hit = list.find((s) => s.source_id === selectedId.value)
      if (hit) return hit
    }
    // The server recommends the best-ranked ready source; the manifest default otherwise.
    const recommended = view.value?.selected_source_id
    return (recommended ? list.find((s) => s.source_id === recommended) : undefined) ?? list.find((s) => s.default) ?? bestSource(list)
  })
  /** Voice sent to the player: the user's pick when the source has it, Russian first otherwise. */
  const audioLanguage = computed<TorrentLanguage | null>(() => {
    const langs = selected.value?.languages ?? []
    const pick = language.value
    if (pick && pick !== 'und' && (langs.includes(pick) || !langs.length)) return pick
    return langs.includes('ru') ? 'ru' : (langs[0] ?? null)
  })
  /** The highlighted language pill; «UND» when the chosen source names no language. */
  const activeLanguage = computed<LanguagePill | null>(() => {
    const s = selected.value
    if (!s) return null
    return s.languages.length ? audioLanguage.value : 'und'
  })
  /** Only the voices some offered source carries (no dead pills, like the reference). */
  const languageOptions = computed<LanguagePill[]>(() => {
    const present = new Set<LanguagePill>()
    for (const s of offered.value) {
      if (!s.languages.length) present.add('und')
      for (const l of s.languages) present.add(l)
    }
    return LANGUAGE_ORDER.filter((l) => present.has(l))
  })
  /** Voice-over studios of the offered releases, best-ranked first (at most 12). */
  const voiceOptions = computed<VoiceOption[]>(() => {
    const names: string[] = []
    const add = (v: string) => { if (v && !names.includes(v)) names.push(v) }
    for (const s of [...offered.value].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))) for (const v of s.voices ?? []) add(v)
    for (const v of view.value?.voices ?? []) add(v.value)
    const current = selected.value?.voices ?? []
    const top = bestSource(offered.value)?.voices?.[0] ?? null
    return names.slice(0, 12).map((value) => ({ value, active: current.includes(value), best: value === top }))
  })

  const seasonFiles = computed(() => view.value?.seasons ?? [])
  const knownEpisodes = computed<TorrentEpisode[]>(() => {
    const seen = new Map<string, TorrentEpisode>()
    const add = (s: number, e: number) => seen.set(`${s}:${e}`, { season: s, episode: e })
    for (const e of view.value?.episodes ?? []) add(e.season, e.episode)
    for (const e of selected.value?.episodes ?? []) add(e.season, e.episode)
    for (const s of seasonFiles.value) for (const e of s.episodes) add(s.season, e.episode)
    return [...seen.values()].sort((a, b) => a.season - b.season || a.episode - b.episode)
  })
  const showEpisodes = computed(() => isTv.value && knownEpisodes.value.length > 0)
  const seasonOptions = computed<SeasonOption[]>(() => {
    const available = new Set(knownEpisodes.value.map((e) => e.season))
    const options = new Map<number, SeasonOption>()
    for (const s of item.value?.season_list ?? []) {
      if (s.season > 0 || available.has(s.season)) options.set(s.season, { value: s.season, label: s.season ? `${s.season} сезон` : 'Спецвыпуски', episodes: s.episodes, available: available.has(s.season) })
    }
    for (const n of available) if (!options.has(n)) options.set(n, { value: n, label: n ? `${n} сезон` : 'Спецвыпуски', episodes: 0, available: true })
    return [...options.values()].sort((a, b) => a.value - b.value)
  })
  /** Episode grid of the chosen season: TMDB count, the ready ones with their file size. */
  const episodeOptions = computed<EpisodeOption[]>(() => {
    if (season.value === null) return []
    const files = new Map((seasonFiles.value.find((s) => s.season === season.value)?.episodes ?? []).map((e) => [e.episode, e]))
    const available = new Set(knownEpisodes.value.filter((e) => e.season === season.value).map((e) => e.episode))
    const count = Math.min(2000, Math.max(seasonOptions.value.find((s) => s.value === season.value)?.episodes ?? 0, 0, ...available))
    return Array.from({ length: count }, (_, i) => {
      const file = files.get(i + 1)
      return {
        value: i + 1, available: available.has(i + 1),
        sizeMb: file && file.size_bytes > 0 ? Math.round(file.size_bytes / 1048576) : null,
        sourceId: file?.source_id ?? null,
      }
    })
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

  /** Quality pills: «1080p WEB-DL» names the source a click would pick; missing ones are struck through. */
  const qualityOptions = computed<QualityOption[]>(() => (view.value?.qualities ?? []).map((q) => {
    const current = selected.value?.quality === q.value ? selected.value : null
    const best = current ?? bestSource(offered.value.filter((s) => s.quality === q.value), { language: language.value, episode: currentEpisode.value })
    return { value: q.value, label: best?.source_type ? `${q.value} ${best.source_type}` : q.value, available: !!best, active: !!current }
  }))

  const progress = computed<ProgressView | null>(() => {
    const v = view.value
    if (access.value !== true || !v?.allowed) return null
    const s = selected.value
    if (s && !s.default) {
      if (s.state === 'failed') return { status: 'unavailable', stage: 'failed', progress: 0, startMs: null, label: 'Раздача не отвечает' }
      if (s.state === 'candidate') return { status: 'not_queued', stage: 'idle', progress: 0, startMs: null, label: 'Раздача не подготовлена' }
      if (s.state === 'ready') return { status: 'playable', stage: 'ready', progress: 100, startMs: s.start_ms, quality: s.quality }
      const checking = s.state === 'loading'
      return { status: checking ? 'loading' : 'queued', stage: checking ? 'checking' : 'queued', progress: s.progress, startMs: null }
    }
    const st = v.status
    const current = stageOf(st)
    if (current === 'idle' || current === 'locked') return null
    return {
      status: st.status, stage: current,
      progress: st.progress ?? PREP_PROGRESS[st.status] ?? 0,
      startMs: st.start_ms ?? s?.start_ms ?? null,
      label: current === 'ready' ? undefined : stageLabel(st),
      quality: s?.quality ?? null,
    }
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
    const current = stage.value
    if (ACTIVE_STAGES.includes(current) || (v.discovering && !settled(current))) return 'wait'
    if (current === 'idle') return v.in_library ? 'discover' : 'library'
    return 'discover'
  })
  const choice = computed<StreamChoice>(() => ({
    source_id: selected.value?.source_id ?? null,
    season: currentEpisode.value?.season ?? null,
    episode: currentEpisode.value?.episode ?? null,
  }))

  /** Next live refresh, or null when nothing can change by itself. */
  function pollDelay(): number | null {
    const v = view.value
    if (!v) return loadError.value ? POLL_MS * 2 : null
    if (moving(v) || (v.discovering && !settled(stageOf(v.status)))) return loadError.value ? POLL_MS * 2 : POLL_MS
    return v.discovering ? RETRY_POLL_MS : null
  }

  function schedule() {
    clearTimeout(timer)
    const delay = pollDelay()
    if (delay === null) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    timer = setTimeout(() => { void refresh() }, delay)
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
    if (stageOf(v.status) !== 'ready') return
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
    if (selected.value?.quality === quality) return
    const options = offered.value.filter((s) => s.quality === quality)
    choose(bestSource(options, { language: language.value, episode: currentEpisode.value }))
  }
  function pickLanguage(lang: LanguagePill) {
    language.value = lang
    if (selected.value && speaks(selected.value, lang)) return
    const options = offered.value.filter((s) => speaks(s, lang))
    choose(bestSource(options, { quality: selected.value?.quality, episode: currentEpisode.value }))
  }
  function pickVoice(voice: string) {
    if (selected.value?.voices?.includes(voice)) return
    const options = offered.value.filter((s) => s.voices?.includes(voice))
    choose(bestSource(options, { quality: selected.value?.quality, language: language.value, episode: currentEpisode.value }))
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

  /** «↻ Искать раздачи» / «⟳ Обновить» (new episodes): one more tracker search for this title. */
  async function discover(scope: 'title' | 'episodes' = 'title') {
    const target = item.value
    if (!target || busy.value) return
    busy.value = 'discover'
    error.value = ''
    message.value = ''
    const before = stage.value
    try {
      const { result } = await torrentPlaybackApi.discover(target.kind, target.tmdb_id)
      message.value = discoverMessage(result, scope, before)
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
    if (document.visibilityState === 'visible' && pollDelay() !== null) void refresh()
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
    view, loadError, selected, sources, stage, audioLanguage, activeLanguage, language, season, episode,
    qualityOptions, languageOptions, voiceOptions, seasonOptions, episodeOptions, showEpisodes, currentEpisode, progress, action, choice,
    busy, message, error, installPrompt,
    refresh, pickQuality, pickLanguage, pickVoice, pickSeason, pickEpisode, prepare, discover, addToLibrary, launch, closeInstall,
  })
}

export type TorrentWatch = ReturnType<typeof useTorrentWatch>
