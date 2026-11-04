<script setup lang="ts">
/**
 * Detail info block in the reference layout: «▶ Смотреть» + bookmark, «✓ Выбрано: …»,
 * КАЧЕСТВО / ЯЗЫК pills and, for a series, «Выбор серии» with season tabs and an episode grid.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LibraryButton from './LibraryButton.vue'
import DesktopPlayerModal from './DesktopPlayerModal.vue'
import type { TorrentItem } from '@/api/torrents'
import { LANGUAGE_LABELS, LANGUAGE_NAMES, type TorrentWatch } from '@/composables/useTorrentWatch'
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
/** «1080p WEB-DL · ▲ 357 сид», like the reference selection line. */
const selectedText = computed(() => {
  const source = props.state.selected
  if (!source) return ''
  const name = [source.quality || 'Качество не указано', source.source_type].filter(Boolean).join(' ')
  return [name, source.seeders > 0 ? `▲ ${source.seeders} сид` : ''].filter(Boolean).join(' · ')
})
const seasonLabel = computed(() => props.state.seasonOptions.find((s) => s.value === props.state.season)?.label ?? '')
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
    <p v-if="state.view?.allowed && state.selected" class="watch-selected" data-testid="watch-selected"><span class="watch-check" aria-hidden="true">✓</span> Выбрано: <span class="watch-sel-value">{{ selectedText }}</span></p>
    <p v-if="hint" class="watch-hint" data-testid="watch-hint">{{ hint }}</p>
    <template v-if="state.view?.allowed && state.sources.length">
      <div class="watch-group">
        <span id="watch-quality-label" class="watch-group-label">КАЧЕСТВО</span>
        <div class="watch-pills" role="group" aria-labelledby="watch-quality-label">
          <button v-for="q in state.qualityOptions" :key="q.value" type="button" class="watch-pill mc-opt" :class="{ active: q.active, missing: !q.available }" :disabled="!q.available" :aria-pressed="q.active" :title="q.available ? `Качество ${q.label}` : 'Нет раздачи в этом качестве'" @click="state.pickQuality(q.value)">{{ q.label }}</button>
        </div>
      </div>
      <div v-if="state.languageOptions.length" class="watch-group">
        <span id="watch-language-label" class="watch-group-label">ЯЗЫК</span>
        <div class="watch-pills" role="group" aria-labelledby="watch-language-label">
          <button v-for="l in state.languageOptions" :key="l" type="button" class="watch-pill mc-opt" :class="{ active: state.activeLanguage === l }" :aria-pressed="state.activeLanguage === l" :title="LANGUAGE_NAMES[l]" @click="state.pickLanguage(l)">
            <svg v-if="l === 'ru'" class="watch-flag flag-ru" viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="2" fill="#fff" /><rect y="2" width="9" height="2" fill="#0039a6" /><rect y="4" width="9" height="2" fill="#d52b1e" /></svg>
            <svg v-else-if="l === 'uk'" class="watch-flag flag-uk" viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="3" fill="#0057b7" /><rect y="3" width="9" height="3" fill="#ffd700" /></svg>
            <svg v-else-if="l === 'en'" class="watch-flag flag-en" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="60" height="30" fill="#012169" /><path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6" /><path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" stroke-width="2" /><path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10" /><path d="M30 0V30M0 15H60" stroke="#c8102e" stroke-width="6" /></svg>{{ LANGUAGE_LABELS[l] }}
          </button>
        </div>
      </div>
      <section v-if="state.showEpisodes" class="watch-series" data-testid="watch-series" aria-labelledby="watch-series-title">
        <div class="watch-series-top">
          <h2 id="watch-series-title" class="watch-series-title">Выбор серии</h2>
          <button type="button" class="watch-series-refresh" data-testid="episodes-refresh" title="Проверить новые серии" :disabled="!!state.busy" :aria-busy="state.busy === 'discover'" @click="state.discover('episodes')"><span class="refresh-icon" :class="{ spinning: state.busy === 'discover' }" aria-hidden="true">⟳</span><span>Обновить</span></button>
        </div>
        <div class="season-tabs" role="tablist" aria-label="Сезоны">
          <button v-for="s in state.seasonOptions" :key="s.value" type="button" role="tab" class="season-tab" :class="{ active: state.season === s.value, empty: !s.available }" :aria-selected="state.season === s.value" :title="s.available ? undefined : 'Для этого сезона раздач пока нет'" @click="state.pickSeason(s.value)">{{ s.label }}</button>
        </div>
        <div class="episode-grid" role="tabpanel" :aria-label="seasonLabel">
          <button v-for="e in state.episodeOptions" :key="e.value" type="button" class="episode-card" :class="{ active: state.episode === e.value }" :disabled="!e.available" :aria-pressed="state.episode === e.value" @click="state.pickEpisode(e.value)">
            <span class="episode-name">Эпизод {{ e.value }}</span>
            <span v-if="!e.available" class="episode-size">нет раздачи</span>
            <span v-else-if="e.sizeMb" class="episode-size">{{ e.sizeMb }} MB</span>
          </button>
        </div>
      </section>
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
.watch-button:focus-visible{outline:2px solid #a5b4fc;outline-offset:3px}
.watch-button:disabled{cursor:default;opacity:.55}
/* Reference #mc-sel-info: amber line, green tick, indigo value. */
.watch-selected{margin:-8px 0 0;padding:0 2px;font-size:13px;line-height:1.4;color:rgba(232,160,48,.85);overflow-wrap:anywhere;text-shadow:0 1px 4px rgba(0,0,0,.7)}
.watch-check{color:#4ade80}
.watch-sel-value{color:#a5b4fc}
.watch-hint{margin:-8px 0 0;color:#9aa3b8;font-size:13px;line-height:1.4}
.watch-group{display:flex;flex-direction:column;gap:10px}
.watch-group-label{display:flex;align-items:center;gap:6px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.3)}
.watch-pills{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0}
/* Reference .mc-opt chips. */
.mc-opt{display:inline-block;min-height:34px;max-width:160px;box-sizing:border-box;padding:7px 18px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.75);font:inherit;font-size:13px;line-height:18px;font-weight:600;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background .18s,border-color .18s,color .18s}
.mc-opt:hover:not(.active):not(.missing):not(:disabled){background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:#f5f5f5}
.mc-opt.active{background:rgba(245,245,245,.12);border-color:rgba(245,245,245,.35);color:#f5f5f5}
.mc-opt.missing{opacity:.15;cursor:not-allowed;text-decoration:line-through;background:transparent;border-color:rgba(255,255,255,.05)}
.mc-opt:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.watch-flag{display:inline-block;width:18px;height:12px;margin-right:7px;vertical-align:-2px;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.25)}
/* Reference episode panel: «Выбор серии» + «Обновить», season tabs, episode cards. */
.watch-series{display:flex;flex-direction:column;border:1px solid #1e2a42;border-radius:12px;background:rgba(0,0,0,.25);overflow:hidden}
.watch-series-top{display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(0,0,0,.3);border-bottom:1px solid #1e2a42;flex-wrap:wrap}
.watch-series-title{flex:1;min-width:140px;margin:0;font-size:15px;line-height:20px;font-weight:700;color:#fff}
.watch-series-refresh{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 12px;border:1px solid rgba(129,140,248,.35);border-radius:8px;background:rgba(99,102,241,.16);color:#e8eaf6;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s}
.watch-series-refresh:hover:not(:disabled){background:rgba(99,102,241,.26);border-color:rgba(165,180,252,.6)}
.watch-series-refresh:disabled{opacity:.65;cursor:wait}
.watch-series-refresh:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.refresh-icon{display:inline-block;font-size:16px;line-height:1}
.refresh-icon.spinning{animation:watch-spin .8s linear infinite}
.season-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px;border-bottom:1px solid #1e2a42;background:rgba(0,0,0,.1)}
.season-tab{min-height:32px;padding:6px 16px;border:1px solid #1e2a42;border-radius:20px;background:transparent;color:#a5b4fc;font:inherit;font-size:13px;line-height:18px;font-weight:600;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.season-tab:hover{border-color:#6366f1}
.season-tab.active{background:#6366f1;border-color:#6366f1;color:#fff}
.season-tab.empty:not(.active){opacity:.55}
.season-tab:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.episode-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;max-height:450px;overflow-y:auto;padding:16px 18px}
.episode-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:64px;padding:14px 10px;border:1px solid transparent;border-radius:10px;background:rgba(255,255,255,.03);color:#fff;font:inherit;text-align:center;cursor:pointer;transition:background .2s,transform .2s,border-color .2s}
.episode-card:hover:not(:disabled){background:rgba(99,102,241,.18);transform:translateY(-2px)}
.episode-card.active{background:rgba(99,102,241,.3);border-color:#6366f1}
.episode-card:disabled{opacity:.35;cursor:not-allowed}
.episode-card:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.episode-name{font-size:13px;line-height:18px;font-weight:700;color:#fff}
.episode-size{font-size:11px;line-height:14px;color:#6b7a9d}
.watch-error{margin:0;color:#e05050;font-size:14px;line-height:20px}
.watch-message{margin:0;color:#a5b4fc;font-size:14px;line-height:20px}
@keyframes watch-spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.watch-button{flex:1 1 auto;min-width:0}.mc-opt{padding:6px 12px;font-size:12px}.episode-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));padding:12px}}
@media(prefers-reduced-motion:reduce){.watch-button,.mc-opt,.season-tab,.episode-card{transition:none}.refresh-icon.spinning{animation:none}}
</style>
