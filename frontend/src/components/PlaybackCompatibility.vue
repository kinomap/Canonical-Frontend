<script setup lang="ts">
/**
 * The incompatibility notice shown in the player window: the browser cannot
 * play this film's codecs, KINOSOTA Player can. «Продолжить в KINOSOTA Player»
 * hands the film over to the installed app, which opens by itself; ✕ closes
 * the notice (the page decides what stays on screen).
 */
import { computed } from 'vue'
import type { CompatibilityIssue } from '@/lib/browserCodecs'
const props = withDefaults(defineProps<{
  poster?: string
  /** Codecs named by the release, e.g. «HEVC (H.265) и DTS». */
  codecs?: string
  /** The chosen voice the browser cannot play (no ready release has it as the first track)… */
  voice?: string
  /** …and the first track of the file: the voice the browser plays instead. */
  playing?: string
  issue?: CompatibilityIssue
  /** Drawn over a paused video instead of replacing the player. */
  overlay?: boolean
  /** The browser can still try (no sound / risky release); a fatal decode error cannot. */
  canBrowse?: boolean
  busy?: boolean
  status?: string
  error?: string
  /** false: KINOSOTA Player needs PRO for this account; null: unknown. */
  pro?: boolean | null
}>(), { poster: undefined, codecs: '', voice: '', playing: '', issue: null, overlay: false, canBrowse: false, busy: false, status: '', error: '', pro: null })
const emit = defineEmits<{ desktop: []; browser: []; close: [] }>()

const lead = computed(() => {
  if (props.codecs) return `Этот фильм записан кодеками, которые ваш браузер не воспроизводит: ${props.codecs}.`
  switch (props.issue) {
    case 'container': return 'Формат файла этого фильма или его кодеки не поддерживаются вашим браузером.'
    case 'pixel': return 'Видео этого фильма записано в формате изображения (например, 10 бит), который кодеки вашего браузера не поддерживают.'
    case 'video': return 'Браузер воспроизводит звук, но не может показать изображение: видеокодек этого фильма не поддерживается.'
    case 'audio': return 'Браузер показывает изображение, но не воспроизводит звук: аудиокодек этого фильма (например, AC-3 или DTS) не поддерживается.'
    default: return 'Видео или звук этого фильма записаны кодеками, которые ваш браузер не поддерживает.'
  }
})
/** Only the voice is the problem: the browser plays the file, but another track. */
const voiceOnly = computed(() => !!props.voice && !props.codecs && !props.issue)
const heading = computed(() => voiceOnly.value ? 'Выбранная озвучка недоступна в браузере' : 'Фильм несовместим с вашим браузером')
const voiceText = computed(() => {
  if (!props.voice) return ''
  const instead = props.playing ? ` — «${props.playing}»` : ''
  return `Браузер воспроизводит только первую аудиодорожку раздачи${instead}. Выбранная озвучка «${props.voice}» звучит только в KINOSOTA Player.`
})
const browseLabel = computed(() => {
  if (props.codecs && /AC-3|DTS|TrueHD|PCM|FLAC|Layer II/.test(props.codecs) && !/HEVC|AV1|VC-1|MPEG-2|XviD/.test(props.codecs)) return 'Смотреть в браузере без звука'
  if (props.issue === 'audio') return 'Смотреть в браузере без звука'
  if (props.issue === 'codec' || props.issue === 'container') return 'Попробовать ещё раз в браузере'
  return 'Всё равно смотреть в браузере'
})
</script>
<template>
 <section class="compatibility" :class="{ 'is-overlay': overlay }" role="alert" aria-labelledby="compatibility-title" data-testid="codec-notice">
  <img v-if="poster && !overlay" :src="poster" alt="" class="compatibility-backdrop" loading="lazy" />
  <div class="compatibility-card">
   <div class="compatibility-badge" aria-hidden="true">!</div>
   <h2 id="compatibility-title">{{ heading }}</h2>
   <p v-if="!voiceOnly" class="compatibility-lead">{{ lead }}</p>
   <p v-if="voiceText" class="compatibility-lead" data-testid="codec-notice-voice">{{ voiceText }}</p>
   <p>В KINOSOTA Player таких ограничений нет: продолжите просмотр в нём — плеер откроется автоматически, запускать его отдельно на компьютере не нужно.</p>
   <div class="compatibility-actions">
    <router-link v-if="pro === false" class="primary" to="/profile?tab=billing">Оформить PRO</router-link>
    <button v-else type="button" class="primary" data-testid="codec-notice-desktop" :disabled="busy" :aria-busy="busy" @click="emit('desktop')">{{ busy ? 'Открываем KINOSOTA Player…' : '▶ Продолжить в KINOSOTA Player' }}</button>
    <button v-if="canBrowse" type="button" class="secondary" data-testid="codec-notice-browser" @click="emit('browser')">{{ browseLabel }}</button>
   </div>
   <p v-if="pro === false" class="compatibility-note">KINOSOTA Player — приложение для Windows, macOS и Linux, доступно с подпиской PRO.</p>
   <p v-if="status" class="compatibility-status" role="status">{{ status }}</p>
   <p v-if="error" class="compatibility-error" role="alert">{{ error }}</p>
   <p class="compatibility-links"><router-link to="/profile#desktop-player">Скачать KINOSOTA Player</router-link><span aria-hidden="true">·</span><router-link to="/player">Подробнее о KINOSOTA Player</router-link></p>
  </div>
  <button type="button" class="compatibility-close" aria-label="Закрыть" title="Закрыть" data-testid="codec-notice-close" @click="emit('close')">✕</button>
 </section>
