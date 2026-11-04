<script setup lang="ts">
/**
 * Live preparation progress in the reference look: «В очереди...» → «Поиск источников...» →
 * «Проверка потока...» with percent over a thin green→amber bar, then a green «Готово».
 * Detail page: «Готово · старт N мс»; Kinoteka card (compact): «Готово · 1080p».
 */
import { computed } from 'vue'
import { ACTIVE_STAGES, PREP_PROGRESS, STAGE_LABELS, stageOf, type PrepStage, type PrepStatus } from '@/api/preparation'
const props = withDefaults(defineProps<{
  status: PrepStatus
  stage?: PrepStage | null
  progress?: number | null
  startMs?: number | null
  label?: string | null
  quality?: string | null
  compact?: boolean
}>(), { stage: null, progress: null, startMs: null, label: '', quality: null, compact: false })
const current = computed<PrepStage>(() => stageOf({ status: props.status, stage: props.stage }))
const ready = computed(() => current.value === 'ready')
const active = computed(() => ACTIVE_STAGES.includes(current.value))
const tone = computed(() => ready.value ? 'is-ready' : active.value ? 'is-active'
  : current.value === 'not_found' ? 'is-warn' : current.value === 'failed' ? 'is-error' : 'is-muted')
const percent = computed(() => Math.max(0, Math.min(100, Math.round(props.progress ?? PREP_PROGRESS[props.status] ?? 0))))
// Plain digits like the reference («старт 18416 мс»): no thousands separator.
const startText = computed(() => typeof props.startMs === 'number' && Number.isFinite(props.startMs) && props.startMs >= 0
  ? `старт ${Math.round(props.startMs)} мс` : '')
const text = computed(() => {
  if (ready.value) {
    const detail = props.compact ? (props.quality || startText.value) : (startText.value || props.quality)
    return detail ? `Готово · ${detail}` : 'Готово'
  }
  return props.label || STAGE_LABELS[current.value] || ''
})
</script>
<template>
  <div
    v-if="text"
    class="torrent-progress"
    :class="[tone, { 'is-compact': compact }]"
    :role="active || ready ? 'progressbar' : 'status'"
    :aria-valuemin="active || ready ? 0 : undefined"
    :aria-valuemax="active || ready ? 100 : undefined"
    :aria-valuenow="active ? percent : ready ? 100 : undefined"
    :aria-valuetext="active ? `${text} ${percent}%` : text"
    :data-status="status"
    :data-stage="current"
  >
    <div class="progress-head">
      <span class="progress-label">{{ text }}</span>
      <span v-if="active" class="progress-percent">{{ percent }}%</span>
    </div>
    <div v-if="active || ready" class="progress-track" aria-hidden="true">
      <div class="progress-fill" :style="{ width: `${ready ? 100 : percent}%` }" />
    </div>
  </div>
</template>
<style scoped>
.torrent-progress{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;box-sizing:border-box;padding:0 2px}
.progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12px;line-height:1.5;color:#677084}
.progress-label{min-width:0;overflow-wrap:anywhere}
.is-active .progress-head{font-size:11px;color:#9aa3b8}
.is-active .progress-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.progress-percent{flex:0 0 auto;color:#b0b8cc;font-variant-numeric:tabular-nums}
.is-ready .progress-head{color:#4caf7d;font-weight:600}
.is-warn .progress-head{color:#e8a030}
.is-error .progress-head{color:#e05050}
.progress-track{height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;width:0;background:linear-gradient(90deg,#4caf7d,#e8a030);border-radius:2px;transition:width .35s ease}
.is-ready .progress-fill{background:#4caf7d}
.is-compact{gap:5px}
@media(prefers-reduced-motion:reduce){.progress-fill{transition:none}}
</style>
