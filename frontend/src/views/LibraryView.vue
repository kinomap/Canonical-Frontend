<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bookmark, ArrowLeft, ArrowRight, Clapperboard, ChevronDown } from 'lucide-vue-next'
import { libraryApi } from '@/api/library'
import type { LibraryPage, LibrarySort } from '@/api/library'
import type { TorrentKind } from '@/api/torrents'
import { ApiError } from '@/api/client'
import TorrentCard from '@/components/TorrentCard.vue'
import { useLibrary } from '@/stores/library'
// Kinoteka: saved titles only (no preparation status on cards). Type segment and sort order
// live in the URL (?kind=movie|tv&sort=rating|title&page=N) and are applied by the server.
const route=useRoute(),router=useRouter(),library=useLibrary()
const data=ref<LibraryPage|null>(null),loading=ref(false),error=ref(''),signedOut=ref(false)
const SORTS:{value:LibrarySort;label:string}[]=[{value:'added',label:'Сначала новые'},{value:'rating',label:'По рейтингу'},{value:'title',label:'По названию'}]
const TABS:{kind?:TorrentKind;label:string}[]=[{label:'Все'},{kind:'movie',label:'Фильмы'},{kind:'tv',label:'Сериалы'}]
const page=computed(()=>Math.min(10000,Math.max(1,parseInt(String(route.query.page||1),10)||1)))
const kind=computed<TorrentKind|undefined>(()=>route.query.kind==='movie'||route.query.kind==='tv'?route.query.kind:undefined)
const sort=computed<LibrarySort>(()=>SORTS.find(s=>s.value===route.query.sort)?.value??'added')
function countOf(k?:TorrentKind){const c=data.value?.counts;if(!c)return null;return k?c[k]:c.movie+c.tv}
const emptyTitle=computed(()=>kind.value==='movie'?'Фильмов в кинотеке пока нет':kind.value==='tv'?'Сериалов в кинотеке пока нет':'Здесь будет ваша кинотека')
let generation=0
async function load(){const version=++generation;loading.value=true;error.value='';signedOut.value=false
 try{const result=await libraryApi.list(page.value,kind.value,sort.value);if(version!==generation)return
  if(page.value>result.total_pages){await router.replace({query:query({page:result.total_pages>1?String(result.total_pages):undefined})});return}
  data.value=result}
 catch(e){if(version!==generation)return;if(e instanceof ApiError&&e.status===401){signedOut.value=true;data.value=null}else error.value='Не удалось загрузить кинотеку. Попробуйте ещё раз.'}
 finally{if(version===generation)loading.value=false}}
watch([page,kind,sort,library.revision],load,{immediate:true})
onUnmounted(()=>{generation++})
function query(patch:Record<string,string|undefined>){const next:Record<string,string>={};for(const [k,v] of Object.entries({...route.query,...patch}))if(typeof v==='string'&&v)next[k]=v;return next}
function go(n:number){router.push({query:query({page:n>1?String(n):undefined})})}
function setKind(k?:TorrentKind){if(k!==kind.value)router.push({query:query({kind:k,page:undefined})})}
function setSort(value:string){if(value!==sort.value)router.push({query:query({sort:value==='added'?undefined:value,page:undefined})})}
</script>
<template><main class="library-page">
 <header class="library-head">
  <div><p class="eyebrow">ВАША КОЛЛЕКЦИЯ</p><h1>Кинотека</h1><p class="lead">Фильмы и сериалы, которые вы сохранили. Последние добавленные идут первыми.</p></div>
  <router-link to="/torrents" class="lib-btn lib-btn-ghost library-catalog"><Clapperboard :size="18" aria-hidden="true" />Торрент каталог</router-link>
 </header>
 <div class="library-toolbar">
  <div class="library-seg" role="group" aria-label="Тип записей">
   <button v-for="tab in TABS" :key="tab.label" type="button" :class="{on:tab.kind===kind}" :aria-pressed="tab.kind===kind" @click="setKind(tab.kind)">{{tab.label}}<em v-if="countOf(tab.kind)!==null">{{countOf(tab.kind)}}</em></button>
  </div>
  <label class="library-sort"><select :value="sort" aria-label="Сортировка" @change="setSort(($event.target as HTMLSelectElement).value)"><option v-for="s in SORTS" :key="s.value" :value="s.value">{{s.label}}</option></select><ChevronDown :size="16" aria-hidden="true" /></label>
 </div>
 <p v-if="loading&&!data&&!error&&!signedOut" role="status" class="library-status">Загружаем кинотеку…</p>
 <section v-else-if="signedOut" class="library-empty"><Bookmark :size="32" aria-hidden="true" /><h2>Войдите, чтобы открыть кинотеку</h2><p>Сессия завершилась. После входа сохранённые фильмы и сериалы снова появятся здесь.</p><router-link :to="{path:'/login',query:{redirect:route.fullPath}}" class="lib-btn lib-btn-primary">Войти</router-link></section>
 <section v-else-if="error" class="library-empty" role="alert"><p>{{error}}</p><button type="button" class="lib-btn lib-btn-ghost" @click="load">Повторить</button></section>
 <template v-else-if="data">
  <div v-if="data.items.length" class="library-grid" :class="{'is-loading':loading}" :aria-busy="loading"><TorrentCard v-for="item in data.items" :key="`${item.kind}:${item.tmdb_id}`" :item="item" /></div>
  <section v-else class="library-empty"><Bookmark :size="32" aria-hidden="true" /><h2>{{emptyTitle}}</h2><p>Нажмите на флажок у фильма или сериала, чтобы сохранить его.</p><router-link to="/torrents" class="lib-btn lib-btn-primary">Выбрать фильм</router-link></section>
  <nav v-if="data.total_pages>1" class="library-pagination" aria-label="Страницы кинотеки"><button type="button" :disabled="page<=1" aria-label="Предыдущая страница" @click="go(page-1)"><ArrowLeft :size="18" /></button><span>{{page}} / {{data.total_pages}}</span><button type="button" :disabled="page>=data.total_pages" aria-label="Следующая страница" @click="go(page+1)"><ArrowRight :size="18" /></button></nav>
 </template>
