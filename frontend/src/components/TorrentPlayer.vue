<script setup lang="ts">
/**
 * In-page player area: the PRO paywall for free users, access-check states and,
 * once a source is ready, an optional in-browser fallback. The primary
 * «▶ Смотреть» (KINOSOTA Player) lives in the detail info block.
 *
 * Browsers decode only a baseline of codecs; KINOSOTA Player decodes all of
 * them. When the selected release names codecs this browser lacks, or the
 * video fails / plays without picture or sound, this window shows the
 * incompatibility notice with «Продолжить в KINOSOTA Player» (the app opens by itself);
 * its ✕ closes the notice and leaves the viewer on the page.
 *
 * The video box keeps the 16:9 proportions of the ready card before, during and
 * after the stream starts; a launch overlay («Запуск воспроизведения…») covers it
 * until the first frame plays and then fades out.
 */
import { computed, ref, watch } from 'vue'
import TorrentPlaybackSubscription from './TorrentPlaybackSubscription.vue'
import PlaybackCompatibility from './PlaybackCompatibility.vue'
import { torrentPlaybackApi, type StreamChoice, type TorrentPlaybackStatus } from '@/api/torrents'
import { codecList, missingPicture, soundWatcher, unsupportedCodecs, type CompatibilityIssue } from '@/lib/browserCodecs'
const props = withDefaults(defineProps<{
  access: boolean | null
  accessError: boolean
  poster?: string
  kind: 'movie' | 'tv'
  tmdbId?: number
  torrentStatus?: TorrentPlaybackStatus
  /** Selected source is prepared (wins over torrentStatus when given). */
  ready?: boolean
  choice?: StreamChoice
  /** Release name of the selected source: the codecs it names are checked against this browser. */
  sourceTitle?: string
  /** KINOSOTA Player hand-off state, owned by the detail page. */
  launchBusy?: boolean
  launchMessage?: string
  launchError?: string
}>(), { poster: undefined, tmdbId: undefined, torrentStatus: undefined, ready: undefined, choice: undefined, sourceTitle: undefined, launchBusy: false, launchMessage: '', launchError: '' })
const emit = defineEmits<{retry: []; desktop: []}>()

const streamUrl = ref<string | null>(null)
const streamError = ref('')
const streamLoading = ref(false)
/** From «Смотреть в браузере» until the video really plays; cleared on an error or stop. */
const launching = ref(false)
const root = ref<HTMLElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const isPlayable = computed(() => props.ready !== undefined ? props.ready : props.torrentStatus === 'playable' || props.torrentStatus === 'partial')
const visible = computed(() => props.access !== true || props.accessError || isPlayable.value)
/** Codecs named by the selected release that this browser cannot decode. */
const risks = computed(() => unsupportedCodecs(props.sourceTitle))
const riskText = computed(() => codecList(risks.value))
/** The viewer chose the browser despite the warning for this source. */
const riskAccepted = ref(false)
/** The browser failed to decode (stream stopped) or silently lost picture / sound (video paused). */
const issue = ref<null | { kind: CompatibilityIssue; stopped: boolean }>(null)
const warnBefore = computed(() => risks.value.length > 0 && !riskAccepted.value)
let ignoreSilent = false
/** Bumped by every start and stop: a ticket that arrives late never starts a stale stream. */
let launchId = 0
const sound = soundWatcher(4)

async function startPlayback(force = false) {
  if (!props.tmdbId || !isPlayable.value || streamLoading.value) return
  if (force) riskAccepted.value = true
  // A release with codecs this browser lacks: the notice is on screen first.
  if (warnBefore.value) return
  const id = ++launchId
  issue.value = null
  streamError.value = ''
  streamLoading.value = true
  launching.value = true
  try {
    const ticket = await torrentPlaybackApi.playbackTicket(props.kind, props.tmdbId, props.choice ?? {})
    // Closed, or another quality / voice / episode was picked meanwhile.
    if (id !== launchId) return
    sound.reset()
    ignoreSilent = false
    streamUrl.value = ticket.stream_url
  } catch {
    if (id !== launchId) return
    launching.value = false
    streamError.value = 'Не удалось получить ссылку для воспроизведения. Повторите попытку.'
  } finally {
    if (id === launchId) streamLoading.value = false
  }
}

function stopPlayback() {
  launchId++
  streamUrl.value = null
  streamError.value = ''
  streamLoading.value = false
  launching.value = false
}

function reset() {
  stopPlayback()
  issue.value = null
  riskAccepted.value = false
}

