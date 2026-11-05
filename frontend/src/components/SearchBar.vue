<script setup lang="ts">
import { t, tr } from '@/i18n'
import { ref, watch, onUnmounted, onMounted, useId } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, X, Loader2 } from 'lucide-vue-next'
import { apiClient } from '@/api/client'
import { torrentsApi, torrentPath } from '@/api/torrents'
import type { MovieSummary } from '@/types/movie'
import {posterUrl} from '@/utils/poster'
import {contentPath,cleanTitle} from '@/utils/contentPath'
import {highlightParts} from '@/utils/highlight'
type SearchSuggestion=Pick<MovieSummary,'id'|'title'|'year'|'rating'|'poster'|'type'>
const props = defineProps<{modelValue?: string; placeholder?: string; debounceMs?: number; torrent?: boolean}>()
const emit = defineEmits<{(e:'update:modelValue',val:string):void;(e:'search',val:string):void}>()
const router=useRouter(), route=useRoute(), query=ref(props.modelValue || '')
const suggestions=ref<SearchSuggestion[]>([]), interpreted=ref(''), loading=ref(false), showDropdown=ref(false), failed=ref(false), activeIndex=ref(-1)
const searchBarRef=ref<HTMLElement|null>(null), inputRef=ref<HTMLInputElement|null>(null), listId=useId()
let timer:ReturnType<typeof setTimeout>|null=null, controller:AbortController|null=null, generation=0
watch(()=>props.torrent,()=>{++generation;controller?.abort();if(timer)clearTimeout(timer);suggestions.value=[];interpreted.value='';showDropdown.value=false;loading.value=false;query.value=props.modelValue||''})
watch(()=>props.modelValue,value=>{if(value!==undefined && value!==query.value) query.value=value})
async function torrentSuggestions(q:string,signal:AbortSignal):Promise<{items:SearchSuggestion[];interpreted:string}>{
 const pages=await Promise.all((['movie','tv'] as const).map(kind=>torrentsApi.list({kind,q},signal)))
 const mixed=Array.from({length:3},(_,index)=>pages.flatMap(page=>page.items[index]?[page.items[index]!]:[])).flat()
 // Layout/transliteration fixes come back from the server ("ntvysq" -> "тёмный").
 const interpreted=pages.map(page=>page.interpreted_as?.trim()||'').find(Boolean)||''
 return {items:mixed.slice(0,5).map(item=>({...item,id:String(item.tmdb_id),type:item.kind==='tv'?'series':'movie'})) as SearchSuggestion[],interpreted}
}
async function fetchSuggestions(q:string, version:number){
 if(q.trim().length<2){suggestions.value=[];showDropdown.value=false;loading.value=false;return}
 controller=new AbortController();loading.value=true;showDropdown.value=true;failed.value=false
 try {
  const found=props.torrent
   ? await torrentSuggestions(q.trim(),controller.signal)
   : {items:(await apiClient.searchMoviesQuick(q.trim(),5,controller.signal)).items as SearchSuggestion[],interpreted:''}
  if(version===generation){suggestions.value=found.items;interpreted.value=found.interpreted.toLowerCase()===q.trim().toLowerCase()?'':found.interpreted;activeIndex.value=-1}
 }
 catch(error){if(version===generation && !(error instanceof Error && error.name==='AbortError')){failed.value=true;suggestions.value=[];interpreted.value=''}}
 finally{if(version===generation) loading.value=false}
}
function onInput(){
 emit('update:modelValue',query.value);if(timer)clearTimeout(timer);controller?.abort();const version=++generation
 suggestions.value=[];interpreted.value='';activeIndex.value=-1;showDropdown.value=query.value.trim().length>=2;loading.value=showDropdown.value
 timer=setTimeout(()=>{const q=query.value.trim();if(!props.torrent && route.path==='/movies') {const next={...route.query};if(q)next.q=q;else delete next.q;next.page='1';router.replace({path:'/movies',query:next})}fetchSuggestions(q,version)},props.debounceMs??250)
}
function clear(){query.value='';emit('update:modelValue','');suggestions.value=[];interpreted.value='';showDropdown.value=false;loading.value=false;++generation;controller?.abort();if(timer)clearTimeout(timer);if(!props.torrent && route.path==='/movies'){const next={...route.query};delete next.q;next.page='1';router.replace({path:'/movies',query:next})}else emit('search','');inputRef.value?.focus()}
function selectSuggestion(movie:SearchSuggestion){showDropdown.value=false;query.value=cleanTitle(movie.title);emit('update:modelValue',movie.title);router.push(props.torrent?{path:torrentPath({kind:movie.type==='series'?'tv':'movie',tmdb_id:Number(movie.id)})}:contentPath(movie.type==='series'?'series':'movie',movie.id,movie.title))}
function onEnter(){if(timer)clearTimeout(timer);if(activeIndex.value>=0 && suggestions.value[activeIndex.value]){selectSuggestion(suggestions.value[activeIndex.value]!);return}showDropdown.value=false;emit('search',query.value)}
function titleParts(movie:SearchSuggestion){return highlightParts(cleanTitle(movie.title),[query.value,interpreted.value])}
function meta(movie:SearchSuggestion){return [movie.type==='series'?tr('Сериал','Series'):tr('Фильм','Movie'),movie.year,movie.rating?`★ ${movie.rating.toFixed(1)}`:''].filter(Boolean).join(' · ')}
function move(delta:number){if(!suggestions.value.length)return;showDropdown.value=true;activeIndex.value=(activeIndex.value+delta+suggestions.value.length)%suggestions.value.length}
function handleClickOutside(event:MouseEvent){if(searchBarRef.value && !searchBarRef.value.contains(event.target as Node))showDropdown.value=false}
onMounted(()=>document.addEventListener('mousedown',handleClickOutside))
onUnmounted(()=>{if(timer)clearTimeout(timer);controller?.abort();++generation;document.removeEventListener('mousedown',handleClickOutside)})
defineExpose({focus:()=>inputRef.value?.focus()})
</script>
<template>
 <div class="search-bar" ref="searchBarRef">
  <Search class="search-icon" :size="18" aria-hidden="true" />
  <input ref="inputRef" v-model="query" type="search" :maxlength="torrent?120:undefined" role="combobox" aria-label="Поиск фильмов и сериалов" aria-autocomplete="list" :aria-controls="listId" :aria-expanded="showDropdown" :aria-activedescendant="activeIndex>=0 ? `${listId}-${activeIndex}` : undefined" :placeholder="placeholder || 'Поиск фильмов, сериалов...'" class="search-input" @input="onInput" @keydown.enter="onEnter" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc.prevent="showDropdown=false" @focus="query.trim().length>=2 && (showDropdown=true)" />
  <kbd class="shortcut-key" aria-hidden="true">Ctrl + K</kbd>
  <button v-if="query" class="clear-btn" :aria-label="t('Clear search')" @click="clear"><X :size="16" /></button>
  <div v-if="showDropdown" class="search-dropdown">
   <div v-if="loading" class="dropdown-state" role="status"><Loader2 class="spinner" :size="20" /><span>Поиск…</span></div>
   <div v-else-if="failed" class="dropdown-state" role="status">Поиск временно недоступен. Попробуйте ещё раз.</div>
   <div v-else-if="!suggestions.length" class="dropdown-state" role="status">Ничего не найдено</div>
   <div v-else-if="interpreted" class="dropdown-hint" role="status">Ищем «{{interpreted}}»</div>
   <ul :id="listId" role="listbox" aria-label="Результаты поиска" class="suggestions-list">
    <li v-for="(movie,index) in suggestions" :id="`${listId}-${index}`" :key="`${movie.type}-${movie.id}`" role="option" :aria-selected="activeIndex===index" class="suggestion-item" @mousedown.prevent @click="selectSuggestion(movie)" @mouseenter="activeIndex=index"><img v-if="movie.poster" :src="posterUrl(movie.poster)" :alt="`Постер «${cleanTitle(movie.title)}»`" class="suggestion-poster" width="32" height="48" decoding="async" /><span v-else class="suggestion-poster" aria-hidden="true"></span><div class="suggestion-info"><span class="suggestion-title"><template v-for="(part,partIndex) in titleParts(movie)" :key="partIndex"><mark v-if="part.mark">{{part.text}}</mark><template v-else>{{part.text}}</template></template></span><span class="suggestion-meta">{{meta(movie)}}</span></div></li>
   </ul>
   <button v-if="!loading && suggestions.length" class="dropdown-footer" @click="activeIndex=-1;onEnter()">Все результаты по запросу «{{query}}»</button>
  </div>
 </div>
