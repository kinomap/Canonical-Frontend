<script setup lang="ts">
/**
 * Prestart intro CMS (Ad Studio): preview of the active intro, MP4/WebM upload with progress,
 * six independent playback targets (browser / desktop player / Smart TV × Telegram / torrents),
 * Media Node sync status and reset to the standard KINOSOTA intro. Web, TV and desktop players
 * pick the change up on their own (GET /api/v1/cinema/intro), no rebuilds. The intro is a brand
 * bumper, not an ad slot. ZERO MEDIA ON VPS1/VPS2: the clip (default and uploaded) is served only
 * by the Media Nodes (https://<node>/intro/...); the preview plays from a node as well.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'

type IntroTarget = 'browser_telegram' | 'player_telegram' | 'browser_torrents' | 'player_torrents' | 'tv_telegram' | 'tv_torrent'
type IntroTargets = Record<IntroTarget, boolean>
interface IntroView {
  enabled: boolean; targets?: IntroTargets; version: string; video_url: string; webm_url: string | null; still_url: string; poster_url?: string
  duration_ms: number; is_custom: boolean; processing: boolean; last_error: string | null; original_name?: string | null
  byte_size?: number | null; max_upload_bytes: number
  nodes?: IntroNodes
}
/** How many live Media Nodes report the intro files (cinema_intro_node_caches). */
interface IntroNodes { reporting: number; default_ready: number; custom_ready: number; errors: string[] }
const endpoint = '/api/v1/admin/cinema/intro'
const headers = () => ({ Authorization: 'Bearer ' + (localStorage.getItem('admin_token') || 'cookie-session') })
const view = ref<IntroView | null>(null), busy = ref(false), uploading = ref(false), progress = ref(0)
const error = ref(''), notice = ref(''), dragging = ref(false), fileInput = ref<HTMLInputElement | null>(null)
let poll: ReturnType<typeof setInterval> | null = null, disposed = false
const maxBytes = computed(() => view.value?.max_upload_bytes || 50_000_000)
const seconds = computed(() => ((view.value?.duration_ms || 0) / 1000).toFixed(1))
const previewKey = computed(() => view.value ? view.value.version : '')
const TARGETS: { key: IntroTarget; label: string }[] = [
  { key: 'browser_telegram', label: 'Браузер: Telegram-стримы' },
  { key: 'player_telegram', label: 'Десктоп-плеер: Telegram-стримы' },
  { key: 'browser_torrents', label: 'Браузер: Торрент-стримы' },
  { key: 'player_torrents', label: 'Десктоп-плеер: Торрент-стримы' },
  { key: 'tv_telegram', label: 'Smart TV: Telegram-стримы' },
  { key: 'tv_torrent', label: 'Smart TV: Торрент-стримы' },
]
/** Smart TV targets saved before they existed follow their browser counterpart (backend TV_TARGET_PARENTS). */
const TV_TARGET_PARENTS: Partial<Record<IntroTarget, IntroTarget>> = { tv_telegram: 'browser_telegram', tv_torrent: 'browser_torrents' }
/** Old backend without `targets`: every target follows `enabled`. */
const targets = computed<IntroTargets>(() => Object.fromEntries(TARGETS.map(({ key }) => {
  const own = view.value?.targets?.[key]
  const parent = TV_TARGET_PARENTS[key] ? view.value?.targets?.[TV_TARGET_PARENTS[key]!] : undefined
  return [key, typeof own === 'boolean' ? own : typeof parent === 'boolean' ? parent : !!view.value?.enabled]
})) as IntroTargets)
const nodes = computed<IntroNodes>(() => view.value?.nodes ?? { reporting: 0, default_ready: 0, custom_ready: 0, errors: [] })
/** Nodes already serving the published clip: the uploaded one, else the standard intro of the node image. */
const nodesReady = computed(() => (view.value?.is_custom ? nodes.value.custom_ready : nodes.value.default_ready))
/** The preview plays only from a Media Node URL (never from this admin or the control plane). */
const previewable = computed(() => !!view.value?.video_url && view.value.video_url.startsWith('https://'))
const allOn = computed(() => TARGETS.every(({ key }) => targets.value[key]))
const allOff = computed(() => TARGETS.every(({ key }) => !targets.value[key]))

