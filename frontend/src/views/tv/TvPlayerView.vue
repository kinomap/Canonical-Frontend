<script setup lang="ts">
/**
 * KINOSOTA TV player (/tv/player): full-screen video driven by the remote.
 * OK — pause / resume, ←/→ — accelerating seek (10 s → 30 s → 1 min), ↓ — audio /
 * subtitles / episodes sheet, ↑ — title card, Back — save progress, release the stream
 * and return to the same card of /tv (useTvNavigation focus memory).
 * Torrents: torrentPlaybackApi.playbackTicket; catalogue: apiClient.startPlayback / startSeriesPlayback.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, apiClient } from '@/api/client'
import { torrentPlaybackApi, torrentsApi } from '@/api/torrents'
import { createHistoryWriter, getResume } from '@/api/watchHistory'
import { useAuthStore } from '@/stores/auth'
import { resolveTvKey, useTvNavigation, type TvAction, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'
import AdPlaybackContainer from '@/components/AdPlaybackContainer.vue'
import CinemaIntro from '@/components/CinemaIntro.vue'
import { introClock, introRemaining, type IntroStart, type IntroTarget } from '@/lib/cinemaIntro'
import {
  SEEK_COMMIT_MS, SEEK_SERIES_MS, TV_CONTROLS_HIDE_MS,
  formatClock, formatSeekDelta, parseTvPlayTarget, seekStep, tvPlayerQuery, type TvPlayTarget,
} from './tvPlayback'
import {
  DECODER_RELEASE_MS,
  createTizenAvplayController,
  hasTizenAvplay,
  loadTizenWebApis,
  registerTizenMediaKeys,
  releaseVideoElement,
  waitDecoderRelease,
  type NativePlayerController,
} from './tvNativePlayer'
import { installTvDebugConsole, tvDebugFatal, tvDebugLog } from './tvDebugConsole'

interface TvEpisode { key: string; label: string; season: number; episode: number; episodeId?: string }
interface TrackOption { label: string; active: boolean }
type PanelTab = 'audio' | 'subtitles' | 'episodes'
type Mode = 'playback' | 'panel' | 'info'

const HISTORY_SAVE_EVERY_MS = 30_000
const SEEK_PLAQUE_MS = 1200
/** The intro never holds the film longer than this (switched-off / reduced-motion / stalled clip). */
const INTRO_MAX_MS = 15_000

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const target = ref<TvPlayTarget | null>(parseTvPlayTarget(route.query))
const video = ref<HTMLVideoElement | null>(null)
const panelRoot = ref<HTMLElement | null>(null)

const status = ref<'loading' | 'ready' | 'error'>('loading')
const errorText = ref('')
const streamUrl = ref('')
const title = ref('')
const overview = ref('')
const year = ref<number | null>(null)
const backdrop = ref('')

const paused = ref(true)
const buffering = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const controlsVisible = ref(true)
const mode = ref<Mode>('playback')

const episodes = ref<TvEpisode[]>([])
const episodeIndex = ref(0)
const audioOptions = ref<TrackOption[]>([])
const subtitleOptions = ref<TrackOption[]>([{ label: 'Выкл', active: true }])

const seekDelta = ref<number | null>(null)
const seekTarget = ref(0)

let loadId = 0
let sessionId = ''
let resumeAt = 0
let heartbeatTimer: ReturnType<typeof setInterval> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let seekCommitTimer: ReturnType<typeof setTimeout> | undefined
let seekPlaqueTimer: ReturnType<typeof setTimeout> | undefined
let lastHistorySave = 0
let released = false
let seekPending = false
let historyWriter = createHistoryWriter()
const seekSeries = { dir: 0, count: 0, last: 0 }
const useNativeAvplay = ref(false)
const activeEngine = ref<'Tizen AVPlay' | 'HTML5'>('HTML5')
let nativeController: NativePlayerController | null = null
/** A pre-roll / intro <video> really played: the TV decoder needs DECODER_RELEASE_MS before the film opens. */
let commercialVideoPlayed = false
let commercialReleasedAt = 0
let suspendedAt = -1

const currentEpisode = computed(() => episodes.value[episodeIndex.value] ?? null)
const isSeries = computed(() => target.value?.kind === 'tv' || target.value?.kind === 'series')
const progress = computed(() => (duration.value > 0 ? Math.min(100, (currentTime.value / duration.value) * 100) : 0))
const historyEnabled = computed(() => auth.isAuthenticated.value && target.value?.src === 'catalog' && target.value.kind === 'movie')

// ── Commercial cycle: 1) KINOSOTA intro (CinemaIntro) → 2) pre-roll (AdPlaybackContainer) → 3) the film ──
// While the intro plays, the ad plan warms and the stream URL is fetched; the film is attached only in phase 3.
type Phase = 'intro' | 'ads' | 'content'
const phase = ref<Phase>('intro')
const adsReady = ref(false)
const introActive = ref(true)
let adEarlySettled = false
const adPlayer = ref<InstanceType<typeof AdPlaybackContainer> | null>(null)
const introPlayer = ref<InstanceType<typeof CinemaIntro> | null>(null)
let introFallbackTimer: ReturnType<typeof setTimeout> | undefined
/**
 * Intro (>= MIN_INTRO_MS, 5 s) → pre-roll → film, exactly as VideoPlayer.vue / TorrentPlayer.vue: whatever
 * ends the intro earlier (a short clip, a refused autoplay) waits until the intro has been on screen 5 s.
 * The intro layer is rendered from the very first paint, so its clock starts with the view.
 */
