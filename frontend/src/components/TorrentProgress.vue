<script setup lang="ts">
/** Live preparation progress: «В очереди 10%» → «Поиск раздач 35%» → «Проверка и буферизация 75%» → «Готово · старт N мс». */
import { computed } from 'vue'
import type { TorrentPlaybackStatus } from '@/api/torrents'
import { PREP_LABELS, PREP_PROGRESS } from '@/api/preparation'
const props = withDefaults(defineProps<{
  status: TorrentPlaybackStatus
  progress?: number | null
  startMs?: number | null
  label?: string
  compact?: boolean
}>(), { progress: null, startMs: null, label: '', compact: false })
const ready = computed(() => props.status === 'playable' || props.status === 'partial')
const failed = computed(() => props.status === 'unavailable')
const percent = computed(() => Math.max(0, Math.min(100, Math.round(props.progress ?? PREP_PROGRESS[props.status] ?? 0))))
const text = computed(() => {
  if (props.label) return props.label
  if (ready.value) {
    return typeof props.startMs === 'number' && props.startMs >= 0
      ? `Готово · старт ${Math.round(props.startMs).toLocaleString('ru-RU')} мс`
      : 'Готово'
  }
  return PREP_LABELS[props.status] || ''
})
const showPercent = computed(() => !ready.value && !failed.value)
</script>
<template>
  <div
    v-if="text"
    class="torrent-progress"
    :class="{ 'is-ready': ready, 'is-failed': failed, 'is-active': showPercent, 'is-compact': compact }"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="ready ? 100 : percent"
    :aria-valuetext="showPercent ? `${text} ${percent}%` : text"
    :data-status="status"
  >
    <div class="progress-head">
      <span class="progress-label">{{ text }}</span>
      <span v-if="showPercent" class="progress-percent">{{ percent }}%</span>
    </div>
    <div class="progress-track" aria-hidden="true">
      <div class="progress-fill" :style="{ width: `${ready ? 100 : failed ? 0 : percent}%` }" />
    </div>
  </div>
</template>
<style scoped>
.torrent-progress{--tp-color:#9ce8d7;display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;color:var(--tp-color)}
.torrent-progress.is-ready{--tp-color:#4ade80}
.torrent-progress.is-failed{--tp-color:#ff9b9b}
.progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:14px;line-height:20px;font-weight:600}
.progress-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.progress-percent{font-variant-numeric:tabular-nums;flex:none}
.progress-track{position:relative;height:6px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}
.progress-fill{height:100%;border-radius:inherit;background:var(--tp-color);transition:width .6s ease}
.is-active .progress-fill{background-image:linear-gradient(110deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.45) 50%,rgba(255,255,255,0) 70%);background-size:200% 100%;animation:tp-shine 1.6s linear infinite}
.is-compact{gap:4px;padding:6px 8px;border-radius:8px;background:rgba(7,11,14,.88);border:1px solid color-mix(in srgb,var(--tp-color) 45%,transparent)}
.is-compact .progress-head{font-size:11px;line-height:15px;gap:6px}
.is-compact .progress-track{height:4px}
@keyframes tp-shine{from{background-position:100% 0}to{background-position:-100% 0}}
@media(prefers-reduced-motion:reduce){.progress-fill{transition:none}.is-active .progress-fill{animation:none}}
</style>
