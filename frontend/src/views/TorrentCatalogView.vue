<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { torrentsApi, torrentPath, type TorrentItem, type TorrentPage, type TorrentKind, type TorrentPerson } from '@/api/torrents'
import { SlidersHorizontal, RotateCcw, ChevronDown, ArrowLeft, ArrowRight, Play } from 'lucide-vue-next'
import LibraryButton from '@/components/LibraryButton.vue'
import TorrentCard from '@/components/TorrentCard.vue'
import TorrentPlayer from '@/components/TorrentPlayer.vue'
import TorrentWatchPanel from '@/components/TorrentWatchPanel.vue'
import TorrentPosterStatus from '@/components/TorrentPosterStatus.vue'
import { useTorrentWatch } from '@/composables/useTorrentWatch'
import { useAuthStore } from '@/stores/auth'
import { NEW_RELEASE_YEAR } from '@/router/catalogSections'
import { formatBudget, formatClock, formatDate, plural } from '@/utils/ruFormat'
const route=useRoute(),router=useRouter()
const kind=computed<TorrentKind>(()=>route.query.kind==='tv'?'tv':'movie')
const page=computed(()=>Math.min(500,Math.max(1,Number.parseInt(String(route.query.page||'1'),10)||1)))
const genre=computed(()=>/^\d+$/.test(String(route.query.genre||''))?String(route.query.genre):'')
const year=computed(()=>/^\d{4}$/.test(String(route.query.year||''))?String(route.query.year):'')
const rating=computed(()=>/^(?:[0-9](?:\.[0-9])?|10)$/.test(String(route.query.rating||''))?String(route.query.rating):'')
const ratingOptions=computed(()=>[...new Set([10,9,8,7,6,5,4,3,2,1,0,...(rating.value?[Number(rating.value)]:[])])].sort((a,b)=>b-a))
const queryText=computed(()=>String(route.query.q||'').trim().slice(0,120))
const home=computed(()=>!route.params.id&&!['kind','genre','year','rating','page','q'].some(k=>route.query[k]))
const loading=ref(true),error=ref(''),data=ref<TorrentPage|null>(null),detail=ref<TorrentItem|null>(null)
const auth=useAuthStore()
let accessGeneration=0
const playbackAccess=ref<boolean|null>(null),accessError=ref(false)
const watchState=useTorrentWatch(detail,playbackAccess)
const player=ref<InstanceType<typeof TorrentPlayer>|null>(null)
function playInBrowser(){void player.value?.playInBrowser()}
/** Title page of the reference layout: «2004–2012, США», «Доктор Хаус», «Уже лучше?», «8.6 TMDB · Завершён», «8 сезонов · 176 серий • Драма | Детектив». */
const titleMeta=computed(()=>{
 const d=detail.value;if(!d)return ''
 const years=d.year?(d.kind==='tv'&&d.end_year&&d.end_year>d.year?`${d.year}–${d.end_year}`:String(d.year)):''
 return [years,...(d.countries??[]).slice(0,2)].filter(Boolean).join(', ')
})
/** The original title is the heading tooltip: the reference keeps the heading block to title + tagline. */
const otherTitle=computed(()=>{
 const d=detail.value,original=(d?.original_title||'').trim()
 return d&&original&&original.toLocaleLowerCase()!==d.title.trim().toLocaleLowerCase()?original:''
})
const titleTagline=computed(()=>{const tagline=(detail.value?.tagline||'').trim();return tagline?`«${tagline}»`:''})
/** TMDB lifecycle badge; a released film needs none. */
const STATUS_LABELS:Record<string,string>={Ended:'Завершён',Canceled:'Закрыт','Returning Series':'Продолжается','In Production':'В производстве','Post Production':'Постпродакшн',Planned:'Запланирован',Rumored:'Анонсирован',Pilot:'Пилот'}
const statusBadge=computed(()=>STATUS_LABELS[detail.value?.status??'']??'')
const lengthFact=computed(()=>{
 const d=detail.value;if(!d)return ''
 if(d.kind==='tv')return [d.seasons?`${d.seasons} ${plural(d.seasons,'сезон','сезона','сезонов')}`:'',d.episodes?`${d.episodes} ${plural(d.episodes,'серия','серии','серий')}`:''].filter(Boolean).join(' · ')
 return formatClock(d.runtime)
})
const genreName=(name:string)=>name.slice(0,1).toLocaleUpperCase('ru-RU')+name.slice(1)
/** «Релиз: 19.09.2005», up to three studios and «Бюджет: $120M» (films) under the overview. */
const titleChips=computed(()=>{
 const d=detail.value;if(!d)return []
 const released=formatDate(d.release_date),budget=d.kind==='movie'?formatBudget(d.budget):''
 return [released?`Релиз: ${released}`:'',...(d.studios??[]).slice(0,3),budget?`Бюджет: ${budget}`:''].filter(Boolean)
})
/** Director (series creator) cards; older API answers only carry the names. */
const directorCards=computed<TorrentPerson[]>(()=>{
 const d=detail.value;if(!d)return []
 const people=(d.director_list??[]).filter(p=>p&&typeof p.name==='string'&&p.name.trim())
 return (people.length?people:(d.directors??[]).map(name=>({name,photo:null}))).slice(0,4)
})
const directorRole=computed(()=>detail.value?.kind==='tv'?'Создатель':'Режиссёр')
const directorHeading=computed(()=>directorCards.value.length>1?(detail.value?.kind==='tv'?'Создатели':'Режиссёры'):directorRole.value)
const backLink=computed(()=>({path:'/torrents',query:Object.keys(route.query).length?route.query:{kind:detail.value?.kind??'movie'}}))
const backHref=computed(()=>router.resolve(backLink.value).href)
/** «← Назад» returns to the page the title was opened from; a shared link falls back to its catalogue. */
function goBack(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
 event.preventDefault()
 if(router.options.history.state?.back)router.back()
 else void router.push(backLink.value)
}
const stripTargets=new WeakMap<HTMLElement,{left:number;at:number}>()
/** People strips scroll sideways with an ordinary mouse wheel; at either end the page scrolls on. */
function stripWheel(event:WheelEvent){
 const strip=event.currentTarget as HTMLElement
 if(event.ctrlKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return
 const max=strip.scrollWidth-strip.clientWidth
 if(max<=0)return
 const step=event.deltaY*(event.deltaMode===1?32:event.deltaMode===2?strip.clientWidth:1)
 const last=stripTargets.get(strip),now=Date.now()
 const from=last&&now-last.at<450?last.left:strip.scrollLeft
 const left=Math.max(0,Math.min(max,from+step))
 if(Math.abs(left-from)<1)return
 event.preventDefault()
 stripTargets.set(strip,{left,at:now})
 strip.scrollTo({left,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'})
}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase()}
async function loadAccess(version:number,signal:AbortSignal){
 const check=++accessGeneration
 playbackAccess.value=null;accessError.value=false
 try{const result=await torrentsApi.access(signal);if(version===generation&&check===accessGeneration)playbackAccess.value=result.allowed}
 catch{if(version===generation&&check===accessGeneration&&!signal.aborted)accessError.value=true}
}
const rails=ref<{title:string;items:TorrentItem[];query:Record<string,string>}[]>([])
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
 loading.value=true;error.value='';data.value=null;detail.value=null;rails.value=[];playbackAccess.value=null;accessError.value=false
 try{
  if(route.params.id){
   const detailKind=String(route.params.kind)
   if(!['movie','tv'].includes(detailKind)||!/^\d+$/.test(String(route.params.id)))throw new Error('invalid')
   const result=await torrentsApi.detail(detailKind as TorrentKind,String(route.params.id),signal)
   if(version===generation){detail.value=result;void loadAccess(version,signal)}
  }else if(home.value){
   const results=await Promise.all([torrentsApi.list({kind:'movie'},signal),torrentsApi.list({kind:'movie',year:String(NEW_RELEASE_YEAR)},signal),torrentsApi.list({kind:'tv'},signal)])
   if(version!==generation)return
   // Hero loading is independent: unavailable artwork never blocks the catalogue.
   void refreshHero(version,signal)
   rails.value=[{title:'Популярное',items:results[0].items,query:{kind:'movie'}},{title:`Новинки ${NEW_RELEASE_YEAR}`,items:results[1].items,query:{kind:'movie',year:String(NEW_RELEASE_YEAR)}},{title:'Сериалы',items:results[2].items,query:{kind:'tv'}}]
  }else{
   const result=await torrentsApi.list({kind:kind.value,page:page.value,genre:queryText.value?'':genre.value,year:year.value,...(!queryText.value&&rating.value?{rating:rating.value}:{}),...(queryText.value?{q:queryText.value}:{})},signal)
   if(version!==generation)return
   data.value=result
  }
 }catch(e){if(version===generation&&!(e instanceof Error&&e.name==='AbortError'))error.value='Не удалось загрузить каталог TMDB. Проверьте подключение или повторите попытку.'}
 finally{if(version===generation)loading.value=false}
}
function filter(name:string,value:string){const query:LocationQueryRaw={...route.query,kind:kind.value};delete query.page;if(value)query[name]=value;else delete query[name];router.push({path:'/torrents',query})}
function search(value:string){const q=value.trim().slice(0,120);router.push({path:'/torrents',query:{kind:kind.value,...(q?{q}:{}),...(year.value?{year:year.value}:{})}})}
function resetFilters(){const query:LocationQueryRaw={...route.query};delete query.year;delete query.rating;delete query.page;router.push({path:'/torrents',query})}
function paginate(value:number){router.push({path:'/torrents',query:{...route.query,kind:kind.value,page:String(value)}})}
watch(()=>route.fullPath,load,{immediate:true})
watch(()=>auth.token.value,()=>{if(detail.value&&controller)void loadAccess(generation,controller.signal)})
function retryAccess(){if(controller)void loadAccess(generation,controller.signal)}
onBeforeUnmount(()=>{++generation;controller?.abort();clearTimeout(heroTimer)})
</script>
<template>
 <div class="torrent-page" :class="{'torrent-home':home,'torrent-title':!!detail}" :data-torrent-ready="!loading">
  <div v-if="!route.params.id&&!home" class="torrent-tools">
   <details class="torrent-filters">
    <summary><SlidersHorizontal :size="18" aria-hidden="true" /><span>Фильтры</span><span v-if="year||(!queryText&&rating)" class="filter-count">{{ Number(!!year)+Number(!queryText&&!!rating) }}</span><ChevronDown :size="16" class="filter-chevron" aria-hidden="true" /></summary>
    <div class="filter-panel">
     <div class="filter-fields">
      <label for="torrent-year">Год<span class="select-wrap"><select id="torrent-year" :value="year" @change="filter('year',($event.target as HTMLSelectElement).value)"><option value="">Все годы</option><option v-for="y in NEW_RELEASE_YEAR-1899" :key="y" :value="String(NEW_RELEASE_YEAR-y+1)">{{ NEW_RELEASE_YEAR-y+1 }}</option></select><ChevronDown :size="16" aria-hidden="true" /></span></label>
      <label for="torrent-rating">Рейтинг TMDB<span class="select-wrap"><select id="torrent-rating" :value="queryText?'':rating" :disabled="!!queryText" :aria-describedby="queryText?'torrent-rating-help':undefined" @change="filter('rating',($event.target as HTMLSelectElement).value)"><option value="">Любой рейтинг</option><option v-for="r in ratingOptions" :key="r" :value="String(r)">От {{r}} ★</option></select><ChevronDown :size="16" aria-hidden="true" /></span></label>
     </div>
     <p v-if="queryText" id="torrent-rating-help" class="filter-help">TMDB не поддерживает рейтинг в поиске по названию. Очистите поиск, чтобы применить рейтинг.</p>
     <button v-if="year||rating" type="button" class="reset-filters" @click="resetFilters"><RotateCcw :size="16" aria-hidden="true" /> Сбросить фильтры</button>
    </div>
   </details>
   <span v-if="year||(!queryText&&rating)" class="filter-applied" aria-live="polite">{{[year,rating&&!queryText?`Рейтинг от ${rating}`:''].filter(Boolean).join(' · ')}}</span>
  </div>
  <p v-if="queryText" class="search-context">Поиск по названию — {{kind==='tv'?'сериалы':'фильмы'}}. Можно уточнить год; рейтинг в этом режиме не применяется.<button @click="search('')">Очистить поиск</button></p>
  <div v-if="loading" class="torrent-loading" role="status" aria-label="Загрузка каталога TMDB"><span class="sr-only">Загрузка каталога TMDB</span><div v-for="n in 6" :key="n" class="torrent-skeleton" /></div>
  <section v-else-if="error" class="torrent-state" role="alert"><h1>Каталог временно недоступен</h1><p>{{error}}</p><button @click="load">Повторить попытку</button></section>
  <template v-else-if="detail">
   <div v-if="detail.backdrop" class="title-backdrop" aria-hidden="true"><img :src="detail.backdrop" alt="" width="1280" height="720" fetchpriority="high" /></div>
   <div class="title-inner" data-testid="title-hero">
    <div class="title-topbar"><a class="back-link" :href="backHref" @click="goBack"><ArrowLeft :size="15" aria-hidden="true" />Назад</a></div>
    <div class="torrent-detail">
     <aside class="poster-col">
      <div class="detail-poster"><img v-if="detail.poster" :src="detail.poster" :alt="`Постер «${detail.title}»`" width="342" height="513" /><span v-else class="poster-empty" aria-hidden="true">{{initials(detail.title)}}</span></div>
      <TorrentPosterStatus :state="watchState" />
     </aside>
     <div class="detail-info">
      <p v-if="titleMeta" class="title-meta">{{titleMeta}}</p>
      <h1 :title="otherTitle||undefined">{{detail.title}}</h1>
      <p v-if="titleTagline" class="title-tagline">{{titleTagline}}</p>
      <div v-if="detail.rating||statusBadge" class="title-badges"><span v-if="detail.rating" class="title-score">{{detail.rating.toFixed(1)}}<span class="source-label">TMDB</span></span><span v-if="statusBadge" class="title-status">{{statusBadge}}</span></div>
      <p v-if="lengthFact||detail.genres?.length" class="title-facts"><span v-if="lengthFact" class="title-length">{{lengthFact}}</span><span v-if="lengthFact&&detail.genres?.length" class="title-dot" aria-hidden="true">•</span><template v-for="(g,i) in detail.genres" :key="g.id"><span v-if="i" class="title-sep" aria-hidden="true">|</span><router-link class="title-genre" :to="{path:'/torrents',query:{kind:detail.kind,genre:String(g.id)}}">{{genreName(g.name)}}</router-link></template></p>
      <TorrentWatchPanel :item="detail" :state="watchState" @browser="playInBrowser" />
     </div>
    </div>
    <div class="title-details">
     <TorrentPlayer ref="player" :access="playbackAccess" :access-error="accessError" :poster="detail.backdrop||detail.poster||undefined" :kind="detail.kind" :tmdb-id="detail.tmdb_id" :torrent-status="watchState.view?.status.status" :ready="watchState.action==='launch'" :choice="watchState.choice" :source-title="watchState.selected?.title" :launch-busy="watchState.busy==='launch'" :launch-message="watchState.message" :launch-error="watchState.error" @retry="retryAccess" @desktop="watchState.launch()" />
     <section class="title-block" aria-labelledby="title-about-heading"><h2 id="title-about-heading">{{detail.kind==='tv'?'О сериале':'О фильме'}}</h2><p class="overview">{{detail.overview||'Описание на русском языке пока недоступно.'}}</p><ul v-if="titleChips.length" class="title-chips" data-testid="title-chips"><li v-for="c in titleChips" :key="c" class="title-chip">{{c}}</li></ul></section>
     <section v-if="directorCards.length" class="title-block" aria-labelledby="title-directors-heading"><h2 id="title-directors-heading">{{directorHeading}}</h2><ul class="title-people" data-testid="title-directors" @wheel="stripWheel"><li v-for="p in directorCards" :key="p.name" class="person"><img v-if="p.photo" :src="p.photo" alt="" width="88" height="88" loading="lazy" /><span v-else class="person-ph" aria-hidden="true">{{initials(p.name)}}</span><span class="person-text"><b>{{p.name}}</b><span>{{directorRole}}</span></span></li></ul></section>
     <section v-if="detail.cast?.length" class="title-block" aria-labelledby="title-cast-heading"><h2 id="title-cast-heading">В ролях</h2><ul class="title-people" data-testid="title-cast" @wheel="stripWheel"><li v-for="p in detail.cast" :key="`${p.name}-${p.character}`" class="person"><img v-if="p.photo" :src="p.photo" alt="" width="88" height="88" loading="lazy" /><span v-else class="person-ph" aria-hidden="true">{{initials(p.name)}}</span><span class="person-text"><b>{{p.name}}</b><span v-if="p.character">{{p.character}}</span></span></li></ul></section>
    </div>
   </div>
  </template>
  <template v-else-if="home">
   <h1 class="sr-only">Торренты · фильмы и сериалы TMDB</h1>
   <section v-if="hero" class="torrent-hero" :data-hero-id="hero.tmdb_id"><img v-if="hero.backdrop" :key="hero.backdrop" :src="hero.backdrop" alt="" fetchpriority="high" width="1280" height="720" /><div class="hero-shade" /><div class="hero-copy"><span class="mode-label">СЕГОДНЯ В ФОКУСЕ · ФИЛЬМ</span><img class="hero-tmdb" src="/tmdb-logo.svg" alt="TMDB" width="70" height="10" /><h2>{{hero.title}}</h2><div class="hero-meta"><span>{{hero.year}}</span><span v-if="hero.rating">★ {{hero.rating.toFixed(1)}}</span><span>Фильм</span></div><p>{{hero.overview||'Откройте историю, к которой хочется вернуться.'}}</p><div class="hero-actions"><router-link :to="{path:torrentPath(hero),query:route.query}"><Play :size="18" fill="currentColor" /> Смотреть <ArrowRight :size="18" /></router-link><LibraryButton :item="hero" /></div></div><span class="hero-schedule">Новая история каждые 4 часа</span></section>
   <section v-for="rail in rails" :key="rail.title" class="torrent-rail"><div class="rail-heading"><h2>{{rail.title}}</h2><router-link :to="{path:'/torrents',query:rail.query}">Смотреть все →</router-link></div><div class="rail-items torrent-grid"><TorrentCard v-for="entry in rail.items.slice(0,6)" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry"  /></div></section>
  </template>
  <section v-else-if="data" class="torrent-results">
   <div class="results-heading"><h1>{{title}}</h1><p>В каталоге TMDB: {{data.total.toLocaleString('ru-RU')}}. Не количество доступных раздач.</p></div>
   <div v-if="data.items.length" class="torrent-grid"><TorrentCard v-for="entry in data.items" :key="`${entry.kind}-${entry.tmdb_id}`" :item="entry" /></div>
   <div v-else class="torrent-state"><h2>По этим фильтрам ничего не найдено</h2><p>Измените год или минимальный рейтинг.</p><button @click="resetFilters">Сбросить фильтры</button></div>
   <nav v-if="data.total_pages>1" class="torrent-pagination" aria-label="Страницы каталога TMDB"><button :disabled="page<=1" @click="paginate(page-1)">← Назад</button><span>{{page}} / {{data.total_pages}}</span><button :disabled="page>=data.total_pages" @click="paginate(page+1)">Далее →</button></nav>
   <p v-if="data.total_pages===500" class="pagination-note">TMDB позволяет просмотреть первые 500 страниц. Уточните год или рейтинг, чтобы сузить выбор.</p>
  </section>
  <footer class="tmdb-credit"><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="/tmdb-logo.svg" width="100" height="14" alt="TMDB" /> Метаданные и изображения ↗</a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer>
 </div>
</template>
<style scoped>
.torrent-page{--ease:cubic-bezier(.22,1,.36,1);--ui-link:#9ce8d7;--torrent-accent:#9ce8d7;--torrent-gold:#f4d45e;max-width:var(--page-frame-max);margin:0 auto;padding:24px var(--page-frame-gutter) 64px;box-sizing:border-box;width:100%;min-width:0;color:var(--ui-text,#fff)}a{color:inherit}.torrent-home{max-width:none;padding:0 0 48px}.mode-label{color:#9ce8d7;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em}
.torrent-hero{position:relative;overflow:hidden;min-height:420px;display:flex;align-items:center;isolation:isolate;margin-bottom:32px;background:#0a1012}.torrent-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 35%;z-index:-2}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,12,14,.92),rgba(7,12,14,.62) 40%,rgba(7,12,14,.04) 80%),linear-gradient(0deg,rgba(7,12,14,.65),transparent 65%);z-index:-1}.hero-copy{width:100%;max-width:var(--page-frame-max);margin:0 auto;padding:48px var(--page-frame-gutter);box-sizing:border-box}.hero-copy h2{font-size:48px;line-height:1;font-weight:600;max-width:680px;margin:16px 0 24px;text-wrap:balance}.hero-copy p{max-width:640px;font-size:16px;line-height:24px;color:#d4d8d7;margin:24px 0 32px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-wrap:pretty}.hero-meta{display:flex;gap:16px;font-size:14px;line-height:20px;color:#c4c8c7}.hero-meta span:nth-child(2){color:var(--torrent-gold)}.hero-actions>a,.playback-pending>a{display:inline-flex;align-items:center;gap:16px;background:var(--torrent-gold);color:#141414;font-size:16px;line-height:24px;font-weight:600;padding:12px 16px;border-radius:12px;text-decoration:none;transition:background 300ms cubic-bezier(.22,1,.36,1)}.hero-actions>a:hover{background:#9ce8d7}.hero-schedule{position:absolute;bottom:24px;right:max(var(--page-frame-gutter),calc((100% - var(--page-frame-max))/2 + var(--page-frame-gutter)));font-size:12px;line-height:16px;color:#c9d0cc}
.torrent-rail{max-width:var(--page-frame-max);margin:0 auto 40px;padding:0 var(--page-frame-gutter);box-sizing:border-box}.rail-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 24px}.rail-heading h2{display:flex;align-items:center;gap:12px;font-size:24px;line-height:32px;font-weight:600;margin:0}.rail-heading h2:before{content:'';height:24px;width:4px;background:var(--torrent-gold);border-radius:4px}.rail-heading>a{font-size:14px;line-height:20px;color:var(--torrent-gold);text-decoration:none;white-space:nowrap}.torrent-grid,.torrent-loading{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:24px 16px}.torrent-skeleton{aspect-ratio:2/3;border-radius:12px;background:#1f1f1f}.torrent-home>.torrent-loading{max-width:var(--page-frame-max);margin:32px auto;padding:0 var(--page-frame-gutter)}
.torrent-tools{display:flex;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:24px}.torrent-filters{width:fit-content;max-width:100%}.torrent-filters>summary{display:flex;align-items:center;gap:8px;box-sizing:border-box;min-height:44px;width:fit-content;padding:10px 12px;list-style:none;cursor:pointer;border:1px solid var(--ui-control);border-radius:10px;background:var(--ui-surface);font-size:14px;line-height:20px;font-weight:600;user-select:none}.torrent-filters>summary::-webkit-details-marker{display:none}.torrent-filters>summary:hover{border-color:var(--torrent-accent)}.torrent-filters[open] .filter-chevron{transform:rotate(180deg)}.filter-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:6px;background:#9ce8d7;color:#0a1714;font-size:12px}.filter-panel{box-sizing:border-box;width:400px;max-width:100%;margin-top:8px;padding:16px;border:1px solid var(--ui-control);border-radius:12px;background:var(--ui-surface)}.filter-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.filter-fields label{display:grid;gap:8px;min-width:0;font-size:14px;line-height:20px;color:var(--ui-secondary)}.select-wrap{position:relative;display:flex;align-items:center;min-width:0}.select-wrap>svg{position:absolute;right:12px;pointer-events:none}.torrent-filters select{appearance:none;box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 36px 10px 12px;border:1px solid var(--ui-control);border-radius:8px;background:var(--ui-bg,#141414);font:inherit;font-size:14px;line-height:20px;color:var(--ui-text)}.torrent-filters select:disabled{opacity:.5;cursor:not-allowed}.filter-help{font-size:14px;line-height:20px;color:var(--ui-secondary);margin:12px 0 0}.filter-applied{font-size:14px;line-height:20px;color:var(--ui-secondary);padding:12px 0}.reset-filters,.torrent-pagination button,.torrent-state button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;min-height:44px;box-sizing:border-box;background:var(--ui-surface);color:inherit;border:1px solid var(--ui-control);border-radius:8px;text-decoration:none;font-size:14px;line-height:20px;cursor:pointer}.reset-filters{margin-top:12px;color:var(--torrent-accent)}.search-context{font-size:14px;line-height:20px;color:var(--ui-secondary);margin:0 0 24px}.search-context button{margin-left:8px;color:var(--ui-link);background:none;border:0;text-decoration:underline;cursor:pointer;min-height:44px}
.results-heading{margin:24px 0}.results-heading h1,.torrent-state h1{font-size:30px;line-height:36px;font-weight:600;margin:0 0 12px;text-wrap:balance}.results-heading p,.pagination-note{font-size:14px;line-height:20px;color:#bbb}.torrent-pagination{display:flex;justify-content:center;align-items:center;gap:16px;margin-top:32px}.torrent-pagination button:disabled{opacity:.4;cursor:default}.pagination-note{text-align:center}.torrent-state{padding:48px 24px;text-align:center;border:1px solid var(--ui-border);border-radius:12px}.torrent-state p{font-size:16px;line-height:24px;color:#bbb}.torrent-home>.torrent-state{margin:32px var(--page-frame-gutter)}.tmdb-credit{max-width:var(--page-frame-max);box-sizing:border-box;margin:48px auto 0;padding-top:24px;color:#bbb;font-size:12px;line-height:16px}.torrent-home .tmdb-credit{padding:24px var(--page-frame-gutter) 0}.tmdb-credit img{vertical-align:middle;margin-right:12px;max-width:100px}.tmdb-credit p{margin:8px 0}
.playback-pending{padding:24px;margin-top:32px;background:#181818;border:1px solid #527d73;border-radius:12px}.playback-pending h2{font-size:20px;line-height:28px;margin:0}.playback-pending p{color:#bbb}a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #9ce8d7;outline-offset:4px}
@media(max-width:1100px){.torrent-grid,.torrent-loading{grid-template-columns:repeat(4,minmax(0,1fr))}.rail-items>*:nth-child(n+5){display:none}.hero-copy h2{font-size:36px;line-height:40px}}
@media(max-width:767px){.torrent-page{padding-top:16px}.torrent-home{padding-top:0}.torrent-hero{min-height:480px;align-items:flex-end}.torrent-hero>img{object-position:65% center}.hero-shade{background:linear-gradient(0deg,rgba(7,12,14,.98),rgba(7,12,14,.75) 45%,rgba(7,12,14,.04) 95%)}.hero-copy{padding-top:160px;padding-bottom:64px}.hero-copy h2{font-size:30px;line-height:36px;margin:12px 0 16px}.hero-copy p{font-size:14px;line-height:20px;-webkit-line-clamp:3;margin:16px 0 24px}.hero-schedule{bottom:24px;left:var(--page-frame-gutter);right:auto}.hero-meta{font-size:14px;gap:12px}.torrent-grid,.torrent-loading{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}.rail-heading{margin-bottom:16px}.rail-heading h2{font-size:20px;line-height:28px}.rail-heading>a{font-size:12px}.results-heading h1{font-size:24px;line-height:32px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.hero-actions{display:flex;align-items:center;gap:20px;margin-top:24px}.hero-tmdb{display:inline-block;width:70px;height:auto;margin-left:14px;vertical-align:middle}
/* Title page of the reference layout in KINOSOTA honey: fixed backdrop with a two-way vignette, the text side blurred,
   a sticky poster with the release status, the action block and sideways-scrolling people strips. */
.torrent-title{max-width:none;padding:0 0 64px;--title-sticky:60px}
.title-backdrop{position:fixed;inset:0;z-index:0;overflow:hidden;background:#0b0f19;pointer-events:none;transform:translateZ(0);will-change:opacity;opacity:.7;-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,.9) 0%,rgba(0,0,0,.4) 55%,#000 100%),linear-gradient(to right,#000 0%,rgba(0,0,0,.85) 40%,rgba(0,0,0,.5) 70%,rgba(0,0,0,.2) 100%);-webkit-mask-composite:destination-in;mask-image:linear-gradient(to bottom,rgba(0,0,0,.9) 0%,rgba(0,0,0,.4) 55%,#000 100%),linear-gradient(to right,#000 0%,rgba(0,0,0,.85) 40%,rgba(0,0,0,.5) 70%,rgba(0,0,0,.2) 100%);mask-composite:intersect}
.title-backdrop img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 20%}
.title-inner{position:relative;z-index:1;display:flex;flex-direction:column}
.title-inner::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);-webkit-mask-image:linear-gradient(to right,transparent 0%,transparent 22%,rgba(0,0,0,.3) 30%,rgba(0,0,0,.75) 40%,rgba(0,0,0,.75) 88%,transparent 100%),linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.9) 7%,rgba(0,0,0,.9) 80%,transparent 100%);-webkit-mask-composite:destination-in;mask-image:linear-gradient(to right,transparent 0%,transparent 22%,rgba(0,0,0,.3) 30%,rgba(0,0,0,.75) 40%,rgba(0,0,0,.75) 88%,transparent 100%),linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.9) 7%,rgba(0,0,0,.9) 80%,transparent 100%);mask-composite:intersect}
.title-inner>*{position:relative;z-index:1}
.title-topbar{display:flex;align-items:center;max-width:1240px;width:100%;margin:0 auto;padding:16px 48px 0;box-sizing:border-box}
.back-link{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(9,13,20,.35);color:rgba(255,255,255,.65);font-size:13px;line-height:18px;font-weight:500;text-decoration:none;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:border-color .2s,color .2s}
.back-link:hover{border-color:rgba(255,255,255,.3);color:#fff}
.back-link:focus-visible{outline:2px solid #ffd24d;outline-offset:2px}
.torrent-detail{display:grid;grid-template-columns:340px minmax(0,1fr);gap:40px;max-width:1240px;width:100%;margin:0 auto;padding:24px 48px 40px;box-sizing:border-box}
.poster-col{position:sticky;top:var(--title-sticky);align-self:start;display:flex;flex-direction:column;gap:16px;min-width:0;padding-top:28px}
.detail-poster{aspect-ratio:2/3;border-radius:10px;overflow:hidden;background:#1a2236;box-shadow:0 24px 64px rgba(0,0,0,.85),0 4px 12px rgba(0,0,0,.6)}
.detail-poster>img{display:block;width:100%;height:100%;object-fit:cover}
.poster-empty{display:grid;place-items:center;height:100%;font-size:48px;font-weight:800;color:rgba(255,210,77,.55)}
.detail-info{display:flex;flex-direction:column;min-width:0;padding:28px 32px}
.title-meta{margin:0 0 10px;font-size:13px;line-height:18px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);text-shadow:0 1px 6px rgba(0,0,0,.8)}
.detail-info h1{margin:0;font-size:clamp(2.2rem,4vw,3.4rem);line-height:1.06;font-weight:800;letter-spacing:-.02em;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.9),0 1px 4px rgba(0,0,0,.7);text-wrap:balance;overflow-wrap:anywhere}
.title-tagline{margin:12px 0 0;font-size:1.05rem;line-height:1.4;font-style:italic;color:rgba(255,255,255,.65);text-shadow:0 1px 8px rgba(0,0,0,.8)}
.title-badges{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px}
.title-score{display:inline-flex;align-items:center;gap:6px;font-size:1.4rem;line-height:1;font-weight:700;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.source-label{padding:1px 5px;border:1px solid rgba(255,255,255,.15);border-radius:3px;font-size:10px;line-height:14px;font-weight:500;color:#7a8499;text-shadow:none}
.title-status{padding:2px 7px;border:1px solid rgba(255,255,255,.25);border-radius:4px;font-size:11px;line-height:16px;color:#9aa3b8}
.title-facts{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin:12px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.65);text-shadow:0 1px 6px rgba(0,0,0,.8)}
.title-genre{color:inherit;text-decoration:none;transition:color .2s}
.title-genre:hover{color:#ffd24d}
.title-genre:focus-visible{outline:2px solid #ffd24d;outline-offset:2px;border-radius:2px}
.title-dot,.title-sep{color:rgba(255,255,255,.35)}
.title-details{max-width:1240px;width:100%;margin:0 auto;padding:0 48px 80px;box-sizing:border-box}
.title-block{margin-top:32px}
.title-block h2{margin:0 0 16px;font-size:11px;line-height:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.35);text-shadow:0 1px 6px rgba(0,0,0,.8)}
.overview{margin:0;max-width:720px;font-size:16px;line-height:1.7;color:rgba(255,255,255,.7);text-shadow:0 1px 8px rgba(0,0,0,.8);text-wrap:pretty}
.title-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:0;list-style:none}
.title-chip{padding:4px 10px;border:1px solid rgba(255,255,255,.08);border-radius:5px;background:rgba(255,255,255,.04);font-size:12px;line-height:16px;color:#7a8499}
.title-people{display:flex;gap:20px;margin:0;padding:0 0 8px;list-style:none;overflow-x:auto;overscroll-behavior-x:contain;scroll-behavior:smooth;scrollbar-width:none;-ms-overflow-style:none}
.title-people::-webkit-scrollbar{display:none}
.person{display:flex;align-items:center;gap:20px;flex-shrink:0;padding-right:28px;border-radius:20px;background:transparent;transition:background-color .2s ease}
.person:hover{background:#fff}
.person img,.person-ph{flex:none;width:88px;height:88px;border-radius:18px;object-fit:cover;object-position:center 20%;background:#1a2236}
.person-ph{display:grid;place-items:center;font-size:22px;font-weight:800;color:#ffd24d}
.person-text{display:flex;flex-direction:column;justify-content:center;min-width:0;max-width:260px}
.person-text b{margin-bottom:6px;font-size:20px;line-height:1.25;font-weight:500;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.person-text span{font-size:15px;line-height:1.3;color:rgba(255,255,255,.65);text-shadow:0 1px 6px rgba(0,0,0,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.person:hover .person-text b{color:#000;text-shadow:none}
.person:hover .person-text span{color:#333;text-shadow:none}
.torrent-title .tmdb-credit{position:relative;z-index:1;max-width:1240px;margin:0 auto;padding:24px 48px 0;box-sizing:border-box}
@media(max-width:900px){.torrent-detail{grid-template-columns:180px minmax(0,1fr);gap:28px;padding:16px 24px 40px}.detail-info{padding:20px 0}.detail-info h1{font-size:clamp(1.6rem,5vw,2.4rem)}.title-details{padding:0 24px 48px}.title-topbar{padding:10px 24px 0}.torrent-title .tmdb-credit{padding:24px 24px 0}}
@media(max-width:640px){.poster-col{position:static;padding-top:0}.torrent-detail{grid-template-columns:minmax(0,1fr);gap:20px;padding:12px 16px 32px}.detail-poster{width:100%;max-width:160px;margin:0 auto}.detail-info{padding:0}.title-details{padding:0 16px 40px}.title-topbar{padding:8px 16px 0}.person{padding-right:16px}.person img,.person-ph{width:72px;height:72px}.person-text b{font-size:17px}.person-text span{font-size:13px}.torrent-title .tmdb-credit{padding:24px 16px 0}}
@media(prefers-reduced-motion:reduce){.title-people{scroll-behavior:auto}}
</style>