</template>
<style scoped>
.compatibility{position:relative;isolation:isolate;overflow:hidden;width:100%;aspect-ratio:16/9;min-height:340px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:clamp(20px,4vw,48px);background:#0b0f12;border:1px solid #b88d27;border-radius:12px;color:#eef2f6;text-align:center}
.compatibility.is-overlay{position:absolute;inset:0;z-index:40;aspect-ratio:auto;min-height:0;border:0;border-radius:0;background:rgba(5,7,9,.9);overflow:auto}
.compatibility-backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:.3}
.compatibility:before{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at center,rgba(11,15,18,.55),rgba(11,15,18,.95))}
.compatibility.is-overlay:before{display:none}
.compatibility-card{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:640px}
.compatibility-badge{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#ffc400;color:#141414;font-weight:800;font-size:26px;line-height:1}
.compatibility h2{font-size:clamp(20px,2.6vw,28px);margin:0;line-height:1.25;text-wrap:balance}
.compatibility p{margin:0;color:#c2cbd3;line-height:1.55;font-size:15px}
.compatibility .compatibility-lead{color:#ffe08a;font-weight:600}
.compatibility-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:6px}
.compatibility .primary,.compatibility .secondary{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:10px 20px;box-sizing:border-box;border-radius:10px;font-weight:700;text-decoration:none;cursor:pointer}
.compatibility .primary{background:#ffc400;color:#141414;border:1px solid #ffc400}
.compatibility .primary:disabled{opacity:.7;cursor:progress}
.compatibility .secondary{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)}
.compatibility .secondary:hover{border-color:#fff}
.compatibility .primary:focus-visible,.compatibility .secondary:focus-visible,.compatibility-links a:focus-visible{outline:2px solid #fff;outline-offset:3px}
.compatibility .compatibility-status{color:#9ce8d7}
.compatibility .compatibility-error{color:#ff8a8a}
.compatibility .compatibility-note{font-size:14px}
.compatibility-links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;font-size:14px!important}
.compatibility-links a{color:#ffce40;min-height:32px;display:inline-flex;align-items:center}
.compatibility-close{position:absolute;top:12px;right:12px;z-index:1;display:grid;place-items:center;width:36px;height:36px;padding:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(5,7,9,.55);color:#fff;font:inherit;font-size:16px;line-height:1;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.compatibility-close:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.6)}
.compatibility-close:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media(max-width:600px){.compatibility{aspect-ratio:auto;min-height:380px;padding:24px 16px}}
</style>