let introStartedAt = introClock.now()
let introHoldTimer: ReturnType<typeof setTimeout> | undefined

const adSurface = computed(() => (target.value?.src === 'torrent' ? 'torrent_browser' : 'telegram_browser'))
/** The TV plays in the browser: the admin «Интро престарта» browser targets apply to it. */
const introTarget = computed<IntroTarget>(() => (target.value?.src === 'torrent' ? 'browser_torrents' : 'browser_telegram'))
const adTarget = computed(() => {
  const current = target.value
  if (!current) return null
  if (current.src === 'torrent') {
    const episode = current.kind === 'tv' ? currentEpisode.value : null
    return { torrentKind: current.kind, tmdbId: Number(current.id), season: episode?.season, episode: episode?.episode }
  }
  if (current.kind === 'movie') return { targetId: current.id, targetType: 'movie' as const }
  return { targetId: currentEpisode.value?.episodeId, targetType: 'episode' as const }
})
/** An ad is on screen (pre-roll or a mid-roll over the film): the remote cannot seek or skip it. */
const adBusy = computed(() => Boolean(adPlayer.value?.busy))

function onCommercialStarted() {
  commercialVideoPlayed = true
}

function onIntroDone() {
  if (phase.value !== 'intro') return
  // Never before the 5 s minimum while a clip is shown; an intro switched off in the admin never waits.
  if (introPlayer.value?.enabled !== false) {
    const wait = introRemaining(introStartedAt)
    if (wait > 0) {
      clearTimeout(introHoldTimer)
      introHoldTimer = setTimeout(onIntroDone, wait)
      return
    }
  }
  clearTimeout(introHoldTimer)
  clearTimeout(introFallbackTimer)
  document.querySelectorAll<HTMLVideoElement>('.tv-intro-layer video').forEach((el) => {
    if (el.getAttribute('src') || el.currentSrc) commercialVideoPlayed = true
    releaseVideoElement(el)
  })
  if (commercialVideoPlayed) commercialReleasedAt = Date.now()
  introActive.value = false
  if (!adTarget.value || adEarlySettled || adPlayer.value?.preroll === 'none') {
    tvDebugLog('info', 'intro done -> film')
    startFilm()
    return
  }
  tvDebugLog('info', 'intro done -> pre-roll')
  phase.value = 'ads'
}

/** Autoplay refused (even muted): the poster has had its 5 s, then the next stage starts (not after 15 s). */
function onIntroStarted(result: IntroStart) {
  if (result === 'blocked') onIntroDone()
}

function onAdsSettled() {
  if (phase.value === 'intro') {
    adEarlySettled = true
    return
  }
  if (phase.value !== 'ads') return
  if (commercialVideoPlayed) commercialReleasedAt = Date.now()
  tvDebugLog('info', 'pre-roll settled -> film')
  startFilm()
}

function startFilm() {
  if (phase.value === 'content') return
  clearTimeout(introHoldTimer)
  clearTimeout(introFallbackTimer)
  // Free the intro's decoder slot before the film opens (one hardware stream on most TVs).
  document.querySelectorAll<HTMLVideoElement>('.tv-intro-layer video').forEach((el) => {
    if (el.getAttribute('src') || el.currentSrc) commercialVideoPlayed = true
    releaseVideoElement(el)
  })
  if (commercialVideoPlayed) commercialReleasedAt = Date.now()
  tvDebugLog('info', 'intro done -> film')
  phase.value = 'content'
  introActive.value = false
  showControls()
}

// ── Bottom sheet (audio / subtitles / episodes), its own D-pad model ─────────
const tabs = computed<{ id: PanelTab; label: string }[]>(() => [
  { id: 'audio', label: 'Звуковая дорожка' },
  { id: 'subtitles', label: 'Субтитры' },
  ...(isSeries.value && episodes.value.length > 1 ? [{ id: 'episodes' as const, label: 'Серии' }] : []),
])
const panelTab = ref(0)
const activeTab = computed<PanelTab>(() => tabs.value[panelTab.value]?.id ?? 'audio')
const panelOptions = computed<TrackOption[]>(() => {
  if (activeTab.value === 'episodes') return episodes.value.map((item, index) => ({ label: item.label, active: index === episodeIndex.value }))
  if (activeTab.value === 'subtitles') return subtitleOptions.value
  return audioOptions.value.length ? audioOptions.value : [{ label: 'Дорожка по умолчанию', active: true }]
})
const panelRows = computed<TvRow[]>(() => [
  { id: 'tabs', size: tabs.value.length },
  { id: 'options', size: panelOptions.value.length },
])

const panelNav = useTvNavigation({ rows: panelRows, root: panelRoot, listen: false, onSelect: onPanelSelect })

watch(panelNav.focusKey, (key) => {
  if (key?.startsWith('tabs:')) panelTab.value = Number(key.slice(5))
})

function openPanel() {
  mode.value = 'panel'
  panelTab.value = 0
  panelNav.focusRow('tabs', 0)
  showControls()
}

function closePanel() {
  mode.value = 'playback'
  showControls()
}

function onPanelSelect(selected: TvSelectTarget) {
  if (selected.area !== 'content') return
  if (selected.rowId === 'tabs') {
    panelTab.value = selected.index
    const active = panelOptions.value.findIndex(option => option.active)
    panelNav.focusRow('options', Math.max(0, active))
    return
  }
  if (activeTab.value === 'audio') selectAudio(selected.index)
  else if (activeTab.value === 'subtitles') selectSubtitle(selected.index)
  else selectEpisode(selected.index)
}

