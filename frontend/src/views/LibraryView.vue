<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bookmark, ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { libraryApi } from '@/api/library'
import type { LibraryPage } from '@/api/library'
import { preparationApi, IN_PROGRESS } from '@/api/preparation'
import type { PrepStatusMap } from '@/api/preparation'
import { torrentsApi } from '@/api/torrents'
import TorrentCard from '@/components/TorrentCard.vue'
import { useLibrary } from '@/stores/library'
const route=useRoute(),router=useRouter(),library=useLibrary()
const data=ref<LibraryPage|null>(null),loading=ref(false),error=ref('')
const prepStatuses=ref<PrepStatusMap>({})
// Progress is a PRO/Admin feature: other accounts would only ever see 'unavailable'.
let torrentAccess:Promise<boolean>|null=null
const canPrepare=()=>torrentAccess??=torrentsApi.access().then(r=>r.allowed).catch(()=>{torrentAccess=null;return false})
const page=computed(()=>Math.min(10000,Math.max(1,parseInt(String(route.query.page||1),10)||1)))
let generation=0
async function load(){const version=++generation;loading.value=true;error.value='';try{const result=await libraryApi.list(page.value);if(version!==generation)return;if(page.value>result.total_pages){await router.replace({query:{page:result.total_pages>1?result.total_pages:undefined}});return}data.value=result;await refreshStatuses(result)}catch{if(version===generation)error.value='Не удалось загрузить кинотеку. Попробуйте ещё раз.'}finally{if(version===generation)loading.value=false}}
async function refreshStatuses(page?:LibraryPage){const items=page?page.items:(data.value?.items??[]);if(!items.length||!await canPrepare())return;const keys=items.map(i=>`${i.kind}:${i.tmdb_id}`);try{const r=await preparationApi.status(keys);prepStatuses.value={...prepStatuses.value,...r.statuses}}catch{}}
watch([page,library.revision],load,{immediate:true})
function go(n:number){router.push({query:n>1?{page:n}:{}})}
// Poll preparation status every 4 seconds while in-progress items exist
let pollTimer:ReturnType<typeof setInterval>|null=null
function startPoll(){if(pollTimer)return;pollTimer=setInterval(()=>{const inProgress=Object.values(prepStatuses.value).some(s=>IN_PROGRESS.includes(s.status));if(inProgress)refreshStatuses();else stopPoll()},4000)}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
watch(prepStatuses,()=>{const inProgress=Object.values(prepStatuses.value).some(s=>IN_PROGRESS.includes(s.status));if(inProgress)startPoll();else stopPoll()},{deep:true})
onUnmounted(stopPoll)
</script>
<template><main class="library-page"><div class="library-heading"><div><p class="eyebrow">ВАША КОЛЛЕКЦИЯ</p><h1>Кинотека</h1><p>Фильмы и сериалы, которые вы сохранили. Последние добавленные — первыми.</p></div><router-link to="/torrents">Вернуться в каталог →</router-link></div><p v-if="loading" role="status">Загружаем кинотеку…</p><section v-else-if="error" class="library-empty" role="alert"><p>{{error}}</p><button @click="load">Повторить</button></section><template v-else-if="data"><p class="library-count">Сохранено: {{data.total}}</p><div v-if="data.items.length" class="library-grid"><TorrentCard v-for="item in data.items" :key="`${item.kind}:${item.tmdb_id}`" :item="item" :prep-status="prepStatuses[`${item.kind}:${item.tmdb_id}`]" /></div><section v-else class="library-empty"><Bookmark :size="32" aria-hidden="true" /><h2>Здесь будет ваша кинотека</h2><p>Нажмите на флажок у фильма или сериала, чтобы сохранить его.</p><router-link to="/torrents">Выбрать фильм →</router-link></section><nav v-if="data.total_pages>1" class="library-pagination" aria-label="Страницы кинотеки"><button :disabled="page<=1" aria-label="Предыдущая страница" @click="go(page-1)"><ArrowLeft :size="18" /></button><span>{{page}} / {{data.total_pages}}</span><button :disabled="page>=data.total_pages" aria-label="Следующая страница" @click="go(page+1)"><ArrowRight :size="18" /></button></nav></template></main></template>
<style scoped>
.library-page{width:100%;max-width:1440px;margin:0 auto;padding:40px 24px 64px;min-height:70vh}.library-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:32px}.library-heading h1{font-size:32px;line-height:40px;margin:8px 0}.library-heading p{color:var(--ui-text-muted);line-height:24px}.library-heading .eyebrow{color:#9ce8d7;font-size:12px;letter-spacing:.08em}.library-page a{color:#f4d45e}.library-count{color:var(--ui-text-muted);margin-bottom:20px}.library-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:28px 20px}.library-empty{padding:64px 24px;text-align:center;border:1px solid var(--ui-border);border-radius:12px;display:flex;align-items:center;flex-direction:column;gap:20px}.library-empty h2{font-size:24px;line-height:32px}.library-empty p{color:var(--ui-text-muted);line-height:24px}.library-empty svg{color:#f4d45e}.library-page button{background:var(--ui-surface,#161c22);color:var(--ui-text);border:1px solid var(--ui-border);border-radius:8px;min-width:44px;min-height:44px;cursor:pointer}.library-page button:disabled{opacity:.4;cursor:default}.library-pagination{display:flex;justify-content:center;align-items:center;gap:20px;margin-top:32px}@media(max-width:1100px){.library-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:767px){.library-page{padding:24px 16px 48px}.library-heading{align-items:flex-start;flex-direction:column;gap:12px}.library-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}.library-heading h1{font-size:28px;line-height:36px}}
</style>
