<script setup lang="ts">
/**
 * Under the title page poster, like the reference: a green «Готово: старт 7718 мс» once the release
 * plays, otherwise the live preparation steps over a thin green→amber bar (or why it cannot start).
 */
import { computed } from 'vue'
import TorrentProgress from './TorrentProgress.vue'
import type { TorrentWatch } from '@/composables/useTorrentWatch'
const props = defineProps<{ state: TorrentWatch }>()
const allowed = computed(() => !!props.state.view?.allowed)
const ready = computed(() => allowed.value && props.state.progress?.stage === 'ready')
// Plain digits like the reference («старт 18416 мс»), the same as the Kinoteka cards.
const readyText = computed(() => {
  const start = props.state.progress?.startMs ?? props.state.selected?.start_ms
  return typeof start === 'number' && Number.isFinite(start) && start > 0 ? `Готово: старт ${Math.round(start)} мс` : 'Готово'
})
const progress = computed(() => allowed.value && props.state.progress && props.state.progress.stage !== 'ready' ? props.state.progress : null)
</script>
<template>
  <p v-if="ready" class="poster-status is-ready" data-testid="poster-status">{{ readyText }}</p>
  <TorrentProgress v-else-if="progress" class="poster-progress" data-testid="watch-progress" :status="progress.status" :stage="progress.stage" :progress="progress.progress" :start-ms="progress.startMs" :label="progress.label" />
</template>
<style scoped>
.poster-status{margin:0;padding:0 2px;font-size:12px;line-height:1.5;color:#677084;overflow-wrap:anywhere}
.poster-status.is-ready{color:#3ddc84;font-weight:600}
.poster-progress{min-height:40px;margin-top:4px}
</style>