// ── Media tracks ─────────────────────────────────────────────────────────
interface AudioTrackLike { enabled: boolean; label?: string; language?: string }
interface AudioTrackListLike { length: number; [index: number]: AudioTrackLike }

function audioTrackList(): AudioTrackListLike | null {
  return (video.value as unknown as { audioTracks?: AudioTrackListLike } | null)?.audioTracks ?? null
}

function trackLabel(track: { label?: string; language?: string }, index: number, fallback: string): string {
  return track.label?.trim() || (track.language ? track.language.toUpperCase() : '') || `${fallback} ${index + 1}`
}

function readTracks() {
  if (nativeController) {
    audioOptions.value = nativeController.getAudioTracks().map(({ label, active }) => ({ label, active }))
    subtitleOptions.value = nativeController.getSubtitleTracks().map(({ label, active }) => ({ label, active }))
    return
  }
  const audio = audioTrackList()
  const list: TrackOption[] = []
  if (audio) for (let i = 0; i < audio.length; i++) list.push({ label: trackLabel(audio[i], i, 'Дорожка'), active: audio[i].enabled })
  audioOptions.value = list
  const text = video.value?.textTracks
  const subs: TrackOption[] = [{ label: 'Выкл', active: true }]
  if (text) {
    for (let i = 0; i < text.length; i++) {
      const track = text[i]
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
      const showing = track.mode === 'showing'
      if (showing) subs[0].active = false
      subs.push({ label: trackLabel(track, i, 'Субтитры'), active: showing })
    }
  }
  subtitleOptions.value = subs
}

function selectAudio(index: number) {
  if (nativeController) {
    nativeController.selectAudioTrack(index)
    readTracks()
    return
  }
  const audio = audioTrackList()
  if (audio && index < audio.length) {
    for (let i = 0; i < audio.length; i++) audio[i].enabled = i === index
    readTracks()
  }
}

function selectSubtitle(index: number) {
  if (nativeController) {
    nativeController.selectSubtitleTrack(index)
    readTracks()
    return
  }
  const text = video.value?.textTracks
  if (text) {
    let n = 0
    for (let i = 0; i < text.length; i++) {
      const track = text[i]
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
      n++
      track.mode = n === index ? 'showing' : 'disabled'
    }
  }
  subtitleOptions.value = subtitleOptions.value.map((option, i) => ({ ...option, active: i === index }))
}

function selectEpisode(index: number) {
  if (index === episodeIndex.value || !episodes.value[index]) { closePanel(); return }
  void saveHistory(false, true)
  episodeIndex.value = index
  const episode = episodes.value[index]
  const current = target.value
  if (current?.src === 'torrent') target.value = { ...current, season: episode.season, episode: episode.episode }
  else if (current?.src === 'catalog') target.value = { ...current, episodeId: episode.episodeId }
  if (target.value) void router.replace({ path: '/tv/player', query: tvPlayerQuery(target.value) })
  closePanel()
  void loadStream()
}

// ── Controls visibility ──────────────────────────────────────────────────
function showControls() {
  controlsVisible.value = true
  clearTimeout(hideTimer)
  if (!paused.value && mode.value === 'playback') {
    hideTimer = setTimeout(() => { controlsVisible.value = false }, TV_CONTROLS_HIDE_MS)
  }
}

// ── Playback control ─────────────────────────────────────────────────────
function mediaCurrentTime(): number {
  return nativeController ? nativeController.getCurrentTime() : (video.value?.currentTime || 0)
}

function mediaDuration(): number {
  const value = nativeController ? nativeController.getDuration() : (video.value?.duration ?? 0)
  return Number.isFinite(value) && value > 0 ? value : duration.value
}

const adMainProxy = computed<HTMLVideoElement | null>(() => {
  if (!useNativeAvplay.value) return video.value
  return {
    get currentTime() { return mediaCurrentTime() },
    get duration() { return mediaDuration() || Infinity },
    play: () => { play(); return Promise.resolve() },
    pause: () => pause(),
  } as unknown as HTMLVideoElement
})

function play() {
  if (nativeController) {
    nativeController.play()
    onPlay()
    return
  }
  const el = video.value
  if (!el) return
  const started = el.play()
  if (started && typeof started.catch === 'function') started.catch(() => { paused.value = true; showControls() })
}

function pause() {
  if (nativeController) {
    nativeController.pause()
    onPause()
    return
  }
  video.value?.pause()
}

function togglePlay() {
  if (status.value !== 'ready') return
  const isPaused = nativeController ? nativeController.isPaused() : (video.value?.paused ?? paused.value)
  if (isPaused) play()
  else pause()
}

function seekBy(dir: 1 | -1) {
  if (!nativeController && !video.value) return
  if (status.value !== 'ready') return
  const now = Date.now()
  const continues = seekSeries.dir === dir && now - seekSeries.last <= SEEK_SERIES_MS
  seekSeries.count = continues ? seekSeries.count + 1 : 0
  seekSeries.dir = dir
  seekSeries.last = now
  if (!seekPending) {
    seekPending = true
    seekDelta.value = 0
    seekTarget.value = mediaCurrentTime()
  }
  const from = seekTarget.value
  const total = mediaDuration()
  const max = Number.isFinite(total) && total > 0 ? Math.max(0, total - 1) : Infinity
  const next = Math.max(0, Math.min(max, from + dir * seekStep(seekSeries.count)))
  seekDelta.value = (seekDelta.value ?? 0) + (next - from)
  seekTarget.value = next
  clearTimeout(seekPlaqueTimer)
  clearTimeout(seekCommitTimer)
  seekCommitTimer = setTimeout(commitSeek, SEEK_COMMIT_MS)
}

