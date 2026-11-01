<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { torrentsApi, torrentPath, type TorrentItem, type TorrentPage, type TorrentKind, type TmdbGenre } from '@/api/torrents'
import { SlidersHorizontal, RotateCcw, ChevronDown, ArrowRight, Play } from 'lucide-vue-next'
import LibraryButton from '@/components/LibraryButton.vue'
import TorrentCard from '@/components/TorrentCard.vue'
import { NEW_RELEASE_YEAR } from '@/router/catalogSections'
const route=useRoute(),router=useRouter()
const desktopFilters=ref(true)
function resizeFilters(){desktopFilters.value=window.innerWidth>=768}
onMounted(()=>{resizeFilters();window.addEventListener('resize',resizeFilters)})
const kind=computed<TorrentKind>(()=>route.query.kind==='tv'?'tv':'movie')
const page=computed(()=>Math.min(500,Math.max(1,Number.parseInt(String(route.query.page||'1'),10)||1)))
const genre=computed(()=>/^\d+$/.test(String(route.query.genre||''))?String(route.query.genre):'')
const year=computed(()=>/^\d{4}$/.test(String(route.query.year||''))?String(route.query.year):'')
const queryText=computed(()=>String(route.query.q||'').trim().slice(0,120))
const home=computed(()=>!route.params.id&&!['kind','genre','year','page','q'].some(k=>route.query[k]))
const loading=ref(true),error=ref(''),data=ref<TorrentPage|null>(null),detail=ref<TorrentItem|null>(null)
const genres=ref<TmdbGenre[]>([]),rails=ref<{title:string;items:TorrentItem[];query:Record<string,string>}[]>([])
const hero=ref<TorrentItem|null>(null)
let heroTimer:ReturnType<typeof setTimeout>|undefined
async function refreshHero(version:number,signal:AbortSignal){
 try{const result=await torrentsApi.list({kind:'movie',collection:'spotlight'},signal);if(version!==generation)return;hero.value=result.items[0]||null;
 const delay=Date.parse(result.refresh_at||'')-Date.now();if(Number.isFinite(delay))heroTimer=setTimeout(()=>refreshHero(version,signal),Math.max(1000,Math.min(delay,4*3600*1000)));
 }catch{if(version===generation&&!signal.aborted)heroTimer=setTimeout(()=>refreshHero(version,signal),60000)}
}
const title=computed(()=>queryText.value?`Поиск: «${queryText.value}» · ${kind.value==='tv'?'сериалы':'фильмы'}`:year.value?`${year.value===String(NEW_RELEASE_YEAR)?'Новинки':'Год'} ${year.value} · ${kind.value==='tv'?'сериалы':'фильмы'}`:kind.value==='tv'?'Сериалы TMDB':'Фильмы TMDB')
let generation=0,controller:AbortController|undefined
async function load(){
 const version=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal
 clearTimeout(heroTimer);hero.value=null
 loading.value=true;error.value='';data.value=null;detail.value=null;rails.value=[]
 try{
  if(route.params.id){
   const detailKind=String(route.params.kind)
   if(!['movie','tv'].includes(detailKind)||!/^\d+$/.test(String(route.params.id)))throw new Error('invalid')
   const result=await torrentsApi.detail(detailKind as TorrentKind,String(route.params.id),signal)
   if(version===generation)detail.value=result
  }else if(home.value){
   const results=await Promise.all([torrentsApi.list({kind:'movie'},signal),torrentsApi.list({kind:'movie',year:String(NEW_RELEASE_YEAR)},signal),torrentsApi.list({kind:'tv'},signal),torrentsApi.genres('movie',signal)])
   if(version!==generation)return
   genres.value=results[3].items
   // Hero loading is independent: unavailable artwork never blocks the catalogue.
   void refreshHero(version,signal)
   rails.value=[{title:'Популярное',items:results[0].items,query:{kind:'movie'}},{title:`Новинки ${NEW_RELEASE_YEAR}`,items:results[1].items,query:{kind:'movie',year:String(NEW_RELEASE_YEAR)}},{title:'Сериалы',items:results[2].items,query:{kind:'tv'}}]
  }else{
   const [result,list]=await Promise.all([torrentsApi.list({kind:kind.value,page:page.value,genre:queryText.value?'':genre.value,year:year.value,...(queryText.value?{q:queryText.value}:{})},signal),torrentsApi.genres(kind.value,signal)])
   if(version!==generation)return
   data.value=result;genres.value=list.items
  }
 }catch(e){if(version===generation&&!(e instanceof Error&&e.name==='AbortError'))error.value='Не удалось загрузить каталог TMDB. Проверьте подключение или повторите попытку.'}
 finally{if(version===generation)loading.value=false}
}
function filter(name:string,value:string){const query:LocationQueryRaw={...route.query,kind:kind.value};delete query.page;if(value)query[name]=value;else delete query[name];router.push({path:'/torrents',query})}
function search(value:string){const q=value.trim().slice(0,120);router.push({path:'/torrents',query:{kind:kind.value,...(q?{q}:{}),...(year.value?{year:year.value}:{})}})}
function changeKind(value:string){router.push({path:'/torrents',query:{kind:value,...(year.value?{year:year.value}:{}),...(queryText.value?{q:queryText.value}:{})}})}
function paginate(value:number){router.push({path:'/torrents',query:{...route.query,kind:kind.value,page:String(value)}})}
watch(()=>route.fullPath,load,{immediate:true})
onBeforeUnmount(()=>{++generation;controller?.abort();clearTimeout(heroTimer);window.removeEventListener('resize',resizeFilters)})
</script>
<template>
 <div class="torrent-page" :class="{'torrent-home':home}" :data-torrent-ready="!loading">
  <div v-if="!route.params.id&&!home" class="torrent-tools">
   <details class="torrent-filters" :open="desktopFilters">
    <summary><SlidersHorizontal :size="16" /> Фильтры<span v-if="genre||year" class="filter-count">{{ Number(!!genre)+Number(!!year) }}</span><ChevronDown :size="16" /></summary>
    <div class="filter-fields">
     <label>Тип контента<span class="select-wrap"><select :value="kind" @change="changeKind(($event.target as HTMLSelectElement).value)"><option value="movie">Фильмы</option><option value="tv">Сериалы</option></select><ChevronDown :size="16" /></span></label>
     <label>Жанр<span class="select-wrap"><select :value="queryText?'':genre" :disabled="loading||!!queryText" @change="filter('genre',($event.target as HTMLSelectElement).value)"><option value="">Все жанры</option><option v-for="g in genres" :key="g.id" :value="String(g.id)">{{g.name}}</option></select><ChevronDown :size="16" /></span></label>
     <label>Год выхода<span class="select-wrap"><select :value="year" @change="filter('year',($event.target as HTMLSelectElement).value)"><option value="">Все годы</option><option v-for="y in NEW_RELEASE_YEAR-1899" :key="y" :value="String(NEW_RELEASE_YEAR-y+1)">{{ NEW_RELEASE_YEAR-y+1 }}</option></select><ChevronDown :size="16" /></span></label>
     <router-link class="reset-filters" to="/torrents?kind=movie"><RotateCcw :size="16" /> Сбросить</router-link>
    </div>
   </details>
  </div>
  <p v-if="queryText" class="search-context">Поиск по названию: выберите фильмы или сериалы, при необходимости уточните год. Фильтр жанра доступен без поискового запроса.<button @click="search('')">Очистить поиск</button></p>
  <div v-if="loading" class="torrent-loading" role="status" aria-label="Загрузка каталога TMDB"><span class="sr-only">Загрузка каталога TMDB</span><div v-for="n in 6" :key="n" class="torrent-skeleton" /></div>
  <section v-else-if="error" class="torrent-state" role="alert"><h1>Каталог временно недоступен</h1><p>{{error}}</p><button @click="load">Повторить попытку</button></section>
  <template v-else-if="detail">
   <router-link class="back-link" :to="{path:'/torrents',query:route.query}">← Назад в торрент каталог</router-link>
   <section class="torrent-detail">
    <img v-if="detail.poster" :src="detail.poster" :alt="`Постер «${detail.title}»`" width="342" height="513" />
    <div><span class="mode-label">{{detail.kind==='tv'?'СЕРИАЛ':'ФИЛЬМ'}} · TMDB</span><h1>{{detail.title}}</h1><LibraryButton :item="detail" /><p class="original-title">{{detail.original_title}}</p><p>{{detail.year}}<span v-if="detail.rating"> · ★ {{detail.rating.toFixed(1)}}</span><span v-if="detail.runtime"> · {{detail.runtime}} мин</span><span v-if="detail.seasons"> · Сезонов: {{detail.seasons}}</span><span v-if="detail.episodes"> · Эпизодов: {{detail.episodes}}</span></p><div class="detail-genres"><router-link v-for="g in detail.genres" :key="g.id" :to="{path:'/torrents',query:{kind:detail.kind,genre:String(g.id)}}">{{g.name}}</router-link></div><p class="overview">{{detail.overview||'Описание на русском языке пока недоступно.'}}</p><div class="playback-pending"><h2>Торрент воспроизведение ещё не подключено</h2><p>Здесь появятся доступные раздачи и выбор источника. Сейчас можно изучить описание и продолжить поиск в каталоге.</p><router-link :to="`/torrents?kind=${detail.kind}`">Продолжить выбор →</router-link></div></div>
   </section>
  </template>
  <template v-else-if="home">
   <h1 class="sr-only">Торренты · фильмы и сериалы TMDB</h1>
   <section v-if="hero" class="torrent-hero" :data-hero-id="hero.tmdb_id"><img v-if="hero.backdrop" :key="hero.backdrop" :src="hero.backdrop" alt="" fetchpriority="high" width="1280" height="720" /><div class="hero-shade" /><div class="hero-copy"><span class="mode-label">СЕГОДНЯ В ФОКУСЕ · ФИЛЬМ</span><img class="hero-tmdb" src="/tmdb-logo.svg" alt="TMDB" width="70" height="10" /><h2>{{hero.title}}</h2><div class="hero-meta"><span>{{hero.year}}</span><span v-if="hero.rating">★ {{hero.rating.toFixed(1)}}</span><span>Фильм</span></div><p>{{hero.overview||'Откройте историю, к которой хочется вернуться.'}}</p><div class="hero-actions"><router-link :to="{path:torrentPath(hero),query:route.query}"><Play :size="18" fill="currentColor" /> Смотреть <ArrowRight :size="18" /></router-link><LibraryButton :item="hero" /></div></div><span class="hero-schedule">Новая история каждые 4 часа</span></section>
   <section v-for="rail in rails" :key="rail.title" class="torrent-rail"><div class="rail-heading"><h2>{{rail.title}}</h2><router-link :to="{path:'/torrents',query:rail.query}">Смотреть все →</router-link></div><div class="rail-items torrent-grid"><TorrentCard v-for="entry in rail.items.slice(0,6)" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry"  /></div></section>
  </template>
  <section v-else-if="data" class="torrent-results">
   <div class="results-heading"><h1>{{title}}</h1><p>В каталоге TMDB: {{data.total.toLocaleString('ru-RU')}}. Не количество доступных раздач.</p></div>
   <div v-if="data.items.length" class="torrent-grid"><TorrentCard v-for="entry in data.items" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry" /></div>
   <div v-else class="torrent-state"><h2>По этим фильтрам ничего не найдено</h2><p>Выберите другой жанр или год выхода.</p><router-link to="/torrents">Сбросить фильтры</router-link></div>
   <nav v-if="data.total_pages>1" class="torrent-pagination" aria-label="Страницы каталога TMDB"><button :disabled="page<=1" @click="paginate(page-1)">← Назад</button><span>{{page}} / {{data.total_pages}}</span><button :disabled="page>=data.total_pages" @click="paginate(page+1)">Далее →</button></nav>
   <p v-if="data.total_pages===500" class="pagination-note">TMDB позволяет просмотреть первые 500 страниц. Уточните жанр или год, чтобы сузить выбор.</p>
  </section>
  <footer class="tmdb-credit"><p class="engine-note">Торрент каталог · Воспроизведение ещё не подключено. Карточки TMDB не гарантируют наличие раздач.</p><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="/tmdb-logo.svg" width="100" height="14" alt="TMDB" /> Метаданные и изображения ↗</a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer>
 </div>