/** Called from the «player is not installed» dialog: the viewer explicitly picked the browser. */
async function playInBrowser() {
  root.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  await startPlayback(true)
}

function onVideoError() {
  const code = video.value?.error?.code ?? 0
  stopPlayback()
  // 3 = decode, 4 = format / codecs not supported; anything else is the connection.
  if (code === 3 || code === 4) issue.value = { kind: risks.value.length || code === 3 ? 'codec' : 'container', stopped: true }
  else streamError.value = 'Воспроизведение прервалось. Проверьте соединение и повторите попытку.'
}
function silent(kind: 'video' | 'audio') {
  video.value?.pause()
  launching.value = false
  issue.value = { kind, stopped: false }
}
function onMetadata() {
  if (video.value && !ignoreSilent && missingPicture(video.value)) silent('video')
}
/** canplay / playing / the first timeupdate: the stream is on screen, fade the launch overlay out. */
function onStarted() {
  launching.value = false
}
function onTime() {
  const v = video.value
  if (v && launching.value && v.currentTime > 0) onStarted()
  if (v && !ignoreSilent && !issue.value && sound.check(v)) silent('audio')
}
/** «Смотреть в браузере» on the notice: resume the paused video, or try the stream again. */
function browseAnyway() {
  const current = issue.value
  issue.value = null
  if (current && !current.stopped && video.value) {
    ignoreSilent = true
    const played = video.value.play() as Promise<void> | undefined
    played?.catch?.(() => {})
    return
  }
  void startPlayback(true)
}
/** ✕ on the notice: close it and stay on the page; a paused video does not raise it again. */
function closeNotice() {
  const current = issue.value
  issue.value = null
  riskAccepted.value = true
  if (current && !current.stopped) ignoreSilent = true
}
// Another quality / voice / episode: never keep playing the previous stream.
watch(() => JSON.stringify(props.choice ?? {}), reset)
watch(() => props.sourceTitle, () => { riskAccepted.value = false })
watch(isPlayable, (ready) => { if (!ready) reset() })
defineExpose({ startPlayback, playInBrowser })
</script>
<template>
  <section v-if="visible" ref="root" class="torrent-player" data-testid="torrent-player" aria-label="Плеер фильма">
    <TorrentPlaybackSubscription v-if="access===false&&!accessError" :poster="poster" />
    <div v-else-if="accessError" class="torrent-player-state" role="alert"><h2>Не удалось проверить доступ к просмотру</h2><p>Каталог и описание доступны. Повторите проверку перед воспроизведением.</p><button type="button" @click="$emit('retry')">Повторить проверку</button></div>
    <div v-else-if="access===null" class="torrent-player-state is-compact" role="status"><p>Проверяем доступ к просмотру…</p></div>
    <template v-else>
      <div v-if="streamUrl || launching" class="torrent-video-wrap" :class="{ 'has-notice': issue }" :aria-busy="launching" data-testid="torrent-video-wrap">
        <video
          v-if="streamUrl"
          ref="video"
          :src="streamUrl"
          controls
          autoplay
          preload="metadata"
          class="torrent-video"
          aria-label="Видеоплеер"
          @ended="stopPlayback"
          @error="onVideoError"
          @loadedmetadata="onMetadata"
          @canplay="onStarted"
          @playing="onStarted"
          @timeupdate="onTime"
        />
        <div class="launch-overlay" :class="{ 'is-hidden': !launching }" role="status" aria-live="polite" :aria-hidden="launching ? undefined : 'true'" data-testid="launch-overlay">
          <img v-if="poster" :src="poster" alt="" class="launch-backdrop" />
          <span class="launch-spinner" aria-hidden="true"></span>
          <p class="launch-title">Запуск воспроизведения…</p>
          <p class="launch-hint">{{ streamUrl ? 'Загружаем первые секунды видео…' : 'Подготовка потока…' }}</p>
        </div>
        <button v-if="!issue" type="button" class="stop-btn" @click="stopPlayback">✕ Закрыть плеер</button>
        <PlaybackCompatibility v-else overlay can-browse :issue="issue.kind" :busy="launchBusy" :status="launchMessage" :error="launchError" @desktop="emit('desktop')" @browser="browseAnyway" @close="closeNotice" />
      </div>
      <PlaybackCompatibility v-else-if="issue || warnBefore" :poster="poster" :codecs="issue ? '' : riskText" :issue="issue ? issue.kind : null" can-browse :busy="launchBusy" :status="launchMessage" :error="launchError" @desktop="emit('desktop')" @browser="browseAnyway" @close="closeNotice" />
      <div v-else class="torrent-player-state torrent-player-ready">
        <img v-if="poster" :src="poster" alt="" class="player-backdrop" loading="lazy" />
        <div class="player-ready-copy">
          <p v-if="torrentStatus==='partial'" class="status-hint">Доступны не все серии — остальные появятся позже.</p>
          <p v-if="streamError" role="alert" class="stream-error">{{ streamError }}</p>
          <button type="button" class="browser-play" :disabled="streamLoading" @click="startPlayback()">
            {{ streamLoading ? 'Подготовка…' : '▶ Смотреть в браузере' }}
          </button>
          <p class="player-note">Максимальное качество и все аудиодорожки — в приложении KINOSOTA Player.</p>
        </div>
      </div>
    </template>
  </section>