function commitSeek() {
  if (seekPending) {
    if (nativeController) {
      nativeController.seekTo(seekTarget.value)
      currentTime.value = seekTarget.value
    } else if (video.value) {
      video.value.currentTime = seekTarget.value
      currentTime.value = seekTarget.value
    }
  }
  seekPending = false
  seekSeries.dir = 0
  clearTimeout(seekPlaqueTimer)
  seekPlaqueTimer = setTimeout(() => { seekDelta.value = null }, SEEK_PLAQUE_MS)
}

// ── Remote ───────────────────────────────────────────────────────────────
function handle(action: TvAction) {
  // Pre-roll, intro and mid-rolls are not seekable or skippable from the remote; Back leaves the player.
  if (phase.value !== 'content' || adBusy.value) {
    if (action === 'back') void exit()
    return
  }
  if (action === 'back' && mode.value === 'playback') { void exit(); return }

  if (mode.value === 'panel') {
    if (action === 'back' || (action === 'up' && panelNav.currentRow.value?.id === 'tabs')) { closePanel(); return }
    if (action === 'playPause') { togglePlay(); return }
    panelNav.handle(action)
    return
  }

  if (mode.value === 'info') {
    mode.value = 'playback'
    if (action === 'back' || action === 'up') return
  }

  if (status.value === 'error') {
    if (action === 'select') void loadStream()
    return
  }

  switch (action) {
    case 'select':
    case 'playPause':
      togglePlay(); break
    case 'play': play(); break
    case 'pause': pause(); break
    case 'left':
    case 'rewind':
      seekBy(-1); break
    case 'right':
    case 'fastForward':
      seekBy(1); break
    case 'down': openPanel(); break
    case 'up': mode.value = 'info'; break
  }
}

function onKeydown(event: KeyboardEvent) {
  const action = resolveTvKey(event)
  if (!action) return
  event.preventDefault()
  handle(action)
  // After handle(): the auto-hide timer depends on the mode the key left us in.
  if (!released) showControls()
}

// ── Video element events ─────────────────────────────────────────────────
function onPlay() { paused.value = false; showControls() }
function onPause() { paused.value = true; showControls(); void saveHistory(false, true) }
function onTimeUpdate() {
  const el = video.value
  if (!el) return
  if (!seekPending) currentTime.value = el.currentTime
  adPlayer.value?.tick()
  if (Date.now() - lastHistorySave >= HISTORY_SAVE_EVERY_MS) void saveHistory(false, false)
}
function onDuration() { const value = video.value?.duration ?? 0; duration.value = Number.isFinite(value) ? value : 0 }
function onLoadedMetadata() {
  onDuration()
  readTracks()
  const el = video.value
  if (el && resumeAt > 0) { el.currentTime = resumeAt; currentTime.value = resumeAt; resumeAt = 0 }
}
function onEnded() { paused.value = true; showControls(); void saveHistory(true, true); void adPlayer.value?.end() }
function onMediaError() {
  if (!streamUrl.value) return
  tvDebugFatal(`playback error · engine ${activeEngine.value} · ${streamUrl.value}`)
  status.value = 'error'
  errorText.value = 'Видео не удалось воспроизвести на этом устройстве. Нажмите OK, чтобы повторить.'
}

// ── Watch history & session lease ────────────────────────────────────────
async function saveHistory(ended: boolean, keepalive: boolean) {
  if (!historyEnabled.value || !sessionId || (!nativeController && !video.value)) return
  const total = mediaDuration()
  if (!(total > 0)) return
  lastHistorySave = Date.now()
  try { await historyWriter(sessionId, mediaCurrentTime(), total, ended, keepalive) } catch { /* best effort */ }
}

function beginLease(id: string, intervalSeconds?: number) {
  sessionId = id
  historyWriter = createHistoryWriter()
  clearInterval(heartbeatTimer)
  const every = Math.max(10, intervalSeconds ?? 30) * 1000
  heartbeatTimer = setInterval(() => { void apiClient.heartbeatPlayback(id).catch(() => {}) }, every)
}

function endLease() {
  clearInterval(heartbeatTimer)
  heartbeatTimer = undefined
  if (sessionId) void apiClient.stopPlayback(sessionId, { keepalive: true }).catch(() => {})
  sessionId = ''
}

function detachVideo() {
  if (nativeController) {
    nativeController.destroy()
    nativeController = null
  }
  useNativeAvplay.value = false
  activeEngine.value = 'HTML5'
  document.documentElement.classList.remove('tv-native-plane')
  const el = video.value
  if (!el) return
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch { /* already detached */ }
}

function release() {
  if (released) return
  released = true
  loadId++
  clearTimeout(introHoldTimer)
  clearTimeout(introFallbackTimer)
  clearTimeout(hideTimer)
  clearTimeout(seekCommitTimer)
  clearTimeout(seekPlaqueTimer)
  detachVideo()
  streamUrl.value = ''
  endLease()
}

async function exit() {
  await saveHistory(false, true)
  release()
  const back = (router.options.history.state as { back?: unknown } | undefined)?.back
  if (typeof back === 'string' && back.startsWith('/tv') && !back.startsWith('/tv/player') && !back.startsWith('/tv/auth')) router.back()
  else void router.replace('/tv')
}

