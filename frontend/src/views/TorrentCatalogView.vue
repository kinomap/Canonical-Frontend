<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { torrentsApi, torrentPath, type TorrentItem, type TorrentPage, type TorrentKind, type TmdbGenre } from '@/api/torrents'
import { SlidersHorizontal, RotateCcw, ChevronDown, ArrowRight } from 'lucide-vue-next'
import SearchBar from '@/components/SearchBar.vue'
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
const searchText=ref(queryText.value)
watch(queryText,value=>{searchText.value=value})
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
 <div class="torrent-page" :data-torrent-ready="!loading">
  <div class="torrent-mode"><div><span class="mode-label">TORRENTS</span><span class="mode-source">Фильмы и сериалы · TMDB</span></div><router-link to="/">Основной каталог →</router-link></div>
  <nav class="torrent-tabs" aria-label="Разделы торрент каталога">
   <router-link to="/torrents" :aria-current="home?'page':undefined">Главная</router-link>
   <router-link :to="{path:'/torrents',query:{kind:'movie',...(queryText?{q:queryText}:{})}}" :aria-current="!home&&!year&&kind==='movie'&&!route.params.id?'page':undefined">Фильмы</router-link>
   <router-link :to="{path:'/torrents',query:{kind:'tv',...(queryText?{q:queryText}:{})}}" :aria-current="!home&&!year&&kind==='tv'&&!route.params.id?'page':undefined">Сериалы</router-link>
   <router-link :to="`/torrents?kind=movie&year=${NEW_RELEASE_YEAR}`" :aria-current="year===String(NEW_RELEASE_YEAR)?'page':undefined">Новинки {{ NEW_RELEASE_YEAR }}</router-link>
  </nav>
  <p class="torrent-notice"><span class="notice-dot" aria-hidden="true" /><span>Каталог TMDB · Торрент движок ещё не подключён. Карточка не гарантирует наличие раздачи.</span></p>
  <div v-if="!route.params.id" class="torrent-tools">
   <SearchBar class="page-search" placeholder="Поиск" :torrent="true" v-model="searchText" @search="search" />
   <details class="torrent-filters" :open="desktopFilters">
    <summary><SlidersHorizontal :size="16" /> Фильтры<span v-if="genre||year" class="filter-count">{{ Number(!!genre)+Number(!!year) }}</span><ChevronDown :size="16" /></summary>
    <div class="filter-fields">
     <label>Тип контента<span class="select-wrap"><select :value="kind" @change="changeKind(($event.target as HTMLSelectElement).value)"><option value="movie">Фильмы</option><option value="tv">Сериалы</option></select><ChevronDown :size="16" /></span></label>
     <label>Жанр<span class="select-wrap"><select :value="queryText?'':genre" :disabled="loading||!!queryText" @change="filter('genre',($event.target as HTMLSelectElement).value)"><option value="">Все жанры</option><option v-for="g in genres" :key="g.id" :value="String(g.id)">{{g.name}}</option></select><ChevronDown :size="16" /></span></label>
     <label>Год выхода<span class="select-wrap"><select :value="year" @change="filter('year',($event.target as HTMLSelectElement).value)"><option value="">Все годы</option><option v-for="y in NEW_RELEASE_YEAR-1899" :key="y" :value="String(NEW_RELEASE_YEAR-y+1)">{{ NEW_RELEASE_YEAR-y+1 }}</option></select><ChevronDown :size="16" /></span></label>
     <router-link class="reset-filters" to="/torrents"><RotateCcw :size="16" /> Сбросить</router-link>
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
    <div><span class="mode-label">{{detail.kind==='tv'?'СЕРИАЛ':'ФИЛЬМ'}} · TMDB</span><h1>{{detail.title}}</h1><p class="original-title">{{detail.original_title}}</p><p>{{detail.year}}<span v-if="detail.rating"> · ★ {{detail.rating.toFixed(1)}}</span><span v-if="detail.runtime"> · {{detail.runtime}} мин</span><span v-if="detail.seasons"> · Сезонов: {{detail.seasons}}</span><span v-if="detail.episodes"> · Эпизодов: {{detail.episodes}}</span></p><div class="detail-genres"><router-link v-for="g in detail.genres" :key="g.id" :to="{path:'/torrents',query:{kind:detail.kind,genre:String(g.id)}}">{{g.name}}</router-link></div><p class="overview">{{detail.overview||'Описание на русском языке пока недоступно.'}}</p><div class="playback-pending"><h2>Торрент воспроизведение ещё не подключено</h2><p>Здесь появятся доступные раздачи и выбор источника. Сейчас можно изучить описание и продолжить поиск в каталоге.</p><router-link :to="`/torrents?kind=${detail.kind}`">Продолжить выбор →</router-link></div></div>
   </section>
  </template>
  <template v-else-if="home">
   <h1 class="sr-only">Торренты · фильмы и сериалы TMDB</h1>
   <section v-if="hero" class="torrent-hero" :data-hero-id="hero.tmdb_id"><img v-if="hero.backdrop" :key="hero.backdrop" :src="hero.backdrop" alt="" fetchpriority="high" width="1280" height="720" /><div class="hero-shade" /><div class="hero-copy"><span class="mode-label">СЕГОДНЯ В ФОКУСЕ · TMDB</span><h2>{{hero.title}}</h2><div class="hero-meta"><span>{{hero.year}}</span><span v-if="hero.rating">★ {{hero.rating.toFixed(1)}}</span><span>Фильм</span></div><p>{{hero.overview||'Откройте историю, к которой хочется вернуться.'}}</p><router-link :to="{path:torrentPath(hero),query:route.query}">О фильме <ArrowRight :size="18" /></router-link></div><span class="hero-schedule">Новая история каждые 4 часа</span></section>
   <section v-for="rail in rails" :key="rail.title" class="torrent-rail"><div class="rail-heading"><h2>{{rail.title}}</h2><router-link :to="{path:'/torrents',query:rail.query}">Смотреть все →</router-link></div><div class="rail-items torrent-grid"><TorrentCard v-for="entry in rail.items.slice(0,6)" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry" /></div></section>
  </template>
  <section v-else-if="data" class="torrent-results">
   <div class="results-heading"><h1>{{title}}</h1><p>В каталоге TMDB: {{data.total.toLocaleString('ru-RU')}}. Не количество доступных раздач.</p></div>
   <div v-if="data.items.length" class="torrent-grid"><TorrentCard v-for="entry in data.items" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry" /></div>
   <div v-else class="torrent-state"><h2>По этим фильтрам ничего не найдено</h2><p>Выберите другой жанр или год выхода.</p><router-link to="/torrents">Сбросить фильтры</router-link></div>
   <nav v-if="data.total_pages>1" class="torrent-pagination" aria-label="Страницы каталога TMDB"><button :disabled="page<=1" @click="paginate(page-1)">← Назад</button><span>{{page}} / {{data.total_pages}}</span><button :disabled="page>=data.total_pages" @click="paginate(page+1)">Далее →</button></nav>
   <p v-if="data.total_pages===500" class="pagination-note">TMDB позволяет просмотреть первые 500 страниц. Уточните жанр или год, чтобы сузить выбор.</p>
  </section>
  <footer class="tmdb-credit"><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="/tmdb-logo.svg" width="100" height="14" alt="TMDB" /> Метаданные и изображения ↗</a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer>
 </div>
