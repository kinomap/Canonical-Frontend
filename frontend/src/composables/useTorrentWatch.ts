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
export type VoiceOption = {
  value: string
  language: TorrentLanguage | 'und'
  languageLabel: string
  active: boolean
  best: boolean
}
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

/** Track list of one release: container tracks when available, otherwise studios and language tracks. */
export function sourceTracks(s: TorrentSource): { value: string; language: TorrentLanguage | 'und'; languageLabel: string; best: boolean }[] {
  const tracks: { value: string; language: TorrentLanguage | 'und'; languageLabel: string; best: boolean }[] = []
  const seen = new Set<string>()

  const add = (val: string, lang: TorrentLanguage | 'und', best = false) => {
    const key = `${lang}:${val.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    const languageLabel = LANGUAGE_LABELS[lang] ?? (lang === 'und' ? 'UND' : String(lang).toUpperCase())
    tracks.push({ value: val, language: lang, languageLabel, best })
  }

  // 1. Container tracks directly parsed from MKV stream header
  if (s.audio_tracks && s.audio_tracks.length > 0) {
    s.audio_tracks.forEach((t, idx) => {
      const name = t.title || (LANGUAGE_NAMES[t.language] ?? `Аудио ${t.index}`)
      add(name, t.language, idx === 0)
    })
    return tracks
  }

  // 2. Voice studios parsed from release title
  const voices = s.voices ?? []
  if (!voices.length) return []

  const langs = s.languages ?? []
  voices.forEach((v, idx) => add(v, 'ru', idx === 0))

  if (langs.includes('uk')) {
    add(LANGUAGE_NAMES.uk, 'uk', false)
  }
  if (langs.includes('en')) {
    add(LANGUAGE_NAMES.en, 'en', false)
  }
  for (const l of langs) {
    if (l !== 'ru' && l !== 'uk' && l !== 'en') {
      add(LANGUAGE_NAMES[l] ?? String(l).toUpperCase(), l, false)
    }
  }

  return tracks
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
  const selectedVoice = ref<string | null>(null)
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
  /** Voice-over tracks of the chosen release, with language attribution. */
  const voiceOptions = computed<VoiceOption[]>(() => {
    const s = selected.value
    if (!s) return []
    return sourceTracks(s).map((t) => ({
      ...t,
      active: t.value === selectedVoice.value,
    }))
  })
  const audioButtonLabel = computed<string>(() => 'Аудио')

  function syncVoice(src: TorrentSource) {
    const tracks = sourceTracks(src)
    if (!tracks.length) {
      selectedVoice.value = null
      return
    }
    const current = tracks.find((t) => t.value === selectedVoice.value)
    if (current && (!language.value || language.value === current.language || language.value === 'und')) {
      return
    }
    const byLang = language.value ? tracks.find((t) => t.language === language.value) : undefined
    if (byLang) {
      selectedVoice.value = byLang.value
      return
    }
    const defLang = (src.languages ?? []).includes('ru') ? 'ru' : (src.languages?.[0] ?? 'und')
    const preferred = tracks.find((t) => t.language === defLang) ?? tracks[0]
    selectedVoice.value = preferred.value
  }


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
    const hasZero = available.has(0) || files.has(0)
    const maxEp = Math.max(seasonOptions.value.find((s) => s.value === season.value)?.episodes ?? 0, 0, ...available)
    const count = Math.min(2000, maxEp)
    const list: EpisodeOption[] = []
    if (hasZero) {
      const file0 = files.get(0)
      list.push({
        value: 0,
        available: available.has(0),
        sizeMb: file0 && file0.size_bytes > 0 ? Math.round(file0.size_bytes / 1048576) : null,
        sourceId: file0?.source_id ?? null,
      })
    }
    for (let i = 1; i <= count; i++) {
      const file = files.get(i)
      list.push({
        value: i,
        available: available.has(i),
        sizeMb: file && file.size_bytes > 0 ? Math.round(file.size_bytes / 1048576) : null,
        sourceId: file?.source_id ?? null,
      })
    }
    return list
  })
  const currentEpisode = computed<TorrentEpisode | null>(() =>
    showEpisodes.value && season.value !== null && episode.value !== null ? { season: season.value, episode: episode.value } : null)
  const episodeReady = computed(() => !currentEpisode.value || (!!selected.value && hasEpisode(selected.value, currentEpisode.value)))
  // Initialize selectedVoice when selected source changes (page load or quality switch).
  watch(selected, (src) => {
    if (!src) return
    syncVoice(src)
  }, { immediate: true })
  watch(knownEpisodes, (list) => {
    if (!isTv.value || !list.length || (season.value !== null && episode.value !== null)) return
    const s1e1 = list.find((e) => e.season === 1 && e.episode === 1)
    const s1 = list.find((e) => e.season === 1)
    const reg = list.find((e) => e.season > 0)
    const first = s1e1 ?? s1 ?? reg ?? selected.value?.episodes[0] ?? list[0]
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
    syncVoice(source)
    if (source.source_id && (source.state === 'candidate' || source.state === 'failed')) void prepare(source)
  }
  function pickQuality(q: string) {
    if (selected.value?.quality === q) return
    const options = offered.value.filter((s) => s.quality === q)
    let chosen = bestSource(options, { language: language.value, episode: currentEpisode.value })
    if (!chosen) chosen = bestSource(options, { language: language.value })
    if (!chosen) chosen = bestSource(options)
    if (chosen) {
      if (currentEpisode.value && !hasEpisode(chosen, currentEpisode.value) && chosen.episodes.length > 0) {
        const ep = chosen.episodes[0]
        season.value = ep.season
        episode.value = ep.episode
      }
      choose(chosen)
    }
  }
  function pickLanguage(lang: LanguagePill) {
    language.value = lang
    if (selected.value && speaks(selected.value, lang)) {
      const match = sourceTracks(selected.value).find((o) => o.language === lang)
      if (match) selectedVoice.value = match.value
      return
    }
    const options = offered.value.filter((s) => speaks(s, lang))
    const chosen = bestSource(options, { quality: selected.value?.quality, episode: currentEpisode.value })
    if (chosen) {
      choose(chosen)
      const match = sourceTracks(chosen).find((o) => o.language === lang)
      if (match) selectedVoice.value = match.value
    }
  }
  function pickVoice(voice: string) {
    const currentOptions = voiceOptions.value
    const found = currentOptions.find((o) => o.value === voice)
    if (found) {
      selectedVoice.value = found.value
      if (found.language && found.language !== 'und') {
        language.value = found.language
      }
      return
    }
    const options = offered.value.filter((s) => sourceTracks(s).some((t) => t.value === voice))
    const alt = bestSource(options, { quality: selected.value?.quality, language: language.value, episode: currentEpisode.value })
    if (alt) {
      choose(alt)
      const newOption = sourceTracks(alt).find((o) => o.value === voice)
      if (newOption) {
        selectedVoice.value = newOption.value
        if (newOption.language && newOption.language !== 'und') {
          language.value = newOption.language
        }
      }
    } else {
      selectedVoice.value = voice
    }
  }
  function followEpisode() {
    const e = currentEpisode.value
    if (!e || !selected.value || hasEpisode(selected.value, e)) return
    const matching = offered.value.filter((s) => hasEpisode(s, e))
    if (matching.length) {
      const alt = bestSource(matching, { quality: selected.value?.quality, language: language.value, episode: e })
      if (alt) choose(alt)
    }
  }
  function pickSeason(value: number) {
    if (!Number.isInteger(value)) return
    season.value = value
    const inSeason = knownEpisodes.value.filter((e) => e.season === value)
    const fromSelected = selected.value?.episodes.find((e) => e.season === value)
    const defaultEp = (value === 1 ? inSeason.find((e) => e.episode === 1) : null) ?? fromSelected ?? inSeason[0]
    episode.value = defaultEp?.episode ?? (value === 0 ? 0 : 1)
    followEpisode()
  }
  function pickEpisode(value: number) {
    if (!Number.isInteger(value) || value < 0) return
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
      let chosenTrackIndex: number | null = null
      let chosenTrackLang: TorrentLanguage | null = audioLanguage.value
      if (selectedVoice.value && source.audio_tracks) {
        const matched = source.audio_tracks.find((track) =>
          (track.title || (LANGUAGE_NAMES[track.language] ?? `Аудио ${track.index}`)) === selectedVoice.value)
        if (matched) {
          chosenTrackIndex = matched.index
          if (matched.language === 'ru' || matched.language === 'uk' || matched.language === 'en') {
            chosenTrackLang = matched.language
          }
        }
      }
      const res = await torrentPlaybackApi.desktopLaunch({
        kind: target.kind, tmdb_id: target.tmdb_id, source_id: source.source_id,
        season: currentEpisode.value?.season ?? null, episode: currentEpisode.value?.episode ?? null,
        audio_lang: chosenTrackLang, audio_track: chosenTrackIndex,
      })
      if (ctl.signal.aborted) return
      openDeepLink(res.deep_link)
      message.value = 'Открываем KINOSOTA Player…'
      const opened = await waitForPlayer(res.launch_id, { signal: ctl.signal, quietMs: 3500 })
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
    selectedVoice.value = null
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
    busy, message, error, installPrompt, selectedVoice, audioButtonLabel,
    refresh, pickQuality, pickLanguage, pickVoice, pickSeason, pickEpisode, prepare, discover, addToLibrary, launch, closeInstall,
  })
}

export type TorrentWatch = ReturnType<typeof useTorrentWatch>