</main></template>
<style scoped>
.library-page{width:100%;max-width:1328px;margin:0 auto;padding:48px 24px 72px;min-height:70vh;color:#f5f6f8}
.library-head{display:grid;grid-template-columns:1fr auto;align-items:end;gap:24px;margin-bottom:32px}
.eyebrow{margin:0 0 8px;color:#ffd24d;font-size:12px;line-height:16px;font-weight:700;letter-spacing:.08em}
.library-head h1{margin:0;font-size:48px;line-height:56px;font-weight:800;letter-spacing:-.02em;background:linear-gradient(180deg,#fff 0%,#c9ced8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{margin:12px 0 0;max-width:560px;font-size:16px;line-height:24px;color:rgba(245,246,248,.68)}
.lib-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:12px;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s,transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
.lib-btn-ghost{background:rgba(255,255,255,.07);color:#f5f6f8}
.lib-btn-ghost:hover{background:rgba(255,255,255,.11)}
.lib-btn-primary{background:linear-gradient(135deg,#ffe36e 0%,#ffc21a 46%,#ff9e1b 100%);color:#1a1405;box-shadow:0 8px 24px rgba(255,170,20,.22)}
.lib-btn-primary:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(255,170,20,.3)}
.lib-btn:focus-visible,.library-seg button:focus-visible,.library-pagination button:focus-visible{outline:2px solid #ffc21a;outline-offset:2px}
.library-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:32px}
.library-seg{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.05)}
.library-seg button{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:rgba(245,246,248,.68);font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s,color .2s}
.library-seg button:hover{color:#f5f6f8}
.library-seg button.on{background:#1e222b;color:#f5f6f8;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 4px 12px rgba(0,0,0,.35)}
.library-seg em{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:6px;background:rgba(255,255,255,.07);color:rgba(245,246,248,.68);font-style:normal;font-size:12px;font-weight:700}
.library-seg button.on em{background:linear-gradient(135deg,#ffe36e 0%,#ffc21a 46%,#ff9e1b 100%);color:#1a1405}
.library-sort{position:relative;display:inline-flex;align-items:center}
.library-sort select{appearance:none;-webkit-appearance:none;height:40px;padding:0 40px 0 14px;border:0;border-radius:12px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);color:#f5f6f8;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}
.library-sort select:hover{background:rgba(255,255,255,.11)}
.library-sort select:focus-visible{outline:2px solid #ffc21a;outline-offset:2px}
.library-sort option{background:#171a21;color:#f5f6f8}
.library-sort svg{position:absolute;right:14px;pointer-events:none;color:rgba(245,246,248,.68)}
.library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:32px 24px;transition:opacity .2s}
.library-grid.is-loading{opacity:.55}
.library-status{color:rgba(245,246,248,.68)}
.library-empty{display:flex;flex-direction:column;align-items:center;gap:16px;padding:64px 24px;text-align:center;border-radius:24px;background:rgba(17,19,24,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.library-empty h2{margin:0;font-size:24px;line-height:32px}
.library-empty p{margin:0;max-width:460px;color:rgba(245,246,248,.68);line-height:24px}
.library-empty svg{color:#ffc21a}
.library-pagination{display:flex;justify-content:center;align-items:center;gap:16px;margin-top:40px;color:rgba(245,246,248,.68)}
.library-pagination button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.07);color:#f5f6f8;cursor:pointer;transition:background .2s}
.library-pagination button:hover:not(:disabled){background:rgba(255,255,255,.11)}
.library-pagination button:disabled{opacity:.35;cursor:default}
@media(max-width:767px){.library-page{padding:28px 16px 56px}.library-head{grid-template-columns:1fr;align-items:start}.library-head h1{font-size:34px;line-height:42px}.library-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}}
@media(prefers-reduced-motion:reduce){.lib-btn,.library-seg button,.library-grid,.library-sort select,.library-pagination button{transition:none}}
</style>
