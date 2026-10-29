<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {tr, language} from '@/i18n'
import {getHistory, historyCapacity, type HistoryItem} from '@/api/watchHistory'
import {posterUrl} from '@/utils/poster'
const grid = ref<HTMLElement|null>(null), items=ref<HistoryItem[]>([]), page=ref(1), total=ref(0), pages=ref(0)
const size=ref(1), columns=ref(1), rows=ref(1), loading=ref(true), error=ref('')
let observer:ResizeObserver|undefined, generation=0, disposed=false
const gridStyle=computed(()=>({gridTemplateColumns:`repeat(${columns.value},minmax(0,1fr))`,gridTemplateRows:`repeat(${rows.value},minmax(0,1fr))`}))
async function load() {
 const ticket=++generation;loading.value=true;error.value=''
 try {const result=await getHistory(page.value,size.value);if(disposed||ticket!==generation)return
  if(result.total_pages && page.value>result.total_pages){page.value=result.total_pages;void load();return}
  items.value=result.items;total.value=result.total;pages.value=result.total_pages
 } catch {if(ticket===generation&&!disposed)error.value=tr('Не удалось загрузить историю.','Could not load watch history.')}
 finally {if(ticket===generation&&!disposed)loading.value=false}
}
function measure(){if(!grid.value)return;const r=grid.value.getBoundingClientRect(), c=historyCapacity(r.width,r.height)
 columns.value=c.columns;rows.value=c.rows
 if(size.value!==c.size){size.value=c.size;page.value=1;void load()}
}
function move(delta:number){page.value+=delta;void load()}
function time(s:number){const n=Math.floor(s);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':')}
function date(s:string){return new Date(s).toLocaleString(language.value==='ru'?'ru-RU':'en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
onMounted(async()=>{await nextTick();measure();if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(measure);if(grid.value)observer.observe(grid.value)}window.addEventListener('resize',measure);void load()})
onBeforeUnmount(()=>{disposed=true;generation++;observer?.disconnect();window.removeEventListener('resize',measure)})
</script>
<template>
 <section id="panel-history" class="watch-history" role="tabpanel" aria-labelledby="tab-history" :aria-busy="loading">
  <p class="history-caption">{{tr('Сначала — последние просмотренные фильмы.','Your most recently watched movies first.')}} <span v-if="total">{{total}}</span></p>
  <div ref="grid" class="history-grid" :style="gridStyle">
   <div v-if="error" class="history-state" role="alert">{{error}} <button @click="load">{{tr('Повторить','Retry')}}</button></div>
   <div v-else-if="loading" class="history-state" role="status">{{tr('Загружаем историю…','Loading watch history…')}}</div>
   <div v-else-if="!items.length" class="history-state"><h2>{{tr('Здесь будут ваши фильмы','Your movies will appear here')}}</h2><p>{{tr('Начните просмотр — фильм и место остановки сохранятся автоматически.','Start watching and your movie and playback position will be saved automatically.')}}</p><router-link to="/movies">{{tr('Выбрать фильм','Find a movie')}}</router-link></div>
   <article v-for="item in (!loading&&!error?items:[])" :key="item.movie.id" class="history-card" :data-movie-id="item.movie.id">
    <router-link v-if="item.available" class="history-poster" :to="{path:'/movies/'+item.movie.id,query:{watch:'1'}}" :aria-label="(item.completed?tr('Смотреть снова: ','Watch again: '):tr('Продолжить просмотр: ','Continue watching: '))+item.movie.title"><img v-if="item.movie.poster" :src="posterUrl(item.movie.poster)" alt="" loading="lazy"/><span v-else class="no-poster">KINOSOTA</span><span class="play-symbol" aria-hidden="true">▶</span></router-link>
    <div v-else class="history-poster unavailable"><img v-if="item.movie.poster" :src="posterUrl(item.movie.poster)" alt="" loading="lazy"/><span>{{tr('Источник недоступен','Source unavailable')}}</span></div>
    <div class="history-copy"><h2 :title="item.movie.title">{{item.movie.title}}</h2><p class="history-meta">{{item.movie.year}} <span v-if="item.part_total"> · {{tr('Часть','Part')}} {{item.part_number}}/{{item.part_total}}</span><time :datetime="item.last_watched_at">{{date(item.last_watched_at)}}</time></p>
    <router-link v-if="item.available" class="history-watch" :to="{path:'/movies/'+item.movie.id,query:{watch:'1'}}">{{item.completed?tr('Смотреть снова','Watch again'):tr('Продолжить просмотр','Continue watching')}}</router-link><span v-else class="history-disabled">{{tr('Сейчас недоступен','Currently unavailable')}}</span>
    <p class="history-position">{{item.completed?tr('Просмотрено','Watched'):time(item.position)+' / '+time(item.duration)}}</p></div>
   </article>
  </div>
  <nav class="history-pagination" :aria-label="tr('Страницы истории','History pages')"><button :disabled="loading||page<=1" @click="move(-1)" :aria-label="tr('Предыдущая страница','Previous page')">←</button><span aria-live="polite">{{page}} / {{Math.max(1,pages)}}</span><button :disabled="loading||page>=pages" @click="move(1)" :aria-label="tr('Следующая страница','Next page')">→</button></nav>
 </section>
</template>
<style scoped>
.watch-history{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) 48px;gap:16px;color:#f4f4f4}.history-caption{margin:0;color:#aaa;font-size:14px;line-height:20px}.history-caption span{color:#efc148;margin-left:8px}.history-grid{display:grid;gap:16px;min-height:0}.history-state{grid-column:1/-1;grid-row:1/-1;align-self:center;justify-self:center;max-width:480px;text-align:center;color:#aaa;font-size:14px}.history-state h2{font-size:20px;color:#fff}.history-state p{line-height:1.5}.history-state a,.history-state button{color:#efc148}.history-card{min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #313131;border-radius:12px;background:#181818;overflow:hidden}.history-poster{position:relative;display:flex;align-items:center;justify-content:center;min-height:48px;flex:1;background:#272727;overflow:hidden;color:#fff;text-decoration:none}.history-poster img{position:absolute;width:100%;height:100%;object-fit:cover;object-position:center 24%}.play-symbol{z-index:1;background:#000b;border:1px solid #fff5;border-radius:50%;width:40px;height:40px;display:grid;place-items:center;font-size:16px}.no-poster{font-size:14px;color:#999}.history-copy{padding:12px;flex:none}.history-copy h2{margin:0 0 4px;font-size:16px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.history-meta{font-size:12px;color:#aaa;margin:0 0 8px;line-height:16px;white-space:nowrap;overflow:hidden}.history-meta time{display:block}.history-watch{display:block;color:#efc148;text-decoration:none;font-size:12px;line-height:16px;font-weight:600;white-space:nowrap}.history-position,.history-disabled{font-size:12px;color:#aaa;margin:4px 0 0;line-height:16px}.unavailable img{opacity:.35}.unavailable span{z-index:1;font-size:12px;text-align:center}.history-pagination{display:flex;justify-content:center;align-items:center;gap:16px;font-size:14px}.history-pagination button{width:40px;height:40px;background:#1f1f1f;color:#fff;border:1px solid #313131;border-radius:8px;font-size:20px;cursor:pointer}.history-pagination button:disabled{opacity:.35;cursor:default}.history-watch:hover{color:#fff}.history-card:focus-within{border-color:#efc148}a:focus-visible,button:focus-visible{outline:2px solid #efc148;outline-offset:-3px}.history-watch,.history-pagination button{transition:color 300ms cubic-bezier(.22,1,.36,1),background-color 300ms cubic-bezier(.22,1,.36,1)}@media(prefers-reduced-motion:reduce){*{transition:none!important}}@media(max-height:500px){.history-copy{padding:8px}.history-meta time{display:none}.watch-history{gap:8px}}
</style>
<style scoped>
@media(max-height:500px){.watch-history{grid-template-rows:minmax(0,1fr) 40px;gap:4px}.history-caption{display:none}.history-copy h2{font-size:14px}.history-meta{margin-bottom:4px}.history-position{margin-top:0}}
</style>
