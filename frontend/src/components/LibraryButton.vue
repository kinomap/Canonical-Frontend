<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bookmark } from 'lucide-vue-next'
import type { TorrentItem } from '@/api/torrents'
import { useLibrary } from '@/stores/library'
import { useAuthStore } from '@/stores/auth'
const props=defineProps<{item:TorrentItem}>()
const auth=useAuthStore(), library=useLibrary(), route=useRoute(), router=useRouter()
const state=computed(()=>library.entry(props.item))
const label=computed(()=>state.value.error|| (state.value.saved?'Удалить из кинотеки':'Добавить в кинотеку'))
watch(()=>[props.item.kind,props.item.tmdb_id,auth.token.value,auth.user.value?.id],()=>library.ensure(props.item),{immediate:true})
async function toggle(){if(!auth.isAuthenticated.value){await router.push({path:'/login',query:{redirect:route.fullPath}});return}await library.toggle(props.item)}
</script>
<template><div class="library-control"><button type="button" class="library-button" :class="{'is-saved':state.saved}" :title="label" :aria-label="label" :aria-pressed="state.saved" :aria-busy="state.loading" :disabled="state.loading" @click.stop.prevent="toggle"><Bookmark :size="21" :fill="state.saved?'currentColor':'none'" :stroke-width="1.8" aria-hidden="true" /></button><span class="library-tooltip" role="tooltip">{{label}}</span><span v-if="state.error" class="library-feedback" role="alert">{{state.error}}</span></div></template>
<style scoped>
.library-control{position:relative;display:inline-flex;flex:none}.library-button{display:grid;place-items:center;width:48px;height:48px;padding:0;border:1px solid #bca86d88;border-radius:50%;background:#0b1118db;color:#f4d45e;cursor:pointer;transition:background .2s,border-color .2s}.library-button:hover{border-color:#f4d45e;background:#292617}.library-button.is-saved{color:#ffd52e;border-color:#ffd52e}.library-button:focus-visible{outline:2px solid #f4d45e;outline-offset:3px}.library-button:disabled{cursor:wait;opacity:.65}.library-tooltip{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:8px 12px;border-radius:8px;background:#181d24;color:#fff;border:1px solid #52534a;font-size:12px;line-height:16px;pointer-events:none;opacity:0;visibility:hidden;z-index:5}.library-control:hover .library-tooltip,.library-control:focus-within .library-tooltip{visibility:visible;opacity:1}.library-feedback{position:absolute;top:calc(100% + 8px);right:0;width:220px;max-width:70vw;padding:10px;border-radius:8px;background:#251e1b;color:#ffe6b6;font-size:12px;line-height:18px;z-index:8}
@media(prefers-reduced-motion:reduce){.library-button{transition:none}}
</style>