// ── Loading ──────────────────────────────────────────────────────────────
function failText(error: unknown): string {
  const code = error instanceof ApiError ? error.status : 0
  if (code === 401) return 'Войдите в аккаунт: «Профиль» в меню ТВ.'
  if (code === 403) return 'Просмотр доступен по подписке PRO. Оформите её в профиле на сайте.'
  if (code === 404 || code === 409 || code === 425) return 'Видео ещё готовится. Попробуйте чуть позже.'
  return 'Не удалось запустить видео. Нажмите OK, чтобы повторить.'
}

async function loadInfo(current: TvPlayTarget) {
  if (current.src === 'torrent') {
    const [detail, sources] = await Promise.allSettled([
      torrentsApi.detail(current.kind, current.id),
      current.kind === 'tv' ? torrentPlaybackApi.sources('tv', Number(current.id)) : Promise.resolve(null),
    ])
    if (detail.status === 'fulfilled') {
      title.value = detail.value.title
      overview.value = detail.value.overview ?? ''
      year.value = detail.value.year ?? null
      backdrop.value = detail.value.backdrop ?? ''
    }
    if (sources.status === 'fulfilled' && sources.value) {
      const list = [...(sources.value.episodes ?? [])].sort((a, b) => a.season - b.season || a.episode - b.episode)
      episodes.value = list.map(item => ({ key: `${item.season}-${item.episode}`, label: `Сезон ${item.season} · Серия ${item.episode}`, season: item.season, episode: item.episode }))
      const wanted = episodes.value.findIndex(item => item.season === current.season && item.episode === current.episode)
      episodeIndex.value = Math.max(0, wanted)
    }
    return
  }
  if (current.kind === 'movie') {
    const [movie, resume] = await Promise.allSettled([
      apiClient.getMovie(current.id),
      auth.isAuthenticated.value ? getResume(current.id) : Promise.resolve(null),
    ])
    if (movie.status === 'fulfilled') {
      title.value = movie.value.title
      overview.value = movie.value.overview ?? ''
      year.value = movie.value.year ?? null
      backdrop.value = movie.value.backdrop || movie.value.poster || ''
    }
    const item = resume.status === 'fulfilled' ? resume.value?.item : null
    if (item && !item.completed && item.position > 30 && (!item.duration || item.position < item.duration - 60)) resumeAt = item.position
    return
  }
  const series = await apiClient.getSeriesDetail(current.id)
  title.value = series.title
  overview.value = series.overview ?? ''
  year.value = series.year ?? null
  backdrop.value = series.backdrop_url || series.poster_url || ''
  episodes.value = [...series.seasons]
    .sort((a, b) => a.season_number - b.season_number)
    .flatMap(season => [...season.episodes]
      .filter(item => item.is_playable !== false)
      .sort((a, b) => a.episode_number - b.episode_number)
      .map(item => ({
        key: item.id,
        label: `Сезон ${season.season_number} · Серия ${item.episode_number}${item.title ? ` — ${item.title}` : ''}`,
        season: season.season_number,
        episode: item.episode_number,
        episodeId: item.id,
      })))
  episodeIndex.value = Math.max(0, episodes.value.findIndex(item => item.episodeId === current.episodeId))
}

async function loadStream() {
  const current = target.value
  if (!current) return
  const id = ++loadId
  endLease()
  detachVideo()
  status.value = 'loading'
  errorText.value = ''
  streamUrl.value = ''
  buffering.value = true
  currentTime.value = 0
  duration.value = 0
  seekDelta.value = null
  seekPending = false
  try {
    let url = ''
    if (current.src === 'torrent') {
      if (current.kind === 'tv' && !currentEpisode.value) throw new ApiError(409, 'NO_EPISODES')
      const choice = current.kind === 'tv' ? { season: currentEpisode.value!.season, episode: currentEpisode.value!.episode } : {}
      const ticket = await torrentPlaybackApi.playbackTicket(current.kind, Number(current.id), current.sourceId ? { ...choice, source_id: current.sourceId } : choice)
      if (id !== loadId) return
      url = ticket.stream_url
      if (!title.value) title.value = ticket.title
    } else if (current.kind === 'movie') {
      const res = await apiClient.startPlayback(current.id)
      if (id !== loadId) { void apiClient.stopPlayback(res.session_id, { keepalive: true }).catch(() => {}); return }
      if (!res.media_url) throw new Error('NO_MEDIA_URL')
      beginLease(res.session_id, res.heartbeat_interval_seconds)
      url = res.media_url
    } else {
      const episode = currentEpisode.value
      if (!episode?.episodeId) throw new ApiError(409, 'NO_EPISODES')
      const res = await apiClient.startSeriesPlayback(episode.episodeId)
      if (id !== loadId) return
      if (!res.media_url) throw new Error('NO_MEDIA_URL')
      url = res.media_url
    }
    streamUrl.value = url
    status.value = 'ready'
    showControls()
  } catch (error) {
    if (id !== loadId) return
    status.value = 'error'
    errorText.value = failText(error)
  }
}

