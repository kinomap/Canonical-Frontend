<script setup lang="ts">
/**
 * The KINOSOTA intro as a full-bleed layer. It starts on mount (the «Смотреть» click),
 * paints its first frame at once (poster + CSS background, never black) and, when
 * `active` turns false or the layer unmounts, fades its sound out while the parent
 * cross-fades the picture. Reduced motion shows the first frame only.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DISSOLVE_MS, INTRO_POSTER, INTRO_SOURCES, attachIntroAudio, prefersReducedMotion, startIntro, type IntroAudio, type IntroStart } from '@/lib/cinemaIntro'

const props = withDefaults(defineProps<{ active?: boolean; fadeMs?: number }>(), { active: true, fadeMs: DISSOLVE_MS })
const emit = defineEmits<{ started: [result: IntroStart] }>()
const video = ref<HTMLVideoElement | null>(null)
const still = prefersReducedMotion()
let audio: IntroAudio | null = null
let ending: Promise<void> | null = null

async function begin() {
  const media = video.value
  if (!media || still) return
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

watch(() => props.active, (active) => { if (!active) void end() })
onMounted(() => { if (props.active) void begin() })
onBeforeUnmount(() => { void end() })
defineExpose({ end })
</script>

<template>
  <div class="cinema-intro" aria-hidden="true" data-testid="cinema-intro">
    <img v-if="still" :src="INTRO_POSTER" alt="" class="cinema-intro__media" />
    <video
      v-else
      ref="video"
      class="cinema-intro__media"
      :poster="INTRO_POSTER"
      playsinline
      preload="auto"
      disablepictureinpicture
      disableremoteplayback
      tabindex="-1"
    >
      <source v-for="source in INTRO_SOURCES" :key="source.src" :src="source.src" :type="source.type" />
    </video>
  </div>
</template>

<style>
.cinema-intro{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#1d2e39 url('/cinema/intro/kinosota-intro-v1.jpg') center/cover no-repeat}
.cinema-intro__media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
</style>
