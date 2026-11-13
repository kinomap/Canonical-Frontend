<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { hideCinemaPrestart, isCinemaPrestartCompact, setCinemaPrestartCompact } from '@/composables/useCinemaPrestart'

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
    <Transition name="cinema-prestart">
      <section
        v-if="show"
        class="cinema-prestart"
        :class="{ 'is-compact': compact }"
        role="dialog"
        aria-modal="true"
        aria-label="Запуск фильма в KINOSOTA Player"
        tabindex="-1"
        @keydown.esc.stop.prevent="emit('cancel')"
      >
        <header class="cinema-prestart__top">
          <span class="cinema-prestart__brand">KINOSOTA <i>PLAYER</i></span>
          <div class="cinema-prestart__controls">
            <button type="button" class="cinema-prestart__control" :aria-label="compact ? 'Развернуть на весь экран' : 'Уменьшить окно'" @click="toggleCompact">□</button>
            <button type="button" class="cinema-prestart__control cinema-prestart__control--close" aria-label="Отменить запуск" @click="emit('cancel')">✕</button>
          </div>
        </header>
        <div class="cinema-prestart__scene" aria-hidden="true">
          <svg viewBox="0 0 560 250" role="presentation">
            <defs>
              <pattern id="cinema-holes" width="24" height="20" patternUnits="userSpaceOnUse">
                <rect x="5" y="3" width="11" height="5" rx="1" fill="#fff" />
                <rect x="5" y="12" width="11" height="5" rx="1" fill="#fff" />
              </pattern>
              <radialGradient id="cinema-glow"><stop stop-color="#ffb800" stop-opacity=".18"/><stop offset="1" stop-color="#ffb800" stop-opacity="0"/></radialGradient>
            </defs>
            <circle cx="145" cy="110" r="120" fill="url(#cinema-glow)"/><circle cx="415" cy="110" r="120" fill="url(#cinema-glow)"/>
            <path class="film" d="M145 51 Q280 28 415 51V72Q280 49 145 72Z"/>
            <path class="holes run" d="M145 51 Q280 28 415 51V72Q280 49 145 72Z"/>
            <path class="edge" d="M145 51Q280 28 415 51M145 72Q280 49 415 72"/>
            <g class="reel" transform="translate(145 111)"><circle r="70"/><circle r="55" class="inner"/><path d="M0-50V-14M0 14V50M-50 0H-14M14 0H50M-35-35L-11-11M11 11L35 35M35-35L11-11M-11 11L-35 35" class="spokes"/><circle r="13" class="hub"/><circle r="4" class="core"/></g>
            <g class="reel reverse" transform="translate(415 111)"><circle r="70"/><circle r="55" class="inner"/><path d="M0-50V-14M0 14V50M-50 0H-14M14 0H50M-35-35L-11-11M11 11L35 35M35-35L11-11M-11 11L-35 35" class="spokes"/><circle r="13" class="hub"/><circle r="4" class="core"/></g>
            <path class="film lower" d="M72 151Q280 206 488 151V172Q280 227 72 172Z"/><path class="holes run reverse" d="M72 151Q280 206 488 151V172Q280 227 72 172Z"/><path class="edge lower-edge" d="M72 151Q280 206 488 151M72 172Q280 227 488 172"/>
          </svg>
        </div>
        <p class="cinema-prestart__status" role="status" aria-live="polite">{{ status }}</p>
        <p class="cinema-prestart__hint">Нажмите ✕, чтобы отменить запуск</p>
      </section>
    </Transition>
  </Teleport>
</template>

<style>
.cinema-prestart{position:fixed;inset:0;z-index:30000;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:clamp(8px,2vh,20px);padding:clamp(16px,3vw,36px);overflow:hidden;background:#070b0e;color:#fff;font-family:Inter,"Segoe UI",sans-serif}
.cinema-prestart__top{position:absolute;top:clamp(12px,2vh,24px);left:clamp(16px,3vw,36px);right:clamp(16px,3vw,36px);display:flex;align-items:center;justify-content:space-between}.cinema-prestart__brand{color:#ffd400;font-size:clamp(12px,1.2vw,17px);font-weight:800;letter-spacing:.18em}.cinema-prestart__brand i{margin-left:8px;color:#fff;font-size:.72em;font-style:normal;opacity:.65}.cinema-prestart__controls{display:flex;gap:8px}
.cinema-prestart__control{display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid #ffffff2b;border-radius:9px;background:#11171c;color:#fff;font:inherit;font-size:19px;cursor:pointer}.cinema-prestart__control:hover,.cinema-prestart__control:focus-visible{border-color:#ffd400;background:#20272c;color:#ffd400;outline:2px solid #ffd400;outline-offset:2px}.cinema-prestart__control--close:hover{border-color:#ff776e;background:#321a1c;color:#fff}
.cinema-prestart__scene{width:min(78vw,800px);max-height:62vh;margin:auto auto 0;display:grid;place-items:center}.cinema-prestart__scene svg{display:block;width:100%;height:auto;overflow:visible}.film{fill:#171d21;stroke:#ffb800;stroke-width:1.4}.holes{fill:url(#cinema-holes);opacity:.8}.run{animation:cinema-run .45s linear infinite}.edge{fill:none;stroke:#ffd400;stroke-opacity:.65;stroke-width:1.5}.reel>circle:first-child{fill:#11181d;stroke:#ffd400;stroke-width:5}.reel .inner{fill:none;stroke:#ffb800;stroke-opacity:.72;stroke-width:1.5}.spokes{fill:none;stroke:#ffd400;stroke-width:7;stroke-linecap:round;transform-origin:center;animation:cinema-spin 2.3s linear infinite}.reel.reverse .spokes,.holes.reverse{animation-direction:reverse}.hub{fill:#ffb800}.core{fill:#070b0e}.lower{fill:#141a1e}.lower-edge{stroke-opacity:.44}
.cinema-prestart__status{width:min(820px,100%);margin:0 auto;text-align:center;color:#fff;font-size:clamp(15px,2vw,23px);font-weight:600;line-height:1.45}.cinema-prestart__hint{margin:0 auto auto;text-align:center;color:#ffffff94;font-size:13px}.cinema-prestart.is-compact{inset:25% auto auto 25%;width:50vw;height:50vh;min-width:0;min-height:0;border:1px solid #ffd40055;border-radius:16px;box-shadow:0 24px 90px #000b;padding:clamp(12px,2vw,24px)}.cinema-prestart.is-compact .cinema-prestart__scene{width:90%;max-height:48%}.cinema-prestart-enter-active,.cinema-prestart-leave-active{transition:opacity 350ms ease}.cinema-prestart-enter-from,.cinema-prestart-leave-to{opacity:0}
@keyframes cinema-spin{to{transform:rotate(360deg)}}@keyframes cinema-run{to{transform:translateX(-24px)}}@media(max-width:640px){.cinema-prestart__scene{width:94vw}.cinema-prestart.is-compact .cinema-prestart__brand{font-size:10px}.cinema-prestart.is-compact .cinema-prestart__control{width:30px;height:30px}}@media(prefers-reduced-motion:reduce){.cinema-prestart__spokes,.cinema-prestart__film-holes{animation-duration:8s}.cinema-prestart-enter-active,.cinema-prestart-leave-active,.cinema-prestart__control{transition-duration:.01ms}}
</style>
