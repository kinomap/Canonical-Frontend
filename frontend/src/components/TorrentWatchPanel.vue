<script setup lang="ts">
/** Detail info block: «▶ Смотреть» + bookmark, chosen source, quality / voice pills, season / episode. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LibraryButton from './LibraryButton.vue'
import DesktopPlayerModal from './DesktopPlayerModal.vue'
import type { TorrentItem } from '@/api/torrents'
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, LANGUAGE_NAMES, type TorrentWatch } from '@/composables/useTorrentWatch'
import { useAuthStore } from '@/stores/auth'
const props = defineProps<{ item: TorrentItem; state: TorrentWatch }>()
const emit = defineEmits<{ browser: [] }>()
const auth = useAuthStore(), route = useRoute(), router = useRouter()

const label = computed(() => {
  if (props.state.busy === 'launch') return 'Открываем…'
  switch (props.state.action) {
    case 'retry': return '↻ Повторить'
    case 'discover': return '↻ Искать раздачи'
    case 'prepare': return '▶ Подготовить раздачу'
    default: return '▶ Смотреть'
  }
})
const waiting = computed(() => ['checking', 'loading', 'wait', 'missing'].includes(props.state.action))
const disabled = computed(() => waiting.value || !!props.state.busy)
const hint = computed(() => {
  switch (props.state.action) {
    case 'library': return 'Добавим в кинотеку и сразу начнём поиск раздач'
    case 'wait': return 'Готовим раздачу — кнопка станет активной автоматически'
    case 'missing': return 'Этой серии пока нет в найденных раздачах'
    case 'retry': return 'Не удалось загрузить список раздач'
    case 'discover': return props.state.view?.status.status === 'unavailable' ? 'Подходящие раздачи пока не найдены. Можно поискать ещё раз' : ''
    default: return ''
  }
})
async function primary() {
  const state = props.state
  switch (state.action) {
    case 'subscribe':
      if (!auth.isAuthenticated.value) await router.push({ path: '/login', query: { redirect: route.fullPath } })
      else await router.push('/profile?tab=billing')
      return
    case 'retry': return state.refresh()
    case 'library': return state.addToLibrary()
    case 'discover': return state.discover()
    case 'prepare': return state.prepare()
    case 'launch': return state.launch()
  }
}
const selectedText = computed(() => {
  const source = props.state.selected
  return source ? [source.quality || 'Качество не указано', source.source_type].filter(Boolean).join(' ') : ''
})
const onSeason = (event: Event) => props.state.pickSeason(Number((event.target as HTMLSelectElement).value))
const onEpisode = (event: Event) => props.state.pickEpisode(Number((event.target as HTMLSelectElement).value))
function browser() {
  props.state.closeInstall()
  emit('browser')
}
</script>
<template>
  <div class="watch-panel" data-testid="watch-panel">
    <div class="watch-actions">
      <button type="button" class="watch-button" data-testid="watch-button" :disabled="disabled" :aria-busy="waiting || !!state.busy" @click="primary">{{ label }}</button>
      <LibraryButton :item="item" />
    </div>
    <p v-if="hint" class="watch-hint">{{ hint }}</p>
    <template v-if="state.view?.allowed && state.sources.length">
      <p v-if="state.selected" class="watch-selected" data-testid="watch-selected"><span class="watch-check" aria-hidden="true">✓</span> Выбрано: {{ selectedText }} · <span class="watch-seeders">▲ {{ state.selected.seeders }} сид</span></p>
      <div class="watch-group">
        <span id="watch-quality-label" class="watch-group-label">КАЧЕСТВО</span>
        <div class="watch-pills" role="group" aria-labelledby="watch-quality-label">
          <button v-for="q in state.view.qualities" :key="q.value" type="button" class="watch-pill" :class="{ 'is-active': state.selected?.quality === q.value, 'is-missing': !q.available }" :disabled="!q.available" :aria-pressed="state.selected?.quality === q.value" :title="q.available ? `Качество ${q.value}` : 'Нет раздачи в этом качестве'" @click="state.pickQuality(q.value)">{{ q.value }}</button>
        </div>
      </div>
      <div class="watch-group">
        <span id="watch-language-label" class="watch-group-label">ЯЗЫК</span>
        <div class="watch-pills" role="group" aria-labelledby="watch-language-label">
          <button v-for="l in state.view.languages" :key="l.value" type="button" class="watch-pill" :class="{ 'is-active': state.audioLanguage === l.value, 'is-missing': !l.available }" :disabled="!l.available" :aria-pressed="state.audioLanguage === l.value" :title="l.available ? LANGUAGE_NAMES[l.value] : 'Нет раздачи с этой дорожкой'" @click="state.pickLanguage(l.value)"><span v-if="LANGUAGE_FLAGS[l.value]" class="watch-flag" :class="`flag-${l.value}`" aria-hidden="true" />{{ LANGUAGE_LABELS[l.value] }}</button>
        </div>
      </div>
      <div v-if="state.showEpisodes" class="watch-episodes">
        <label class="watch-field" for="watch-season">Сезон
          <select id="watch-season" :value="state.season ?? ''" @change="onSeason">
            <option v-for="s in state.seasonOptions" :key="s.value" :value="s.value">{{ s.label }}{{ s.available ? '' : ' · нет раздачи' }}</option>
          </select>
        </label>
        <label class="watch-field" for="watch-episode">Серия
          <select id="watch-episode" :value="state.episode ?? ''" @change="onEpisode">
            <option v-for="e in state.episodeOptions" :key="e.value" :value="e.value">Серия {{ e.value }}{{ e.available ? '' : ' · нет в раздачах' }}</option>
          </select>
        </label>
      </div>
    </template>
    <p v-if="state.error" class="watch-error" role="alert">{{ state.error }}</p>
    <p v-else-if="state.message" class="watch-message" role="status">{{ state.message }}</p>
    <DesktopPlayerModal :show="state.installPrompt" :can-browse="state.action === 'launch'" @close="state.closeInstall()" @browser="browser" />
  </div>
</template>
<style scoped>
.watch-panel{display:flex;flex-direction:column;gap:16px;margin:20px 0 8px;max-width:680px}
.watch-actions :deep(.library-tooltip){left:auto;right:0;transform:none}
.watch-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.watch-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;min-width:200px;padding:12px 32px;box-sizing:border-box;border:1px solid #fff;border-radius:12px;background:#fff;color:#0b0f12;font:inherit;font-size:17px;line-height:24px;font-weight:700;cursor:pointer;transition:transform .15s,background .2s,opacity .2s}
.watch-button:hover:not(:disabled){background:#e9eef0;transform:translateY(-1px)}
.watch-button:focus-visible{outline:2px solid #9ce8d7;outline-offset:3px}
.watch-button:disabled{cursor:default;opacity:.55}
.watch-hint{margin:-6px 0 0;color:#bbb;font-size:14px;line-height:20px}
.watch-selected{margin:0;font-size:15px;line-height:22px;font-weight:600;color:#fff}
.watch-check{color:#4ade80;font-weight:700}
.watch-seeders{color:#4ade80;font-variant-numeric:tabular-nums}
.watch-group{display:flex;flex-direction:column;gap:8px}
.watch-group-label{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;color:#9ce8d7}
.watch-pills{display:flex;flex-wrap:wrap;gap:8px}
.watch-pill{min-height:36px;min-width:64px;padding:6px 14px;box-sizing:border-box;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:transparent;color:#fff;font:inherit;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.watch-pill:hover:not(:disabled){border-color:#9ce8d7}
.watch-pill.is-active{background:#9ce8d7;border-color:#9ce8d7;color:#07131a}
.watch-flag{display:inline-block;width:18px;height:12px;margin-right:7px;vertical-align:-1px;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.25)}
.flag-ru{background:linear-gradient(#fff 0 33.4%,#0039a6 33.4% 66.7%,#d52b1e 66.7%)}
.flag-uk{background:linear-gradient(#0057b7 0 50%,#ffd700 50%)}
.watch-pill.is-missing{opacity:.35;cursor:not-allowed}
.watch-pill:focus-visible{outline:2px solid #9ce8d7;outline-offset:2px}
.watch-episodes{display:flex;flex-wrap:wrap;gap:12px}
.watch-field{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.04em;color:#9ce8d7;min-width:160px}
.watch-field select{min-height:44px;padding:8px 12px;border:1px solid var(--ui-control,#3a3a3a);border-radius:10px;background:var(--ui-surface,#14181c);color:#fff;font:inherit;font-size:14px;letter-spacing:0}
.watch-error{margin:0;color:#ff9b9b;font-size:14px;line-height:20px}
.watch-message{margin:0;color:#9ce8d7;font-size:14px;line-height:20px}
@media(max-width:600px){.watch-button{flex:1 1 auto;min-width:0}}
@media(prefers-reduced-motion:reduce){.watch-button,.watch-pill{transition:none}}
</style>