</template>
<style scoped>
.torrent-page{max-width:var(--page-frame-max);margin:0 auto;padding:var(--page-frame-top) var(--page-frame-gutter) 64px;box-sizing:border-box;width:100%;color:var(--ui-text,#fff)}.torrent-mode{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}.torrent-mode>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.mode-label{color:#9ce8d7;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em}.torrent-mode .mode-label{border:1px solid #527d73;border-radius:8px;padding:8px 12px;background:#181818}.mode-source,.torrent-notice{font-size:14px;line-height:20px;color:var(--ui-text-muted,#bbb)}a{color:inherit}.torrent-mode>a,.rail-heading>a{font-size:14px;line-height:20px;color:#9ce8d7;text-decoration:none}.torrent-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.torrent-tabs a,.reset-filters,.torrent-pagination button,.torrent-state button{padding:12px 16px;border:1px solid var(--ui-border);border-radius:8px;background:#181818;color:inherit;text-decoration:none;min-height:44px;box-sizing:border-box;font-size:14px;line-height:20px;font-weight:600}.torrent-tabs a[aria-current=page]{background:#9ce8d7;color:#181818;border-color:#9ce8d7}.torrent-notice{border:1px solid var(--ui-border);border-radius:12px;background:#181818;padding:16px;margin:0 0 24px;text-wrap:pretty}.torrent-notice strong{color:#e6f7f2;font-weight:600}.torrent-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:16px;align-items:end;margin-bottom:24px}.torrent-filters label{display:grid;gap:8px;font-size:14px;line-height:20px;color:var(--ui-text-muted,#bbb)}.torrent-filters select{width:100%;min-width:0;min-height:44px;background:#181818;color:#fff;border:1px solid var(--ui-border);border-radius:8px;padding:12px;font:inherit}.torrent-hero{position:relative;overflow:hidden;border-radius:16px;background:#181818;margin-bottom:40px;min-height:400px;display:grid;grid-template-columns:1fr 1fr}.torrent-hero>img{position:absolute;right:0;top:0;width:58%;height:100%;object-fit:cover;opacity:.6}.hero-copy{position:relative;padding:48px 32px;background:#181818;box-shadow:24px 0 48px 24px #181818}.hero-copy h2{font-size:36px;line-height:40px;font-weight:600;margin:16px 0;max-width:680px;text-wrap:balance}.hero-copy p{font-size:16px;line-height:24px;color:#ccc;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.hero-copy>a,.playback-pending>a{display:inline-block;background:#9ce8d7;color:#181818;padding:12px 16px;border-radius:8px;text-decoration:none;font-size:16px;line-height:24px;font-weight:600}.rail-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 16px}.rail-heading h2,.playback-pending h2{font-size:20px;line-height:28px;font-weight:600;margin:0}.torrent-rail{margin-bottom:40px}.rail-items{padding:4px 0}.torrent-grid,.torrent-loading{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:24px 16px}.torrent-skeleton{aspect-ratio:2/3;border-radius:12px;background:#1f1f1f}.results-heading{margin:24px 0}.results-heading h1,.torrent-detail h1,.torrent-state h1{font-size:30px;line-height:36px;font-weight:600;margin:0 0 12px;text-wrap:balance}.results-heading p,.pagination-note{font-size:14px;line-height:20px;color:#bbb}.torrent-pagination{display:flex;justify-content:center;align-items:center;gap:16px;margin-top:32px}.torrent-pagination button{cursor:pointer}.torrent-pagination button:disabled{opacity:.4;cursor:default}.pagination-note{text-align:center}.torrent-state{padding:48px 24px;text-align:center;border:1px solid var(--ui-border);border-radius:12px}.torrent-state p{font-size:16px;line-height:24px;color:#bbb}.torrent-state button{cursor:pointer}.tmdb-credit img{vertical-align:middle;margin-right:12px;max-width:100px}.tmdb-credit{margin-top:48px;padding-top:24px;color:#bbb;font-size:12px;line-height:16px}.tmdb-credit p{margin:8px 0}.back-link{display:inline-block;margin:0 0 24px;text-decoration:none}.torrent-detail{display:grid;grid-template-columns:minmax(180px,280px) minmax(0,1fr);gap:32px}.torrent-detail>img{width:100%;height:auto;border-radius:12px}.torrent-detail h1{margin-top:16px}.torrent-detail p{font-size:16px;line-height:24px}.original-title{color:#bbb}.detail-genres{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.detail-genres a{border:1px solid var(--ui-border);padding:8px 12px;border-radius:8px;text-decoration:none;font-size:14px;line-height:20px}.overview{max-width:680px;text-wrap:pretty}.playback-pending{padding:24px;margin-top:32px;background:#181818;border:1px solid #527d73;border-radius:12px}.playback-pending p{color:#bbb}a:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid #9ce8d7;outline-offset:4px}
@media(max-width:1100px){.torrent-grid,.torrent-loading{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:767px){.torrent-filters{grid-template-columns:1fr 1fr;gap:12px}.reset-filters{align-self:end;text-align:center}.torrent-grid,.torrent-loading{grid-template-columns:repeat(2,minmax(0,1fr))}.torrent-mode{gap:12px}.torrent-mode>div{gap:8px}.torrent-tabs a{flex:1;text-align:center;white-space:nowrap}.torrent-hero{display:flex;flex-direction:column;min-height:0}.torrent-hero>img{position:relative;width:100%;height:auto;aspect-ratio:16/9;opacity:.85}.hero-copy{padding:24px;box-shadow:none}.hero-copy h2{font-size:24px;line-height:32px;margin:12px 0}.rail-heading{align-items:flex-start}.rail-heading h2{font-size:18px;line-height:28px}.rail-heading>a{white-space:nowrap}.torrent-detail{grid-template-columns:1fr;gap:24px}.torrent-detail>img{width:160px;height:240px;object-fit:cover}.results-heading h1,.torrent-detail h1{font-size:24px;line-height:32px}.mode-source{font-size:12px;line-height:16px}}

/* Same frame, typography and controls as the main catalogue; only mode accents differ. */
.torrent-page{--ui-link:#9ce8d7;--torrent-accent:#9ce8d7;--torrent-gold:#f4d45e;min-width:0}
.torrent-mode{margin-bottom:16px}.torrent-mode .mode-label{padding:4px 8px;background:var(--ui-surface);border-color:#416459}
.torrent-tabs{margin-bottom:16px}.torrent-tabs a{background:var(--ui-surface);border-radius:var(--ui-radius);padding:10px 16px;display:flex;align-items:center;justify-content:center}
.torrent-tabs a[aria-current=page]{background:#213a34;color:#b8f4e5;border-color:#55897a}
.torrent-notice{display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:16px;background:var(--ui-surface);border-radius:var(--ui-radius);font-size:12px;line-height:18px}
.notice-dot{width:6px;height:6px;flex:none;background:var(--torrent-gold);border-radius:50%}
.torrent-tools{margin-bottom:24px}.page-search{display:none}.torrent-filters{margin:0;display:block}.torrent-filters>summary{display:none}
.filter-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:12px;align-items:end}
.filter-fields label{display:grid;gap:6px;min-width:0;font-size:12px;line-height:16px;color:var(--ui-secondary)}
.select-wrap{position:relative;display:flex;align-items:center;min-width:0}.select-wrap>svg{position:absolute;right:12px;pointer-events:none;color:var(--ui-muted)}
.torrent-filters select{appearance:none;min-height:44px;padding:10px 36px 10px 14px;border-color:var(--ui-control);border-radius:var(--ui-radius);background:var(--ui-surface);font-size:14px;line-height:20px;color:var(--ui-text);transition:border-color .15s}
.torrent-filters select:hover:not(:disabled){border-color:#6b998d}.torrent-filters select:disabled{opacity:.5;cursor:not-allowed}.reset-filters{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;font-weight:500;background:var(--ui-surface);border-color:var(--ui-control);border-radius:var(--ui-radius)}
.search-context{font-size:12px;line-height:20px;color:var(--ui-secondary);margin:0 0 24px}.search-context button{margin-left:8px;color:var(--ui-link);background:none;border:0;text-decoration:underline;cursor:pointer}
.torrent-hero{display:flex;align-items:center;min-height:420px;background:var(--ui-surface);border-radius:var(--ui-radius-panel);isolation:isolate}
.torrent-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 30%;opacity:1;z-index:-2}
.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,12,14,.96),rgba(7,12,14,.7) 42%,rgba(7,12,14,.08) 80%),linear-gradient(0deg,rgba(7,12,14,.45),transparent 60%);z-index:-1}
.hero-copy{padding:48px 40px;box-shadow:none;background:none;max-width:660px}.hero-copy h2{font-size:40px;line-height:44px;margin:12px 0 16px}.hero-meta{display:flex;gap:12px;font-size:14px;line-height:20px;color:var(--ui-secondary)}.hero-meta span:nth-child(2){color:var(--torrent-gold)}
.hero-copy p{margin:16px 0 24px;color:#d4d8d7}.hero-copy>a{display:inline-flex;align-items:center;gap:16px;background:var(--torrent-gold);font-size:14px;line-height:20px;padding:12px 18px;border-radius:var(--ui-radius)}
.hero-copy>a:hover{background:#9ce8d7}.hero-schedule{position:absolute;bottom:20px;right:24px;font-size:12px;line-height:16px;color:#dbdfde}
.torrent-rail{margin-bottom:40px}.torrent-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:24px var(--poster-gap,16px)}.rail-heading h2{font-size:24px;line-height:32px}.torrent-page :deep(.torrent-poster){border-radius:var(--ui-radius)}
@media(max-width:1100px){.torrent-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.rail-items>*:nth-child(n+5){display:none}}
@media(max-width:767px){
 .torrent-mode{gap:8px}.torrent-mode .mode-source{display:none}.torrent-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.torrent-tabs a{font-size:12px;line-height:16px;padding:8px 4px;min-width:0;min-height:44px;white-space:normal}
 .torrent-notice{font-size:12px;line-height:18px;align-items:flex-start}.notice-dot{margin-top:6px}
 .torrent-tools{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin-bottom:20px}.page-search{display:flex;flex:1;min-width:0}.torrent-filters{display:contents}
 .torrent-filters>summary{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:10px 12px;cursor:pointer;border:1px solid var(--ui-control);border-radius:var(--ui-radius);font-size:12px;background:var(--ui-surface);list-style:none}.torrent-filters>summary::-webkit-details-marker{display:none}.torrent-filters>summary>svg:last-child{display:none}.filter-count{color:#9ce8d7}
 .filter-fields{display:none;flex-basis:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.torrent-filters[open] .filter-fields{display:grid}
 .torrent-hero{min-height:380px;display:flex;justify-content:flex-end;flex-direction:column;align-items:stretch}.torrent-hero>img{position:absolute;width:100%;height:100%;aspect-ratio:auto;object-position:65% center}
 .hero-shade{background:linear-gradient(0deg,rgba(7,12,14,.98),rgba(7,12,14,.8) 40%,rgba(7,12,14,.03) 90%)}.hero-copy{padding:110px 24px 48px}.hero-copy .mode-label{font-size:10px}.hero-copy h2{font-size:28px;line-height:32px;margin:8px 0 12px}.hero-copy p{-webkit-line-clamp:2;font-size:14px;line-height:20px;margin:12px 0 20px}.hero-schedule{bottom:16px;left:24px;right:auto;font-size:10px}.hero-meta{font-size:12px;line-height:16px}
 .torrent-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 16px}.rail-items>*:nth-child(n+5){display:none}.rail-heading h2{font-size:20px;line-height:28px}.rail-heading>a{font-size:12px;line-height:20px}.torrent-mode>a{font-size:12px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.page-search :deep(.search-dropdown){min-width:0;left:0!important;right:auto;width:min(340px,calc(100vw - 32px));max-width:calc(100vw - 32px)}
</style>