function message(e: any) {
  const d = e?.response?.data?.detail
  return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join('; ') : e?.message || 'Не удалось выполнить действие'
}
async function load() {
  try {
    const { data } = await axios.get<IntroView>(endpoint, { headers: headers() })
    if (disposed) return
    const wasProcessing = view.value?.processing
    view.value = data
    if (wasProcessing && !data.processing) {
      if (data.last_error) error.value = data.last_error
      else notice.value = 'Новое интро обработано и уже показывается на сайте и в приложении.'
    }
    schedulePoll()
  } catch (e) { error.value = message(e) }
}
function schedulePoll() {
  if (view.value?.processing && !poll) poll = setInterval(() => void load(), 2000)
  if (!view.value?.processing && poll) { clearInterval(poll); poll = null }
}
async function saveTargets(changes: Partial<IntroTargets>) {
  if (!view.value || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await axios.patch<IntroView>(endpoint, { targets: changes }, { headers: headers() })
    view.value = data
    notice.value = !data.enabled ? 'Интро выключено везде: фильм стартует сразу, без заставки.'
      : TARGETS.every(({ key }) => data.targets?.[key] !== false) ? 'Интро включено везде.' : 'Среды показа интро сохранены.'
  } catch (e) { error.value = message(e) } finally { busy.value = false }
}
function toggleTarget(key: IntroTarget) { return saveTargets({ [key]: !targets.value[key] }) }
function setAll(on: boolean) { return saveTargets(Object.fromEntries(TARGETS.map(({ key }) => [key, on])) as IntroTargets) }
/** Legacy single switch, kept for callers of the exposed API. */
function toggle() { return setAll(!view.value?.enabled) }
async function reset() {
  if (busy.value || !window.confirm('Вернуть стандартное интро KINOSOTA? Загруженный ролик будет удалён, интро включится.')) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await axios.delete<IntroView>(endpoint, { headers: headers() })
    view.value = data; notice.value = 'Восстановлено стандартное интро KINOSOTA.'
  } catch (e) { error.value = message(e) } finally { busy.value = false }
}
function validate(file: File) {
  const okType = ['video/mp4', 'video/webm'].includes(file.type) || /\.(mp4|m4v|webm)$/i.test(file.name)
  if (!okType) return 'Выберите видео MP4 или WebM'
  if (file.size > maxBytes.value) return 'Файл больше 50 МБ'
  if (!file.size) return 'Пустой файл'
  return ''
}
async function upload(file: File | undefined | null) {
  if (!file || uploading.value) return
  const problem = validate(file)
  if (problem) { error.value = problem; return }
  uploading.value = true; busy.value = true; progress.value = 0; error.value = ''; notice.value = ''
  try {
    const form = new FormData()
    form.append('video', file, file.name)
    await axios.post(endpoint, form, {
      headers: headers(), timeout: 300000,
      onUploadProgress: (e) => { progress.value = Math.min(99, Math.round((e.loaded / (e.total || file.size)) * 100)) },
    })
    progress.value = 100
    notice.value = 'Файл принят. Идёт оптимизация видео (faststart, стоп-кадр)…'
    await load()
  } catch (e) { error.value = message(e) } finally {
    uploading.value = false; busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
function picked(e: Event) { void upload((e.target as HTMLInputElement).files?.[0]) }
function dropped(e: DragEvent) { dragging.value = false; void upload(e.dataTransfer?.files?.[0]) }
onMounted(() => void load())
onBeforeUnmount(() => { disposed = true; if (poll) clearInterval(poll) })
defineExpose({ load, upload, toggle, toggleTarget, setAll, reset })
</script>

<template>
  <section class="panel intro-card" aria-label="Интро престарта" data-testid="cinema-intro-card">
    <header class="section-heading">
      <div>
        <h2>Интро престарта</h2>
        <p class="muted">Заставка перед фильмом на сайте, на Smart TV и в KINOSOTA Player. Ролик раздают только медиа-ноды. Изменения применяются без пересборки и обновления приложения.</p>
      </div>
    </header>
    <fieldset class="intro-targets" :disabled="!view || busy" data-testid="intro-targets">
      <legend>Где показывать интро</legend>
      <label v-for="t in TARGETS" :key="t.key" class="check">
        <input type="checkbox" :checked="targets[t.key]" @change="toggleTarget(t.key)" :data-testid="'intro-target-' + t.key" />
        <span>{{ t.label }}</span>
      </label>
      <div class="row">
        <button type="button" :disabled="allOn" @click="setAll(true)" data-testid="intro-all-on">Включить везде</button>
        <button type="button" :disabled="allOff" @click="setAll(false)" data-testid="intro-all-off">Выключить везде</button>
      </div>
      <p class="muted">Интро — фирменная заставка, не реклама: оно не занимает слот Pre-roll. Порядок показа: интро → Pre-roll → фильм.</p>
    </fieldset>
    <div v-if="error" class="alert error" role="alert">{{ error }}</div>
    <div v-if="notice" class="alert success" role="status">{{ notice }}</div>
    <div class="intro-body">
      <div class="intro-preview">
        <video v-if="view && previewable" :key="previewKey" controls playsinline preload="metadata" :poster="view.poster_url || view.still_url" data-testid="intro-preview">
          <source v-if="view.webm_url" :src="view.webm_url" type="video/webm" />
          <source :src="view.video_url" type="video/mp4" />
        </video>
        <p v-else-if="view" class="muted" data-testid="intro-preview-pending">Предпросмотр появится, когда медиа-нода начнёт раздавать текущее интро.</p>
        <p v-else class="muted">Загружаем текущее интро…</p>
      </div>
      <div class="intro-meta">
        <p><strong>{{ view?.is_custom ? 'Загруженное интро' : 'Стандартное интро KINOSOTA' }}</strong></p>
        <p v-if="view" class="muted">Версия {{ view.version }} · {{ seconds }} сек<span v-if="view.original_name"> · {{ view.original_name }}</span></p>
        <p v-if="view" class="muted" data-testid="intro-nodes">Медиа-ноды: {{ nodesReady }} из {{ nodes.reporting }} раздают {{ view.is_custom ? 'загруженное' : 'стандартное' }} интро<span v-if="!nodes.reporting"> · ни одна нода ещё не отчиталась, интро не показывается</span></p>
        <p v-if="nodes.errors.length" class="alert error" data-testid="intro-node-errors">Ошибки синхронизации на нодах: {{ nodes.errors.join('; ') }}</p>
        <p v-if="view?.processing" class="intro-processing" role="status">⏳ Оптимизация нового ролика… Пока показывается текущее интро.</p>
        <div class="intro-drop" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="dropped">
          <p>Перетащите MP4/WebM сюда или</p>
          <button type="button" class="primary" :disabled="busy || view?.processing" @click="fileInput?.click()">Загрузить видео</button>
          <input ref="fileInput" type="file" accept="video/mp4,video/webm" hidden @change="picked" data-testid="intro-file" />
          <p class="muted">До 50 МБ, 1–60 сек. Сервер приведёт ролик к H.264 с faststart и сам снимет стоп-кадр.</p>
          <progress v-if="uploading" max="100" :value="progress" aria-label="Загрузка интро"></progress>
          <p v-if="uploading" role="status">{{ progress }}%</p>
        </div>
        <button type="button" :disabled="busy || !view || (!view.is_custom && allOn)" @click="reset" data-testid="intro-reset">Сбросить до стандартного</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.intro-card{margin-bottom:24px}
.intro-body{display:grid;grid-template-columns:minmax(260px,1.2fr) minmax(240px,1fr);gap:20px;align-items:start}
.intro-preview video{width:100%;aspect-ratio:16/9;background:#070b0e;border-radius:12px;display:block;object-fit:cover}
.intro-meta{display:flex;flex-direction:column;gap:10px}
.intro-meta p{margin:0}
.intro-drop{border:1px dashed rgba(255,255,255,.28);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.intro-drop.dragging{border-color:currentColor;background:rgba(255,255,255,.05)}
.intro-drop progress{width:100%}
.intro-targets{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 16px;margin:0 0 16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px}
.intro-targets legend{padding:0 6px;font-weight:600}
.intro-targets .row,.intro-targets .muted{grid-column:1/-1}
@media (max-width:820px){.intro-targets{grid-template-columns:1fr}}
.intro-processing{font-weight:600}
@media (max-width:820px){.intro-body{grid-template-columns:1fr}}
</style>