async function start() {
  const current = target.value
  if (!current) {
    status.value = 'error'
    errorText.value = 'Не удалось определить видео. Нажмите «Назад», чтобы вернуться в каталог.'
    return
  }
  try { await loadInfo(current) } catch { /* the title card is optional */ }
  if (released) return
  // Re-entering the intro (its layer mounts again) restarts the 5 s minimum.
  if (phase.value !== 'intro') introStartedAt = introClock.now()
  phase.value = 'intro'
  introActive.value = true
  adEarlySettled = false
  adsReady.value = true
  clearTimeout(introFallbackTimer)
  introFallbackTimer = setTimeout(onIntroDone, INTRO_MAX_MS)
  void nextTick(() => { if (introPlayer.value && introPlayer.value.enabled === false) onIntroDone() })
  await loadStream()
}

async function startNativeOrHtml5(url: string) {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : ''
  tvDebugLog('info', `open: ${url}`)
  if (!hasTizenAvplay() && (ua.includes('tizen') || Boolean((window as unknown as { tizen?: unknown }).tizen))) {
    // Never fall back to <video> while $WEBAPIS/webapis.js may still be loading.
    await loadTizenWebApis()
    if (released || phase.value !== 'content' || streamUrl.value !== url) return
  }
  if (commercialReleasedAt) {
    const wait = DECODER_RELEASE_MS - (Date.now() - commercialReleasedAt)
    commercialReleasedAt = 0
    if (wait > 0) {
      await waitDecoderRelease(wait)
      if (released || phase.value !== 'content' || streamUrl.value !== url) return
    }
  }
  if (!hasTizenAvplay()) {
    tvDebugLog(ua.includes('tizen') ? 'warn' : 'info', `engine: HTML5 <video>${ua.includes('tizen') ? ' (webapis.avplay unavailable)' : ''}`)
    useNativeAvplay.value = false
    activeEngine.value = 'HTML5'
    void nextTick(play)
    return
  }
  if (nativeController) {
    nativeController.destroy()
    nativeController = null
  }
  tvDebugLog('info', 'engine: Tizen AVPlay (setDisplayRect 0,0,1920,1080, prepareAsync -> play)')
  useNativeAvplay.value = true
  activeEngine.value = 'Tizen AVPlay'
  document.documentElement.classList.add('tv-native-plane')
  void nextTick(() => {
    if (released || phase.value !== 'content' || streamUrl.value !== url) return
    nativeController = createTizenAvplayController(url, {
      onCanPlay() {
        buffering.value = false
        if (nativeController) {
          duration.value = nativeController.getDuration() || 0
          if (resumeAt > 0) {
            nativeController.seekTo(resumeAt)
            currentTime.value = resumeAt
            resumeAt = 0
          }
        }
      },
      onPlaying() {
        buffering.value = false
        onPlay()
      },
      onWaiting() {
        buffering.value = true
      },
      onTimeUpdate(cur, dur) {
        if (!seekPending) currentTime.value = cur
        if (dur > 0) duration.value = dur
        adPlayer.value?.tick()
        if (Date.now() - lastHistorySave >= HISTORY_SAVE_EVERY_MS) void saveHistory(false, false)
      },
      onTracksChanged(audioTracks, subtitleTracks) {
        audioOptions.value = audioTracks.map(({ label, active }) => ({ label, active }))
        subtitleOptions.value = subtitleTracks.map(({ label, active }) => ({ label, active }))
      },
      onEnded() {
        onEnded()
      },
      onError() {
        tvDebugLog('error', 'Tizen AVPlay onerror / prepareAsync failure')
        onMediaError()
      },
    })
    if (nativeController) {
      readTracks()
      const dur = nativeController.getDuration()
      if (dur > 0) duration.value = dur
      if (resumeAt > 0) {
        nativeController.seekTo(resumeAt)
        currentTime.value = resumeAt
        resumeAt = 0
      }
    } else {
      useNativeAvplay.value = false
      activeEngine.value = 'HTML5'
      document.documentElement.classList.remove('tv-native-plane')
      void nextTick(play)
    }
  })
}

const videoSrc = computed(() => (phase.value === 'content' && streamUrl.value && !useNativeAvplay.value ? streamUrl.value : undefined))
watch(
  () => (phase.value === 'content' && streamUrl.value ? streamUrl.value : undefined),
  (url) => { if (url) void startNativeOrHtml5(url) },
)

function onPageHide() {
  void saveHistory(false, true)
  endLease()
}

// Tizen suspend / Smart Hub: a hidden app gives the hardware decoder back and reopens at the same position.
function onVisibilityChange() {
  if (document.hidden) {
    if (!nativeController || phase.value !== 'content') return
    suspendedAt = mediaCurrentTime()
    tvDebugLog('info', `hidden: closing Tizen AVPlay at ${Math.round(suspendedAt)}s`)
    void saveHistory(false, true)
    nativeController.destroy()
    nativeController = null
    return
  }
  if (suspendedAt < 0 || released) return
  const url = streamUrl.value
  resumeAt = suspendedAt > 1 ? suspendedAt : 0
  suspendedAt = -1
  if (url && phase.value === 'content') {
    tvDebugLog('info', 'visible again: reopening the stream')
    void startNativeOrHtml5(url)
  }
}

onMounted(() => {
  document.documentElement.classList.add('tv-mode')
  installTvDebugConsole()
  registerTizenMediaKeys()
  void loadTizenWebApis()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void start()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  void saveHistory(false, true)
  release()
  document.documentElement.classList.remove('tv-mode')
})

defineExpose({ handle, phase, startFilm })
</script>

