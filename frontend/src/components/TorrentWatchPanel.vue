<script setup lang="ts">
/**
 * Title page action block of the reference layout in KINOSOTA honey: «Смотреть · 1 сезон, 1 серия» + bookmark,
 * «✓ Выбрано: 1080p WEB-DL · ▲ 173 сида · 71,4 ГБ», then the Quality / Language pickers and season + episode selects.
 * Voice-overs are chosen in the player (mpv); the preparation status lives under the poster (TorrentPosterStatus).
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Play, RefreshCw, RotateCw } from 'lucide-vue-next'
import LibraryButton from './LibraryButton.vue'
import DesktopPlayerModal from './DesktopPlayerModal.vue'
import KSelect from './KSelect.vue'
import type { TorrentItem } from '@/api/torrents'
import { LANGUAGE_NAMES, type LanguagePill, type TorrentWatch } from '@/composables/useTorrentWatch'
import { useAuthStore } from '@/stores/auth'
import { formatSize, plural } from '@/utils/ruFormat'
const props = defineProps<{ item: TorrentItem; state: TorrentWatch }>()
const emit = defineEmits<{ browser: [] }>()
const auth = useAuthStore(), route = useRoute(), router = useRouter()

/** Flag + code like the reference («RU», «UA», «EN»); the tooltip says what kind of track it is. */
const LANGUAGE_TEXT: Record<LanguagePill, string> = { ru: 'RU', uk: 'UA', en: 'EN', und: 'Не указан' }
type SelectOption = { value: number; label: string; hint?: string; disabled?: boolean }

