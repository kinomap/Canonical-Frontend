<script setup lang="ts">
/**
 * «Смотреть» → KINOSOTA Player hand-off: the KINOSOTA intro plays at once (first frame
 * on the very first paint) while the site opens the desktop player. When the
 * player has taken over, the overlay cross-dissolves away and the intro sound
 * fades out with it — no reels, no emblem, no pause in between.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CinemaIntro from '@/components/CinemaIntro.vue'
import { hideCinemaPrestart, isCinemaPrestartCompact, setCinemaPrestartCompact } from '@/composables/useCinemaPrestart'
import { DISSOLVE_MS } from '@/lib/cinemaIntro'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ cancel: [] }>()
const compact = ref(false)
const elapsed = ref(0)
let startedAt = 0
let ticker: ReturnType<typeof setInterval> | undefined

const status = computed(() => elapsed.value >= 4000
  ? 'Подключение плеера…'
  : elapsed.value >= 2000
    ? 'Подготовка видеопотока…'
    : 'Фильм уже запускается, подождите немного…')

function stopTicker() {
  if (ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

function removeListeners() {
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

function toggleCompact() {
  compact.value = !compact.value
  setCinemaPrestartCompact(compact.value)
}

function handoffHide() {
  if (!props.show) return
  stopTicker()
  removeListeners()
  hideCinemaPrestart()
}

function onVisibilityChange() {
  // Hide only when the tab itself is hidden (navigated away / minimised), not when
  // the browser loses focus to the desktop player window that just opened.
  if (props.show && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    handoffHide()
  }
}

watch(() => props.show, (visible) => {
  stopTicker()
  removeListeners()
  if (!visible) return
  compact.value = isCinemaPrestartCompact()
  elapsed.value = 0
  startedAt = Date.now()
  ticker = setInterval(() => { elapsed.value = Date.now() - startedAt }, 200)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
}, { immediate: true })

onBeforeUnmount(() => {
  stopTicker()
  removeListeners()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cinema-prestart" :duration="{ enter: 0, leave: DISSOLVE_MS }">
      <section
        v-if="show"
        class="cinema-prestart"
        :class="{ 'is-compact': compact }"
        :style="{ '--cinema-dissolve': `${DISSOLVE_MS}ms` }"
        role="dialog"
        aria-modal="true"
        aria-label="Запуск фильма в KINOSOTA Player"
        tabindex="-1"
        @keydown.esc.stop.prevent="emit('cancel')"
      >
        <CinemaIntro class="cinema-prestart__intro" />
        <header class="cinema-prestart__top">
          <div class="cinema-prestart__controls">
            <button type="button" class="cinema-prestart__control" :aria-label="compact ? 'Развернуть на весь экран' : 'Уменьшить окно'" @click="toggleCompact">□</button>
            <button type="button" class="cinema-prestart__control cinema-prestart__control--close" aria-label="Отменить запуск" @click="emit('cancel')">✕</button>
          </div>
        </header>
        <footer class="cinema-prestart__caption">
          <p class="cinema-prestart__status" role="status" aria-live="polite">{{ status }}</p>
          <p class="cinema-prestart__hint">Нажмите ✕, чтобы отменить запуск</p>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style>
.cinema-prestart{position:fixed;inset:0;z-index:30000;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;background:#1d2e39;color:#fff;font-family:Inter,"Segoe UI",sans-serif;isolation:isolate}
.cinema-prestart__top{position:absolute;z-index:1;top:clamp(12px,2vh,24px);right:clamp(16px,3vw,36px)}.cinema-prestart__controls{display:flex;gap:8px}
.cinema-prestart__control{display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid #ffffff2b;border-radius:9px;background:#070b0e75;color:#fff;font:inherit;font-size:19px;cursor:pointer;backdrop-filter:blur(6px)}.cinema-prestart__control:hover,.cinema-prestart__control:focus-visible{border-color:#ffd400;background:#20272cd9;color:#ffd400;outline:2px solid #ffd400;outline-offset:2px}.cinema-prestart__control--close:hover{border-color:#ff776e;background:#321a1cd9;color:#fff}
.cinema-prestart__caption{position:relative;z-index:1;padding:clamp(48px,10vh,120px) clamp(16px,3vw,36px) clamp(16px,3vh,32px);background:linear-gradient(to bottom,#070b0e00,#070b0ecc);text-align:center}
.cinema-prestart__status{width:min(820px,100%);margin:0 auto;color:#fff;font-size:clamp(14px,1.5vw,18px);font-weight:600;line-height:1.45;text-shadow:0 1px 8px #000a}.cinema-prestart__hint{margin:4px auto 0;color:#ffffffa8;font-size:13px}
.cinema-prestart.is-compact{inset:25% auto auto 25%;width:50vw;height:50vh;min-width:0;min-height:0;border:1px solid #ffd40055;border-radius:16px;box-shadow:0 24px 90px #000b}
.cinema-prestart-leave-active{transition:opacity var(--cinema-dissolve,900ms) cubic-bezier(.45,0,.55,1),filter var(--cinema-dissolve,900ms) ease}
.cinema-prestart-leave-to{opacity:0;filter:brightness(.82)}
@media(max-width:640px){.cinema-prestart.is-compact .cinema-prestart__control{width:30px;height:30px}}
@media(prefers-reduced-motion:reduce){.cinema-prestart-leave-active{transition-duration:.01ms}.cinema-prestart__control{transition-duration:.01ms}}
</style>
