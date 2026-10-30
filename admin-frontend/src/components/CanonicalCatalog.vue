<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch} from 'vue'
import {useRouter} from 'vue-router'
import axios from 'axios'
const props=withDefaults(defineProps<{missingOnly?:boolean}>(),{missingOnly:false})
const router=useRouter()
const items=ref<any[]>([]),total=ref(0),pages=ref(1),page=ref(1)
const search=ref(''),kind=ref('all'),status=ref('all'),withoutPoster=ref(props.missingOnly),withoutTmdb=ref(false)
const loading=ref(false),error=ref('')
let seq=0,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined
const heading=computed(()=>props.missingOnly?'Без постера':'Canonical Metadata · Фильмы и сериалы')
async function load(){
 const n=++seq;controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{
  const {data}=await axios.get('/api/v1/admin/catalog',{params:{search:search.value.trim(),kind:kind.value,status:status.value,without_poster:props.missingOnly||withoutPoster.value,without_tmdb:withoutTmdb.value,page:page.value,limit:20},signal:controller.signal})
  if(n!==seq)return
  items.value=data.items;total.value=data.total;pages.value=data.pages
  if(page.value>pages.value){page.value=pages.value;await load()}
 }catch(e:any){if(n!==seq||axios.isCancel(e))return;if([401,403].includes(e.response?.status)){await router.push('/login');return}error.value='Не удалось загрузить каталог. Повторите запрос.'}
 finally{if(n===seq)loading.value=false}
}
function apply(){if(timer)clearTimeout(timer);page.value=1;load()}
function onSearch(){if(timer)clearTimeout(timer);timer=setTimeout(apply,250)}
function reset(){search.value='';kind.value='all';status.value='all';withoutPoster.value=props.missingOnly;withoutTmdb.value=false;apply()}
function open(item:any){router.push(`/${item.kind==='series'?'series':'movies'}/${item.id}`)}
function changePage(p:number){page.value=p;load()}
watch(()=>props.missingOnly,()=>{withoutPoster.value=props.missingOnly;apply()})
onMounted(load);onBeforeUnmount(()=>{seq++;controller?.abort();if(timer)clearTimeout(timer)})
</script>
<template>
 <section class="canonical-catalog">
  <header><h1>{{heading}}</h1><p>Единый каталог метаданных. Фильмы и сериалы сохраняют собственные карточки и источники, даже если сейчас недоступны для просмотра.</p></header>
  <form class="catalog-filters" @submit.prevent="apply">
   <label class="title-search">Поиск по названию<input v-model="search" type="search" placeholder="Ход королевы, Queen, Lupin, hod…" @input="onSearch" /></label>
   <label>Тип контента<select v-model="kind" @change="apply"><option value="all">Фильмы и сериалы</option><option value="movie">Фильмы</option><option value="series">Сериалы</option></select></label>
   <label>Доступность<select v-model="status" @change="apply"><option value="all">Любая</option><option value="available">Есть в выдаче</option><option value="unavailable">Сейчас недоступны</option></select></label>
   <label v-if="!missingOnly" class="check"><input v-model="withoutPoster" type="checkbox" @change="apply" />Без постера</label>
   <label class="check"><input v-model="withoutTmdb" type="checkbox" @change="apply" />Без TMDB ID</label>
   <button type="submit">Найти</button><button type="button" @click="reset">Сбросить</button>
  </form>
  <p class="catalog-hint">Поиск по части русского и оригинального названия, латинице и транслитерации. Без TMDB ID не означает, что запись не распознана: возможны Кинопоиск или IMDb.</p>
  <p aria-live="polite">Найдено: {{total.toLocaleString('ru-RU')}}</p>
  <div v-if="error" role="alert" class="catalog-error">{{error}} <button @click="load">Повторить</button></div>
  <div v-else-if="loading" class="catalog-skeleton" aria-label="Загрузка каталога" aria-busy="true"><div v-for="n in 5" :key="n"></div></div>
  <div v-else-if="!items.length" class="catalog-empty"><h2>Записи не найдены</h2><p>Проверьте название или сбросьте фильтры. В этом разделе показаны и фильмы, и сериалы.</p><button @click="reset">Сбросить фильтры</button></div>
  <div v-else class="catalog-scroll" tabindex="0" role="region" aria-label="Фильмы и сериалы">
   <table><thead><tr><th>Постер</th><th>Название</th><th>Тип</th><th>Год</th><th>Идентификация</th><th>Доступность</th><th>Управление</th></tr></thead>
    <tbody><tr v-for="item in items" :key="item.kind+item.id" :data-id="item.id">
     <td><img v-if="item.poster_url" :src="item.poster_url" :alt="'Постер: '+item.title" loading="lazy" /><span v-else class="missing-poster">Нет постера</span></td>
     <th scope="row"><button class="title-button" @click="open(item)">{{item.title}}</button><small>{{item.original_title}}</small></th>
     <td>{{item.kind==='series'?'Сериал':'Фильм'}}</td><td>{{item.year||'—'}}</td>
     <td><span v-if="item.tmdb_id">TMDB {{item.tmdb_id}}</span><span v-else-if="item.kinopoisk_id">Кинопоиск {{item.kinopoisk_id}}</span><span v-else-if="item.imdb_id">IMDb {{item.imdb_id}}</span><span v-else>Ручная проверка</span><small v-if="!item.identity_verified">Идентичность не подтверждена</small></td>
     <td>{{item.is_available?'Есть в выдаче':'Недоступно'}}</td><td><button :aria-label="'Редактировать: '+item.title" @click="open(item)">Редактировать</button></td>
    </tr></tbody>
   </table>
  </div>
  <nav class="catalog-pagination" aria-label="Страницы каталога"><button :disabled="page<=1||loading" @click="changePage(page-1)">Назад</button><span>{{page}} / {{pages}}</span><button :disabled="page>=pages||loading" @click="changePage(page+1)">Далее</button></nav>
 </section>