</template>
<style scoped>
.torrent-page{--ui-link:#9ce8d7;--torrent-accent:#9ce8d7;--torrent-gold:#f4d45e;max-width:var(--page-frame-max);margin:0 auto;padding:24px var(--page-frame-gutter) 64px;box-sizing:border-box;width:100%;min-width:0;color:var(--ui-text,#fff)}a{color:inherit}.torrent-home{max-width:none;padding:0 0 48px}.mode-label{color:#9ce8d7;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em}
.torrent-hero{position:relative;overflow:hidden;min-height:420px;display:flex;align-items:center;isolation:isolate;margin-bottom:32px;background:#0a1012}.torrent-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 35%;z-index:-2}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,12,14,.92),rgba(7,12,14,.62) 40%,rgba(7,12,14,.04) 80%),linear-gradient(0deg,rgba(7,12,14,.65),transparent 65%);z-index:-1}.hero-copy{width:100%;max-width:var(--page-frame-max);margin:0 auto;padding:48px var(--page-frame-gutter);box-sizing:border-box}.hero-copy h2{font-size:48px;line-height:1;font-weight:600;max-width:680px;margin:16px 0 24px;text-wrap:balance}.hero-copy p{max-width:640px;font-size:16px;line-height:24px;color:#d4d8d7;margin:24px 0 32px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-wrap:pretty}.hero-meta{display:flex;gap:16px;font-size:14px;line-height:20px;color:#c4c8c7}.hero-meta span:nth-child(2){color:var(--torrent-gold)}.hero-actions>a,.playback-pending>a{display:inline-flex;align-items:center;gap:16px;background:var(--torrent-gold);color:#141414;font-size:16px;line-height:24px;font-weight:600;padding:12px 16px;border-radius:12px;text-decoration:none;transition:background 300ms cubic-bezier(.22,1,.36,1)}.hero-actions>a:hover{background:#9ce8d7}.hero-schedule{position:absolute;bottom:24px;right:max(var(--page-frame-gutter),calc((100% - var(--page-frame-max))/2 + var(--page-frame-gutter)));font-size:12px;line-height:16px;color:#c9d0cc}
.torrent-rail{max-width:var(--page-frame-max);margin:0 auto 40px;padding:0 var(--page-frame-gutter);box-sizing:border-box}.rail-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 24px}.rail-heading h2{display:flex;align-items:center;gap:12px;font-size:24px;line-height:32px;font-weight:600;margin:0}.rail-heading h2:before{content:'';height:24px;width:4px;background:var(--torrent-gold);border-radius:4px}.rail-heading>a{font-size:14px;line-height:20px;color:var(--torrent-gold);text-decoration:none;white-space:nowrap}.torrent-grid,.torrent-loading{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:24px 16px}.torrent-skeleton{aspect-ratio:2/3;border-radius:12px;background:#1f1f1f}.torrent-home>.torrent-loading{max-width:var(--page-frame-max);margin:32px auto;padding:0 var(--page-frame-gutter)}
.torrent-tools{margin-bottom:24px}.torrent-filters{display:block}.torrent-filters>summary{display:none}.filter-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:12px;align-items:end}.filter-fields label{display:grid;gap:8px;min-width:0;font-size:12px;line-height:16px;color:var(--ui-secondary)}.select-wrap{position:relative;display:flex;align-items:center;min-width:0}.select-wrap>svg{position:absolute;right:12px;pointer-events:none}.torrent-filters select{appearance:none;width:100%;min-width:0;min-height:44px;padding:10px 36px 10px 12px;border:1px solid var(--ui-control);border-radius:8px;background:var(--ui-surface);font:inherit;font-size:14px;line-height:20px;color:var(--ui-text)}.torrent-filters select:disabled{opacity:.5}.reset-filters,.torrent-pagination button,.torrent-state button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;min-height:44px;box-sizing:border-box;background:var(--ui-surface);color:inherit;border:1px solid var(--ui-control);border-radius:8px;text-decoration:none;font-size:14px;line-height:20px;cursor:pointer}.search-context{font-size:14px;line-height:20px;color:var(--ui-secondary);margin:0 0 24px}.search-context button{margin-left:8px;color:var(--ui-link);background:none;border:0;text-decoration:underline;cursor:pointer;min-height:44px}
.results-heading{margin:24px 0}.results-heading h1,.torrent-detail h1,.torrent-state h1{font-size:30px;line-height:36px;font-weight:600;margin:0 0 12px;text-wrap:balance}.results-heading p,.pagination-note{font-size:14px;line-height:20px;color:#bbb}.torrent-pagination{display:flex;justify-content:center;align-items:center;gap:16px;margin-top:32px}.torrent-pagination button:disabled{opacity:.4;cursor:default}.pagination-note{text-align:center}.torrent-state{padding:48px 24px;text-align:center;border:1px solid var(--ui-border);border-radius:12px}.torrent-state p{font-size:16px;line-height:24px;color:#bbb}.torrent-home>.torrent-state{margin:32px var(--page-frame-gutter)}.tmdb-credit{max-width:var(--page-frame-max);box-sizing:border-box;margin:48px auto 0;padding-top:24px;color:#bbb;font-size:12px;line-height:16px}.torrent-home .tmdb-credit{padding:24px var(--page-frame-gutter) 0}.tmdb-credit img{vertical-align:middle;margin-right:12px;max-width:100px}.tmdb-credit p{margin:8px 0}.engine-note{max-width:680px}
.back-link{display:inline-block;min-height:44px;margin:0 0 24px;text-decoration:none}.torrent-detail{display:grid;grid-template-columns:minmax(180px,280px) minmax(0,1fr);gap:32px}.torrent-detail>img{width:100%;height:auto;border-radius:12px}.torrent-detail h1{margin-top:16px}.torrent-detail p{font-size:16px;line-height:24px}.original-title{color:#bbb}.detail-genres{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.detail-genres a{border:1px solid var(--ui-border);padding:8px 12px;border-radius:8px;text-decoration:none;font-size:14px;line-height:20px}.overview{max-width:680px;text-wrap:pretty}.playback-pending{padding:24px;margin-top:32px;background:#181818;border:1px solid #527d73;border-radius:12px}.playback-pending h2{font-size:20px;line-height:28px;margin:0}.playback-pending p{color:#bbb}a:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid #9ce8d7;outline-offset:4px}
@media(max-width:1100px){.torrent-grid,.torrent-loading{grid-template-columns:repeat(4,minmax(0,1fr))}.rail-items>*:nth-child(n+5){display:none}.hero-copy h2{font-size:36px;line-height:40px}}
@media(max-width:767px){.torrent-page{padding-top:16px}.torrent-home{padding-top:0}.torrent-hero{min-height:480px;align-items:flex-end}.torrent-hero>img{object-position:65% center}.hero-shade{background:linear-gradient(0deg,rgba(7,12,14,.98),rgba(7,12,14,.75) 45%,rgba(7,12,14,.04) 95%)}.hero-copy{padding-top:160px;padding-bottom:64px}.hero-copy h2{font-size:30px;line-height:36px;margin:12px 0 16px}.hero-copy p{font-size:14px;line-height:20px;-webkit-line-clamp:3;margin:16px 0 24px}.hero-schedule{bottom:24px;left:var(--page-frame-gutter);right:auto}.hero-meta{font-size:14px;gap:12px}.torrent-grid,.torrent-loading{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}.rail-heading{margin-bottom:16px}.rail-heading h2{font-size:20px;line-height:28px}.rail-heading>a{font-size:12px}.torrent-filters>summary{display:flex;align-items:center;gap:8px;width:max-content;min-height:44px;padding:8px 12px;box-sizing:border-box;border:1px solid var(--ui-control);border-radius:8px;list-style:none;cursor:pointer}.torrent-filters>summary::-webkit-details-marker{display:none}.filter-fields{display:none;grid-template-columns:1fr 1fr;margin-top:16px}.torrent-filters[open] .filter-fields{display:grid}.filter-count{color:#9ce8d7}.torrent-detail{grid-template-columns:1fr;gap:24px}.torrent-detail>img{width:160px;height:240px;object-fit:cover}.results-heading h1,.torrent-detail h1{font-size:24px;line-height:32px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.hero-actions{display:flex;align-items:center;gap:20px;margin-top:24px}.hero-tmdb{display:inline-block;width:70px;height:auto;margin-left:14px;vertical-align:middle}
</style>
