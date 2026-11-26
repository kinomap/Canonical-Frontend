<script setup lang="ts">
/**
 * The KINOSOTA intro as a full-bleed layer. It starts on mount (the «Смотреть» click),
 * paints its first frame at once (poster + CSS background, never black) and, when
 * `active` turns false or the layer unmounts, fades its sound out while the parent
 * cross-fades the picture. Reduced motion shows the first frame only.
 * Ambient hold: a film slower than the clip never meets black. Near its end the clip is never
 * paused (no freeze, no stutter): it plays on to its natural end and rests on its final picture
 * (a custom clip cross-fades to its admin still), drifting in a slow zoom until the parent
 * dissolves it into the next stage.
 * The clip comes from the admin-managed config (GET /api/v1/cinema/intro, cached) and is always
 * streamed from a Media Node (https://<node>/intro/...); nothing of it is bundled with this site.
 * When the intro is switched off (or no node serves it) the layer is a plain backdrop and nothing plays.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DISSOLVE_MS, HOLD_LEAD_S, attachIntroAudio, introConfig, introEnabledFor, introSources, loadIntroConfig, prefersReducedMotion, startIntro, type IntroAudio, type IntroStart, type IntroTarget } from '@/lib/cinemaIntro'

/** `target`: the playback surface; the intro plays only where the admin enabled it. */
const props = withDefaults(defineProps<{ active?: boolean; fadeMs?: number; target?: IntroTarget }>(), { active: true, fadeMs: DISSOLVE_MS, target: undefined })
/** `finished`: the clip reached its final picture (or cannot play): the next stage (pre-roll / film) may start. */
const emit = defineEmits<{ started: [result: IntroStart]; finished: [] }>()
const video = ref<HTMLVideoElement | null>(null)
const still = prefersReducedMotion()
// Frozen at mount: a config refresh mid-launch never swaps the clip under the viewer.
const config = introConfig.value
const enabled = !!config.video_url && (props.target ? introEnabledFor(config, props.target) : config.enabled)
const sources = introSources(config)
const poster = config.poster_url
const backdrop = computed(() => (poster ? { backgroundImage: `url('${poster}')` } : undefined))
const holdStill = config.is_custom ? config.still_url : null
const holding = ref(false)
let audio: IntroAudio | null = null
let ending: Promise<void> | null = null

async function begin() {
  const media = video.value
  if (!media || still || !enabled) return
  audio = attachIntroAudio(media)
  emit('started', await startIntro(media))
}

/** Sound out over the dissolve, then pause. Safe to call more than once. */
function end(): Promise<void> {
  const media = video.value
  if (!media) return Promise.resolve()
  ending ??= (audio ? audio.fadeOut(props.fadeMs) : Promise.resolve())
    .catch(() => {})
    .finally(() => { try { media.pause() } catch { /* jsdom */ } })
  return ending
}

/**
 * Rest on the final picture while the next stage is still loading; the dissolve later takes it from here.
 * Never `pause()` here: the clip runs out naturally (the browser keeps its last frame), so there is no
 * visual freeze and no cut in the sound.
 */
function hold() {
  const media = video.value
  if (media && !ending) emit('finished')
  if (!media || holding.value || ending || !props.active) return
  holding.value = true
}
function onTime() {
  const media = video.value
  if (!media || holding.value) return
  const { duration, currentTime } = media
  if (Number.isFinite(duration) && duration > HOLD_LEAD_S && currentTime >= duration - HOLD_LEAD_S) hold()
}

watch(() => props.active, (active) => { if (!active) void end() })
onMounted(() => {
  void loadIntroConfig()
  if (props.active) void begin()
})
onBeforeUnmount(() => { void end() })
defineExpose({ end, enabled, holding })
</script>

<template>
  <div class="cinema-intro" :class="{ 'is-off': !enabled, 'is-holding': holding }" :style="enabled ? backdrop : undefined" aria-hidden="true" data-testid="cinema-intro" :data-intro-version="config.version">
    <template v-if="!enabled" />
    <img v-else-if="still" :src="poster" alt="" class="cinema-intro__media" />
    <video
      v-else
      ref="video"
      class="cinema-intro__media"
      :poster="poster"
      playsinline
      preload="auto"
      disablepictureinpicture
      disableremoteplayback
      tabindex="-1"
      @timeupdate="onTime"
      @ended="hold"
    >
      <source v-for="source in sources" :key="source.src" :src="source.src" :type="source.type" />
    </video>
    <img v-if="enabled && !still && holdStill" :src="holdStill" alt="" class="cinema-intro__media cinema-intro__hold" data-testid="cinema-intro-hold" />
  </div>
</template>

<style>
.cinema-intro{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#1d2e39 center/cover no-repeat}
.cinema-intro.is-off{background:#070b0e}
.cinema-intro__media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.cinema-intro__hold{opacity:0;transition:opacity 600ms ease}
.cinema-intro.is-holding .cinema-intro__hold{opacity:1}
.cinema-intro.is-holding .cinema-intro__media{animation:cinema-intro-ambient 24s cubic-bezier(.22,.61,.36,1) forwards;transform-origin:50% 50%}
@keyframes cinema-intro-ambient{from{transform:scale(1)}to{transform:scale(1.05)}}
@media (prefers-reduced-motion: reduce){.cinema-intro.is-holding .cinema-intro__media{animation:none}}
</style>