</template>
<style scoped>
.canonical-catalog{min-width:0;max-width:100%;color:var(--text-primary,#fff)}
header{margin-bottom:24px}h1{font-size:24px;line-height:32px;text-wrap:balance}header p,.catalog-hint{color:var(--text-secondary,#b5b5b5);line-height:24px;max-width:900px;text-wrap:pretty}
.catalog-filters{display:flex;gap:16px;flex-wrap:wrap;align-items:end;padding:16px;border:1px solid var(--border-color,#313131);border-radius:12px;background:var(--bg-card,#181818)}
.catalog-filters label{display:grid;gap:8px;font-size:14px}.catalog-filters .title-search{flex:1 1 300px}.catalog-filters input:not([type=checkbox]),select{min-height:44px;padding:8px 12px;width:100%;box-sizing:border-box;border:1px solid var(--border-color,#313131);border-radius:8px;background:var(--bg-primary,#131209);color:inherit;font:inherit}.catalog-filters .check{display:flex;align-items:center;min-height:44px}
button{min-height:44px;padding:8px 12px;border:1px solid var(--border-color,#313131);border-radius:8px;color:inherit;background:var(--bg-card,#1f1f1f);font:inherit;cursor:pointer;transition:opacity 200ms cubic-bezier(.22,1,.36,1)}button:hover{opacity:.8}button:disabled{opacity:.4;cursor:default}:is(button,input,select,[tabindex]):focus-visible{outline:2px solid #a5a0ff;outline-offset:2px}
.catalog-scroll{overflow:auto;max-width:100%;border:1px solid var(--border-color,#313131);border-radius:12px}table{width:100%;min-width:900px;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--border-color,#313131);vertical-align:middle;font-size:14px}tbody th{min-width:240px;font-weight:400}.title-button{text-align:left;text-wrap:pretty;font-weight:600;max-width:420px}small{display:block;color:var(--text-secondary,#b5b5b5);margin-top:8px;line-height:20px}td img{width:56px;height:84px;object-fit:cover;border-radius:4px}.missing-poster{display:block;width:56px;font-size:12px;color:var(--text-secondary,#b5b5b5)}
.catalog-pagination{display:flex;gap:16px;align-items:center;justify-content:center;margin-top:24px}.catalog-error,.catalog-empty{padding:24px;border:1px solid var(--border-color,#313131);border-radius:12px}.catalog-skeleton div{height:72px;background:var(--bg-card,#181818);margin:8px 0;border-radius:8px}
@media(max-width:600px){.catalog-filters{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.catalog-filters .title-search{min-width:0}h1{font-size:20px;line-height:28px}.catalog-hint{font-size:14px;line-height:20px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