</template>

<style scoped>
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 480px;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--ui-muted);
  pointer-events: none;
  z-index: 2;
}

.search-input {
  width: 100%;
  padding: 10px 38px 10px 42px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-control);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  z-index: 1;
}

.search-input:focus {
  border-color: var(--ui-control);
  background: var(--ui-raised);
}

.clear-btn {
  position: absolute;
  right: 10px;
  background: transparent;
  border: none;
  color: var(--ui-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  z-index: 2;
}

.clear-btn:hover {
  color: var(--ui-text);
  background: var(--ui-raised);
}

/* Dropdown (mockup: glass popup, 32x48 posters, honey matches) */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  min-width: 300px;
  padding: 8px;
  border-radius: 16px;
  background: rgba(23, 26, 33, 0.96);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 24px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.dropdown-hint {
  padding: 4px 8px 8px;
  font-size: 12px;
  line-height: 16px;
  color: var(--ui-muted);
}

.dropdown-state {
  padding: 20px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ui-secondary);
  font-size: 0.9rem;
}

.spinner {
  animation: spin 1s linear infinite;
  color: #ffd24d;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.suggestions-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.suggestion-item:hover,
.suggestion-item[aria-selected="true"] {
  background: rgba(255, 255, 255, 0.06);
}

.suggestion-poster {
  flex: none;
  width: 32px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(255, 227, 110, 0.14), rgba(255, 158, 27, 0.08));
}

.suggestion-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.suggestion-title {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggestion-title mark {
  background: none;
  color: #ffd24d;
}

.suggestion-meta {
  font-size: 12px;
  line-height: 16px;
  color: var(--ui-muted);
}

.dropdown-footer {
  margin-top: 4px;
  padding: 10px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #ffd24d;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.dropdown-footer:hover,
.dropdown-footer:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}
</style>