</template>
<style scoped>
.torrent-player{margin-top:32px;width:100%;min-width:0;box-sizing:border-box;border:1px solid #313131;border-radius:12px;background:#090b0e;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr)}
.torrent-player :deep(.subscription-player){border:0;border-radius:0}
.torrent-player-state{aspect-ratio:16/9;min-height:360px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;padding:40px 24px;text-align:center;color:#fff}
.torrent-player-state h2{font-size:24px;line-height:32px;margin:0;text-wrap:balance}.torrent-player-state p{max-width:620px;margin:0;color:#dedede;font-size:16px;line-height:24px}
.torrent-player-state button,.torrent-player-state a{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;box-sizing:border-box;border:1px solid #f4cc4c;border-radius:8px;background:#f4cc4c;color:#131209;text-decoration:none;cursor:pointer}
.torrent-player-state button:focus-visible,.torrent-player-state a:focus-visible{outline:2px solid #fff;outline-offset:4px}
/* The same 16:9 box as the ready card before, during and after the stream starts. */
.torrent-video-wrap{position:relative;width:100%;aspect-ratio:16/9;min-height:360px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;border-radius:12px}
.torrent-video-wrap.has-notice{min-height:420px}
.torrent-player :deep(.compatibility:not(.is-overlay)){border:0;border-radius:0}
.torrent-video{width:100%;height:100%;object-fit:contain;display:block}
.launch-overlay{position:absolute;inset:0;z-index:2;isolation:isolate;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;box-sizing:border-box;background:#090b0e;color:#fff;text-align:center;opacity:1;visibility:visible;transition:opacity .4s ease,visibility 0s linear 0s}
.launch-overlay.is-hidden{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s ease,visibility 0s linear .4s}
.launch-backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:.35}
.launch-overlay:before{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at center,rgba(9,11,14,.45),rgba(9,11,14,.92))}
.launch-spinner{width:48px;height:48px;box-sizing:border-box;border-radius:50%;border:3px solid rgba(255,255,255,.18);border-top-color:#f4cc4c;animation:launch-spin .9s linear infinite}
.launch-title{margin:0;font-size:18px;line-height:26px;font-weight:600}
.launch-hint{margin:0;font-size:14px;line-height:20px;color:#cfd8dc}
@keyframes launch-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.launch-spinner{animation-duration:2.4s}.launch-overlay,.launch-overlay.is-hidden{transition:none}}
.stop-btn{z-index:3;position:absolute;top:12px;right:12px;background:rgba(0,0,0,.7);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:6px 12px;min-height:36px;cursor:pointer;font-size:13px}
.status-hint{font-size:14px;color:#9ce8d7;margin:0 0 8px}
.stream-error{color:#ff6b6b;font-size:14px;margin:0 0 8px}
@media(max-width:600px){.torrent-player-state{aspect-ratio:auto;min-height:400px;padding:24px 16px}}
.torrent-player-state.is-compact{aspect-ratio:auto;min-height:96px;padding:24px}
.torrent-player-ready{position:relative;overflow:hidden;isolation:isolate}
.player-backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:.45}
.torrent-player-ready:before{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at center,rgba(9,11,14,.35),rgba(9,11,14,.9))}
.player-ready-copy{display:flex;flex-direction:column;align-items:center;gap:12px}
.torrent-player-state .browser-play{background:rgba(9,11,14,.6);color:#fff;border:1px solid rgba(255,255,255,.55);min-height:48px;padding:10px 22px;font-weight:600}
.torrent-player-state .browser-play:hover:not(:disabled){border-color:#fff;background:rgba(9,11,14,.8)}
.player-note{font-size:14px!important;line-height:20px!important;color:#cfd8dc!important}
</style>
