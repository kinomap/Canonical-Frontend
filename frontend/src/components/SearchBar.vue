<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch, onUnmounted, onMounted, useId } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, X, Loader2 } from 'lucide-vue-next'
import { apiClient } from '@/api/client'
import type { MovieSummary } from '@/types/movie'
import {posterUrl} from '@/utils/poster'
import {contentPath,cleanTitle} from '@/utils/contentPath'
const props = defineProps<{modelValue?: string; placeholder?: string; debounceMs?: number}>()
const emit = defineEmits<{(e:'update:modelValue',val:string):void;(e:'search',val:string):void}>()
const router=useRouter(), route=useRoute(), query=ref(props.modelValue || '')
const suggestions=ref<MovieSummary[]>([]), loading=ref(false), showDropdown=ref(false), failed=ref(false), activeIndex=ref(-1)
const searchBarRef=ref<HTMLElement|null>(null), inputRef=ref<HTMLInputElement|null>(null), listId=useId()
let timer:ReturnType<typeof setTimeout>|null=null, controller:AbortController|null=null, generation=0
watch(()=>props.modelValue,value=>{if(value!==undefined && value!==query.value) query.value=value})
async function fetchSuggestions(q:string, version:number){
 if(q.trim().length<2){suggestions.value=[];showDropdown.value=false;loading.value=false;return}
 controller=new AbortController();loading.value=true;showDropdown.value=true;failed.value=false
 try {const result=await apiClient.searchMoviesQuick(q.trim(),5,controller.signal);if(version===generation){suggestions.value=result.items;activeIndex.value=-1}}
 catch(error){if(version===generation && !(error instanceof Error && error.name==='AbortError')){failed.value=true;suggestions.value=[]}}
 finally{if(version===generation) loading.value=false}
}
function onInput(){
 emit('update:modelValue',query.value);if(timer)clearTimeout(timer);controller?.abort();const version=++generation
 suggestions.value=[];activeIndex.value=-1;showDropdown.value=query.value.trim().length>=2;loading.value=showDropdown.value
 timer=setTimeout(()=>{const q=query.value.trim();if(route.path==='/movies') {const next={...route.query};if(q)next.q=q;else delete next.q;next.page='1';router.replace({path:'/movies',query:next})}fetchSuggestions(q,version)},props.debounceMs??250)
}
function clear(){query.value='';emit('update:modelValue','');suggestions.value=[];showDropdown.value=false;loading.value=false;++generation;controller?.abort();if(timer)clearTimeout(timer);if(route.path==='/movies'){const next={...route.query};delete next.q;next.page='1';router.replace({path:'/movies',query:next})}else emit('search','');inputRef.value?.focus()}
function selectSuggestion(movie:MovieSummary){showDropdown.value=false;query.value=cleanTitle(movie.title);emit('update:modelValue',movie.title);router.push(contentPath(movie.type==='series'?'series':'movie',movie.id,movie.title))}
function onEnter(){if(timer)clearTimeout(timer);if(activeIndex.value>=0 && suggestions.value[activeIndex.value]){selectSuggestion(suggestions.value[activeIndex.value]!);return}showDropdown.value=false;emit('search',query.value)}
function move(delta:number){if(!suggestions.value.length)return;showDropdown.value=true;activeIndex.value=(activeIndex.value+delta+suggestions.value.length)%suggestions.value.length}
function handleClickOutside(event:MouseEvent){if(searchBarRef.value && !searchBarRef.value.contains(event.target as Node))showDropdown.value=false}
onMounted(()=>document.addEventListener('mousedown',handleClickOutside))
onUnmounted(()=>{if(timer)clearTimeout(timer);controller?.abort();++generation;document.removeEventListener('mousedown',handleClickOutside)})
defineExpose({focus:()=>inputRef.value?.focus()})
</script>
<template>
 <div class="search-bar" ref="searchBarRef">
  <Search class="search-icon" :size="18" aria-hidden="true" />
  <input ref="inputRef" v-model="query" type="search" role="combobox" aria-label="Поиск фильмов и сериалов" aria-autocomplete="list" :aria-controls="listId" :aria-expanded="showDropdown" :aria-activedescendant="activeIndex>=0 ? `${listId}-${activeIndex}` : undefined" :placeholder="placeholder || 'Поиск фильмов, сериалов...'" class="search-input" @input="onInput" @keydown.enter="onEnter" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc.prevent="showDropdown=false" @focus="query.trim().length>=2 && (showDropdown=true)" />
  <kbd class="shortcut-key" aria-hidden="true">Ctrl + K</kbd>
  <button v-if="query" class="clear-btn" :aria-label="t('Clear search')" @click="clear"><X :size="16" /></button>
  <div v-if="showDropdown" class="search-dropdown">
   <div v-if="loading" class="dropdown-state" role="status"><Loader2 class="spinner" :size="20" /><span>Поиск…</span></div>
   <div v-else-if="failed" class="dropdown-state" role="status">Поиск временно недоступен. Попробуйте ещё раз.</div>
   <div v-else-if="!suggestions.length" class="dropdown-state" role="status">Ничего не найдено</div>
   <ul :id="listId" role="listbox" aria-label="Результаты поиска" class="suggestions-list">
    <li v-for="(movie,index) in suggestions" :id="`${listId}-${index}`" :key="`${movie.type}-${movie.id}`" role="option" :aria-selected="activeIndex===index" class="suggestion-item" @mousedown.prevent @click="selectSuggestion(movie)"><img v-if="movie.poster" :src="posterUrl(movie.poster)" :alt="`Постер «${cleanTitle(movie.title)}»`" class="suggestion-poster" width="36" height="54" decoding="async" /><div class="suggestion-info"><span class="suggestion-title">{{cleanTitle(movie.title)}}<span v-if="movie.type==='series'" class="type-badge">{{t("Сериал")}}</span></span><span class="suggestion-meta">{{movie.year}} <span v-if="movie.rating">★ {{movie.rating.toFixed(1)}}</span></span></div></li>
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

/* Dropdown */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.dropdown-state {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ui-secondary);
  font-size: 0.9rem;
}

.spinner {
  animation: spin 1s linear infinite;
  color: var(--ui-link);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.suggestions-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  max-height: 360px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.suggestion-item:hover {
  background: var(--ui-raised);
}

.suggestion-poster {
  width: 40px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
}

.suggestion-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.suggestion-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-badge {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ui-raised);
  color: var(--ui-link);
  border: 1px solid var(--ui-border);
  font-weight: 500;
}

.suggestion-meta {
  font-size: 0.8rem;
  color: var(--ui-secondary);
}

.dropdown-footer {
  padding: 12px 16px;
  background: var(--ui-raised);
  border-top: 1px solid var(--ui-border);
  font-size: 0.9rem;
  color: var(--ui-link);
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s ease;
}

.dropdown-footer:hover {
  background: var(--ui-raised);
}
</style>