const episodeText = computed(() => {
  const e = props.state.currentEpisode
  return e ? `${e.season ? `${e.season} сезон` : 'Спецвыпуск'}, ${e.episode} серия` : ''
})
const label = computed(() => {
  if (props.state.busy === 'launch') return 'Открываем…'
  switch (props.state.action) {
    case 'retry': return 'Повторить'
    case 'discover': return 'Искать раздачи'
    case 'prepare': return 'Подготовить раздачу'
    default: return episodeText.value ? `Смотреть · ${episodeText.value}` : 'Смотреть'
  }
})
const again = computed(() => props.state.busy !== 'launch' && (props.state.action === 'retry' || props.state.action === 'discover'))
const waiting = computed(() => ['checking', 'loading', 'wait', 'missing'].includes(props.state.action))
const disabled = computed(() => waiting.value || !!props.state.busy)
const hint = computed(() => {
  const state = props.state
  switch (state.action) {
    case 'library': return 'Добавим в кинотеку и сразу начнём поиск раздач'
    case 'wait': return 'Готовим раздачу — кнопка станет активной автоматически'
    case 'missing': return 'Этой серии пока нет в найденных раздачах'
    // The list itself did not arrive (network / server): never a dead end, it retries by itself.
    case 'retry': return 'Связь с сервером прервалась — повторяем автоматически'
    case 'discover':
      if (state.stage === 'not_found') return 'Раздачи на трекерах пока не найдены — можно поискать ещё раз'
      if (state.stage === 'failed') return `${state.view?.status.reason_label || 'Подготовка временно не удалась'} — можно повторить поиск`
      return ''
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

/** «1080p WEB-DL · ▲ 173 сида · 71,4 ГБ»: what a click on «Смотреть» will play. */
const statusFacts = computed(() => {
  const source = props.state.selected
  if (!source) return []
  return [
    [source.quality || 'Качество не указано', source.source_type].filter(Boolean).join(' '),
    source.seeders > 0 ? `▲ ${source.seeders} ${plural(source.seeders, 'сид', 'сида', 'сидов')}` : '',
    formatSize(source.size_bytes),
  ].filter(Boolean)
})
const statusShown = computed(() => !!props.state.view?.allowed && statusFacts.value.length > 0)

const seasonItems = computed<SelectOption[]>(() => props.state.seasonOptions.map((s) => ({
  value: s.value, label: s.label, hint: s.available ? undefined : 'нет раздач',
})))
const episodeItems = computed<SelectOption[]>(() => props.state.episodeOptions.map((e) => ({
  value: e.value, label: `${e.value} серия`, disabled: !e.available,
  hint: !e.available ? 'нет раздачи' : e.sizeMb ? formatSize(e.sizeMb * 1048576) : undefined,
})))
function browser() {
  props.state.closeInstall()
  emit('browser')
}
</script>
<template>
  <div class="watch-panel" data-testid="watch-panel">
    <div class="watch-actions">
      <button type="button" class="watch-button" data-testid="watch-button" :disabled="disabled" :aria-busy="waiting || !!state.busy" @click="primary">
        <RotateCw v-if="again" class="watch-icon" :size="20" aria-hidden="true" />
        <Play v-else class="watch-icon" :size="20" fill="currentColor" :stroke-width="0" aria-hidden="true" />
        <span>{{ label }}</span>
      </button>
      <LibraryButton :item="item" />
    </div>
    <p v-if="statusShown" class="watch-status" data-testid="watch-status"><span class="watch-check" aria-hidden="true">✓</span> Выбрано: <span class="watch-facts">{{ statusFacts.join(' · ') }}</span></p>
    <p v-if="hint" class="watch-hint" data-testid="watch-hint">{{ hint }}</p>
    <div v-if="state.view?.allowed && state.sources.length" class="watch-options" data-testid="watch-options">
      <div class="watch-section">
        <span id="watch-quality-label" class="watch-label">Качество</span>
        <div class="watch-chips" role="group" aria-labelledby="watch-quality-label">
          <button v-for="q in state.qualityOptions" :key="q.value" type="button" class="watch-pill" :class="{ active: q.active, missing: !q.available }" :disabled="!q.available" :aria-pressed="q.active" :title="q.available ? `Качество ${q.label}` : 'Нет раздачи в этом качестве'" @click="state.pickQuality(q.value)"><s v-if="!q.available">{{ q.value }}</s><template v-else>{{ q.label }}</template></button>
        </div>
      </div>
      <div v-if="state.languageOptions.length" class="watch-section">
        <span id="watch-language-label" class="watch-label">Язык</span>
        <div class="watch-chips" role="group" aria-labelledby="watch-language-label">
          <button v-for="l in state.languageOptions" :key="l" type="button" class="watch-pill" :class="{ active: state.activeLanguage === l }" :aria-pressed="state.activeLanguage === l" :title="LANGUAGE_NAMES[l]" @click="state.pickLanguage(l)">
            <svg v-if="l === 'ru'" class="watch-flag flag-ru" viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="2" fill="#fff" /><rect y="2" width="9" height="2" fill="#0039a6" /><rect y="4" width="9" height="2" fill="#d52b1e" /></svg>
            <svg v-else-if="l === 'uk'" class="watch-flag flag-uk" viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="3" fill="#0057b7" /><rect y="3" width="9" height="3" fill="#ffd700" /></svg>
            <svg v-else-if="l === 'en'" class="watch-flag flag-en" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="60" height="30" fill="#012169" /><path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6" /><path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" stroke-width="2" /><path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10" /><path d="M30 0V30M0 15H60" stroke="#c8102e" stroke-width="6" /></svg>{{ LANGUAGE_TEXT[l] }}
          </button>
        </div>
      </div>
      <div v-if="state.showEpisodes" class="watch-section">
        <span id="watch-series-label" class="watch-label">Серия</span>
        <div class="watch-series" data-testid="watch-series" role="group" aria-labelledby="watch-series-label">
          <KSelect class="watch-season" data-testid="season-select" :model-value="state.season" :options="seasonItems" label="Сезон" placeholder="Сезон" @update:model-value="(value) => state.pickSeason(Number(value))" />
          <KSelect class="watch-episode" data-testid="episode-select" :model-value="state.episode" :options="episodeItems" label="Серия" placeholder="Серия" @update:model-value="(value) => state.pickEpisode(Number(value))" />
          <button type="button" class="watch-refresh" data-testid="episodes-refresh" title="Проверить новые серии" aria-label="Проверить новые серии" :disabled="!!state.busy" :aria-busy="state.busy === 'discover'" @click="state.discover('episodes')"><RefreshCw :size="18" :class="{ spinning: state.busy === 'discover' }" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <p v-if="state.error" class="watch-error" role="alert">{{ state.error }}</p>
    <p v-else-if="state.message" class="watch-message" role="status">{{ state.message }}</p>
    <DesktopPlayerModal :show="state.installPrompt" :can-browse="state.action === 'launch'" @close="state.closeInstall()" @browser="browser" />
  </div>
</template>
<style scoped>
.watch-panel{--ease:cubic-bezier(.22,1,.36,1);--honey-grad:linear-gradient(135deg,#ffe36e 0%,#ffc21a 46%,#ff9e1b 100%);display:flex;flex-direction:column;margin:20px 0 0;min-width:0}
.watch-actions{display:flex;align-items:center;gap:12px;min-height:56px;flex-wrap:nowrap}
.watch-actions :deep(.library-tooltip){left:auto;right:0;transform:none}
.watch-actions :deep(.library-button){width:56px;height:56px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);transition:background-color .2s,border-color .2s,color .2s}
.watch-actions :deep(.library-button:hover){background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25);color:#f5f5f5}
.watch-actions :deep(.library-button.is-saved){color:#ffd24d;background:rgba(255,194,26,.12);border-color:rgba(255,194,26,.4)}
.watch-actions :deep(.library-button.is-saved:hover){background:rgba(255,194,26,.18);border-color:rgba(255,194,26,.55)}
.watch-button{display:inline-flex;align-items:center;justify-content:center;gap:10px;flex-shrink:0;height:56px;min-width:160px;padding:0 36px;box-sizing:border-box;border:0;border-radius:10px;background:var(--honey-grad);color:#1a1405;font:inherit;font-size:17px;line-height:24px;font-weight:700;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4),0 8px 24px rgba(255,170,20,.18),inset 0 1px 0 rgba(255,255,255,.45);cursor:pointer;transition:transform .18s var(--ease),filter .2s,box-shadow .2s}
.watch-button:hover:not(:disabled){filter:brightness(1.05);transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.5),0 10px 28px rgba(255,170,20,.26),inset 0 1px 0 rgba(255,255,255,.45)}
.watch-button:active:not(:disabled){transform:scale(.98)}
.watch-button:focus-visible{outline:2px solid #ffd24d;outline-offset:3px}
.watch-button:disabled{cursor:default;opacity:.6;filter:saturate(.55);box-shadow:none}
.watch-icon{flex:none}
.watch-status{margin:8px 0 0;color:#ffd24d;font-size:13px;line-height:18px;text-shadow:0 1px 4px rgba(0,0,0,.7);overflow-wrap:anywhere}
.watch-check{font-weight:700}
.watch-hint{margin:8px 0 0;color:rgba(255,255,255,.6);font-size:13px;line-height:18px;text-shadow:0 1px 4px rgba(0,0,0,.7)}
.watch-options{display:flex;flex-direction:column;gap:16px;margin-top:16px;min-width:0}
.watch-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.watch-label{font-size:11px;line-height:14px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.34)}
.watch-chips{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.watch-pill{display:inline-flex;align-items:center;gap:8px;max-width:220px;padding:7px 18px;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.75);font:inherit;font-size:13px;line-height:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background-color .18s,border-color .18s,color .18s}
.watch-pill:hover:not(.active):not(:disabled){background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:#f5f5f5}
.watch-pill.active{background:rgba(245,245,245,.12);border-color:rgba(245,245,245,.35);color:#f5f5f5}
.watch-pill.missing{background:rgba(255,255,255,.02);border-color:rgba(255,255,255,.06);color:rgba(255,255,255,.3);cursor:not-allowed}
.watch-pill.missing s{text-decoration-thickness:1px}
.watch-pill:focus-visible,.watch-refresh:focus-visible{outline:2px solid #ffd24d;outline-offset:2px}
.watch-flag{flex:none;width:18px;height:12px;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.18)}
.watch-series{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.watch-season{width:160px}
.watch-episode{width:220px}
.watch-refresh{display:grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);cursor:pointer;transition:background-color .18s,border-color .18s,color .18s}
.watch-refresh:hover:not(:disabled){background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:#f5f5f5}
.watch-refresh:disabled{cursor:wait;opacity:.6}
.spinning{animation:watch-spin .8s linear infinite}
.watch-error{margin:12px 0 0;color:#ff8a7a;font-size:14px;line-height:20px}
.watch-message{margin:12px 0 0;color:rgba(255,255,255,.7);font-size:14px;line-height:20px}
@keyframes watch-spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.watch-actions{flex-wrap:wrap}.watch-button{flex:1 1 0;min-width:0;padding:0 16px;font-size:14px;white-space:normal}.watch-pill{max-width:none;padding:4px 9px;font-size:11px}.watch-season,.watch-episode{flex:1 1 140px;width:auto}}
@media(prefers-reduced-motion:reduce){.watch-button,.watch-pill,.watch-refresh{transition:none}.spinning{animation:none}}
</style>