<template>
  <div
    class="tv-player"
    :class="{ 'controls-hidden': !controlsVisible && mode === 'playback' && !paused, 'tv-native-plane': useNativeAvplay }"
    data-testid="tv-player"
  >
    <object
      v-if="useNativeAvplay"
      id="av-player"
      type="application/avplayer"
      class="tv-video"
      style="position:fixed; left:0; top:0; width:100%; height:100%; z-index:-1;"
      data-testid="tv-avplayer"
    />
    <video
      v-else
      ref="video"
      class="tv-video"
      :src="videoSrc"
      :poster="backdrop || undefined"
      autoplay
      playsinline
      preload="auto"
      data-testid="tv-video"
      @play="onPlay"
      @playing="buffering = false"
      @waiting="buffering = true"
      @canplay="buffering = false"
      @pause="onPause"
      @timeupdate="onTimeUpdate"
      @durationchange="onDuration"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
      @error="onMediaError"
    />

    <AdPlaybackContainer
      v-if="adsReady && adTarget"
      ref="adPlayer"
      :main="adMainProxy"
      :source="streamUrl"
      :requested="phase !== 'intro'"
      :host-starts="true"
      :covered="phase === 'intro'"
      :surface="adSurface"
      v-bind="adTarget"
      data-testid="tv-ad-container"
      @started="onCommercialStarted"
      @settled="onAdsSettled"
    />

    <div v-if="phase === 'intro'" class="tv-intro-layer" data-testid="tv-intro-layer">
      <CinemaIntro ref="introPlayer" :active="introActive" :target="introTarget" @started="onIntroStarted" @finished="onIntroDone" />
    </div>

    <div v-if="phase === 'content' && (status === 'loading' || (status === 'ready' && buffering && !paused))" class="tv-spinner" role="status" aria-live="polite" data-testid="tv-player-loading">
      <span class="tv-spinner-ring" aria-hidden="true" />
      <span>{{ status === 'loading' ? 'Подготовка потока…' : 'Загрузка…' }}</span>
    </div>

    <section v-if="status === 'error' && (phase === 'content' || !target)" class="tv-player-error" role="alert" data-testid="tv-player-error">
      <h2>{{ title || 'Видео недоступно' }}</h2>
      <p>{{ errorText }}</p>
      <p class="tv-hint">OK — повторить · Назад — в каталог</p>
    </section>

    <div v-if="seekDelta !== null" class="tv-seek" role="status" aria-live="polite" data-testid="tv-seek">
      <strong>{{ formatSeekDelta(seekDelta) }}</strong>
      <span>{{ formatClock(seekTarget) }}<template v-if="duration"> / {{ formatClock(duration) }}</template></span>
    </div>

    <div v-if="status === 'ready' && paused && mode === 'playback'" class="tv-paused" aria-hidden="true" data-testid="tv-paused">❚❚</div>

    <header v-show="phase === 'content'" class="tv-player-top">
      <h1 data-testid="tv-player-title">{{ title || 'KINOSOTA' }}</h1>
      <p v-if="currentEpisode && isSeries">{{ currentEpisode.label }}</p>
    </header>

    <footer v-show="phase === 'content'" class="tv-player-bottom">
      <div class="tv-timeline" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс просмотра">
        <span class="tv-timeline-fill" :style="{ width: `${progress}%` }" />
        <span v-if="seekDelta !== null && duration" class="tv-timeline-target" :style="{ left: `${Math.min(100, (seekTarget / duration) * 100)}%` }" />
      </div>
      <div class="tv-time">
        <span data-testid="tv-time-current">{{ formatClock(currentTime) }}</span>
        <span class="tv-engine-badge" data-testid="tv-player-engine">{{ activeEngine }}</span>
        <span>{{ duration ? formatClock(duration) : '--:--' }}</span>
      </div>
      <p class="tv-hint">OK — {{ paused ? 'смотреть' : 'пауза' }} · ←/→ — перемотка · ↓ — дорожки и субтитры · ↑ — о фильме</p>
    </footer>

    <section v-if="mode === 'info'" class="tv-info" data-testid="tv-info" aria-label="О фильме">
      <h2>{{ title }}</h2>
      <p class="tv-info-meta">
        <span v-if="year">{{ year }}</span>
        <span v-if="currentEpisode && isSeries">{{ currentEpisode.label }}</span>
        <span v-if="duration">{{ formatClock(duration) }}</span>
      </p>
      <p v-if="overview" class="tv-info-overview">{{ overview }}</p>
    </section>

    <section v-if="mode === 'panel'" ref="panelRoot" class="tv-panel" data-testid="tv-panel" aria-label="Настройки воспроизведения">
      <div class="tv-panel-tabs" role="tablist">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="tv-panel-tab"
          :aria-selected="index === panelTab"
          :class="{ 'tv-focused': panelNav.isFocused('tabs', index), active: index === panelTab }"
          :data-tv-key="`tabs:${index}`"
          :data-testid="`tv-panel-tab-${tab.id}`"
          @click="panelTab = index"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="tv-panel-options" :class="{ episodes: activeTab === 'episodes' }">
        <button
          v-for="(option, index) in panelOptions"
          :key="`${activeTab}-${index}`"
          type="button"
          class="tv-panel-option"
          :class="{ 'tv-focused': panelNav.isFocused('options', index), active: option.active }"
          :data-tv-key="`options:${index}`"
          :data-testid="`tv-panel-option-${index}`"
          @click="onPanelSelect({ area: 'content', rowId: 'options', index })"
        >
          {{ option.label }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tv-player {
  position: fixed;
  inset: 0;
  z-index: 300;
  overflow: hidden;
  background: #000;
  color: #f5f5f7;
}

.tv-player.tv-native-plane,
.tv-player.tv-native-plane .tv-video {
  background: transparent;
}

.tv-intro-layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: #000;
}

