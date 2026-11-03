<script setup lang="ts">
/**
 * In-page player area: the PRO paywall for free users, access-check states and,
 * once a source is ready, an optional in-browser fallback. The primary
 * «▶ Смотреть» (KINOSOTA Player) lives in the detail info block.
 */
import { computed, ref, watch } from 'vue'
import TorrentPlaybackSubscription from './TorrentPlaybackSubscription.vue'
import { torrentPlaybackApi, type StreamChoice, type TorrentPlaybackStatus } from '@/api/torrents'
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
}>(), { poster: undefined, tmdbId: undefined, torrentStatus: undefined, ready: undefined, choice: undefined })
defineEmits<{retry: []}>()

const streamUrl = ref<string | null>(null)
const streamError = ref('')
const streamLoading = ref(false)
const root = ref<HTMLElement | null>(null)
const isPlayable = computed(() => props.ready !== undefined ? props.ready : props.torrentStatus === 'playable' || props.torrentStatus === 'partial')
const visible = computed(() => props.access !== true || props.accessError || isPlayable.value)

async function startPlayback() {
  if (!props.tmdbId || !isPlayable.value || streamLoading.value) return
  streamError.value = ''
  streamLoading.value = true
  try {
    const ticket = await torrentPlaybackApi.playbackTicket(props.kind, props.tmdbId, props.choice ?? {})
    streamUrl.value = ticket.stream_url
  } catch {
    streamError.value = 'Не удалось получить ссылку для воспроизведения. Повторите попытку.'
  } finally {
    streamLoading.value = false
  }
}

function stopPlayback() {
  streamUrl.value = null
  streamError.value = ''
}

/** Called from the «player is not installed» dialog. */
async function playInBrowser() {
  root.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  await startPlayback()
}
// Another quality / voice / episode: never keep playing the previous stream.
watch(() => JSON.stringify(props.choice ?? {}), stopPlayback)
watch(isPlayable, (ready) => { if (!ready) stopPlayback() })
defineExpose({ startPlayback, playInBrowser })
</script>
<template>
  <section v-if="visible" ref="root" class="torrent-player" data-testid="torrent-player" aria-label="Плеер фильма">
    <TorrentPlaybackSubscription v-if="access===false&&!accessError" :poster="poster" />
    <div v-else-if="accessError" class="torrent-player-state" role="alert"><h2>Не удалось проверить доступ к просмотру</h2><p>Каталог и описание доступны. Повторите проверку перед воспроизведением.</p><button type="button" @click="$emit('retry')">Повторить проверку</button></div>
    <div v-else-if="access===null" class="torrent-player-state is-compact" role="status"><p>Проверяем доступ к просмотру…</p></div>
    <template v-else>
      <div v-if="streamUrl" class="torrent-video-wrap">
        <video
          :src="streamUrl"
          controls
          autoplay
          preload="metadata"
          class="torrent-video"
          aria-label="Видеоплеер"
          @ended="stopPlayback"
        />
        <button type="button" class="stop-btn" @click="stopPlayback">✕ Закрыть плеер</button>
      </div>
      <div v-else class="torrent-player-state torrent-player-ready">
        <img v-if="poster" :src="poster" alt="" class="player-backdrop" loading="lazy" />
        <div class="player-ready-copy">
          <p v-if="torrentStatus==='partial'" class="status-hint">Доступны не все серии — остальные появятся позже.</p>
          <p v-if="streamError" role="alert" class="stream-error">{{ streamError }}</p>
          <button type="button" class="browser-play" :disabled="streamLoading" @click="startPlayback">
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
.torrent-video-wrap{position:relative;width:100%;background:#000}
.torrent-video{width:100%;display:block;max-height:80vh}
.stop-btn{position:absolute;top:12px;right:12px;background:rgba(0,0,0,.7);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:6px 12px;min-height:36px;cursor:pointer;font-size:13px}
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