.tv-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.tv-player-top,
.tv-player-bottom {
  position: absolute;
  left: 0;
  right: 0;
  padding: 4vh 5vw;
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.tv-player-top {
  top: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.75), transparent);
}

.tv-player-top h1 {
  margin: 0;
  font-size: clamp(28px, 2.2vw, 52px);
  font-weight: 800;
}

.tv-player-top p {
  margin: 1vh 0 0;
  color: #cbd5e1;
  font-size: clamp(18px, 1.3vw, 30px);
}

.tv-player-bottom {
  bottom: 0;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.85), transparent);
}

.controls-hidden .tv-player-top {
  opacity: 0;
  transform: translateY(-20px);
}

.controls-hidden .tv-player-bottom {
  opacity: 0;
  transform: translateY(20px);
}

.controls-hidden {
  cursor: none;
}

.tv-timeline {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  overflow: visible;
}

.tv-timeline-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: #f4d45e;
}

.tv-timeline-target {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 4px rgba(244, 212, 94, 0.6);
}

.tv-time {
  display: flex;
  justify-content: space-between;
  margin-top: 1.4vh;
  font-size: clamp(18px, 1.3vw, 30px);
  font-variant-numeric: tabular-nums;
}

.tv-hint {
  margin: 1.4vh 0 0;
  color: #9ca3af;
  font-size: clamp(16px, 1vw, 24px);
}

.tv-engine-badge {
  padding: 2px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #f4d45e;
  font-size: clamp(13px, 0.9vw, 20px);
  font-weight: 700;
}

.tv-seek {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1vh;
  padding: 3vh 4vw;
  border-radius: 24px;
  background: rgba(0, 0, 0, 0.7);
  transform: translate(-50%, -50%);
  font-variant-numeric: tabular-nums;
}

.tv-seek strong {
  font-size: clamp(56px, 5vw, 120px);
  font-weight: 900;
  color: #f4d45e;
}

.tv-seek span {
  font-size: clamp(22px, 1.6vw, 38px);
}

.tv-paused {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(120px, 9vw, 200px);
  height: clamp(120px, 9vw, 200px);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  transform: translate(-50%, -50%);
  font-size: clamp(44px, 3.4vw, 80px);
  letter-spacing: -0.1em;
}

.tv-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2vh;
  transform: translate(-50%, -50%);
  font-size: clamp(20px, 1.4vw, 32px);
}

.tv-spinner-ring {
  width: 80px;
  height: 80px;
  border: 6px solid rgba(255, 255, 255, 0.2);
  border-top-color: #f4d45e;
  border-radius: 50%;
  animation: tv-spin 0.9s linear infinite;
}

@keyframes tv-spin {
  to { transform: rotate(360deg); }
}

.tv-player-error {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(1100px, 86vw);
  padding: 5vh 4vw;
  border-radius: 28px;
  background: rgba(16, 18, 24, 0.92);
  transform: translate(-50%, -50%);
  text-align: center;
}

.tv-player-error h2 {
  margin: 0 0 2vh;
  font-size: clamp(28px, 2vw, 48px);
}

.tv-player-error p {
  margin: 0;
  font-size: clamp(20px, 1.4vw, 34px);
  color: #e5e7eb;
}

.tv-info {
  position: absolute;
  top: 16vh;
  left: 5vw;
  width: min(1100px, 60vw);
  padding: 4vh 3vw;
  border-radius: 24px;
  background: rgba(10, 12, 16, 0.88);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

.tv-info h2 {
  margin: 0 0 1.5vh;
  font-size: clamp(30px, 2.4vw, 56px);
}

.tv-info-meta {
  display: flex;
  gap: 1.5vw;
  margin: 0 0 2vh;
  color: #f4d45e;
  font-size: clamp(18px, 1.3vw, 30px);
  font-weight: 700;
}

.tv-info-overview {
  margin: 0;
  color: #d1d5db;
  font-size: clamp(18px, 1.3vw, 30px);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tv-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4vh 5vw 6vh;
  background: rgba(8, 9, 12, 0.96);
  box-shadow: 0 -30px 80px rgba(0, 0, 0, 0.6);
}

.tv-panel-tabs,
.tv-panel-options {
  display: flex;
  gap: 1.4vw;
}

.tv-panel-options {
  margin-top: 3vh;
  overflow-x: auto;
  scrollbar-width: none;
}

.tv-panel-options::-webkit-scrollbar {
  display: none;
}

.tv-panel-tab,
.tv-panel-option {
  flex: 0 0 auto;
  padding: 1.6vh 2vw;
  border: 4px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #d1d5db;
  font: inherit;
  font-size: clamp(18px, 1.3vw, 30px);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.tv-panel-tab.active,
.tv-panel-option.active {
  color: #f4d45e;
}

.tv-panel-tab.tv-focused,
.tv-panel-option.tv-focused,
.tv-panel-tab:hover,
.tv-panel-option:hover {
  border-color: #f4d45e;
  background: rgba(244, 212, 94, 0.14);
  color: #fff;
  transform: scale(1.05);
  outline: none;
}
</style>

<style>
html.tv-native-plane,
html.tv-native-plane body,
html.tv-native-plane #app {
  background: transparent !important;
  background-color: transparent !important;
}
</style>
