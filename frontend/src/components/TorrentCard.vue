<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { TorrentItem } from '@/api/torrents'
import { torrentPath } from '@/api/torrents'
import LibraryButton from './LibraryButton.vue'
const props=defineProps<{item:TorrentItem}>()
const imageFailed=ref(false)
watch(()=>props.item.poster,()=>{imageFailed.value=false})
const route=useRoute()
</script>
<template>
 <article class="torrent-card">
  <router-link :to="{path:torrentPath(item),query:route.path==='/torrents/library'?{}:route.query}" class="torrent-card-link" :aria-label="`Описание: ${item.title}`">
   <div class="torrent-poster"><img v-if="item.poster&&!imageFailed" :src="item.poster" :alt="`Постер «${item.title}»`" width="342" height="513" loading="lazy" decoding="async" @error="imageFailed=true" /><span v-else class="poster-missing">Постер пока недоступен</span><span v-if="item.rating" class="torrent-card-rating">{{item.rating.toFixed(1)}}</span></div>
   <h3>{{ item.title }}</h3><p>{{ item.year || 'Год не указан' }} · {{ item.kind==='tv'?'Сериал':'Фильм' }}</p>
  </router-link>
  <LibraryButton :item="item" class="card-library" />
 </article>
</template>
<style scoped>
.torrent-card{position:relative;min-width:0;color:var(--ui-text,#fff)}.torrent-card-link{display:block;min-width:0;text-decoration:none;color:inherit;border-radius:12px}.torrent-card-link:focus-visible{outline:2px solid #69ddc4;outline-offset:4px}.torrent-poster{aspect-ratio:2/3;position:relative;background:#1f1f1f;border:1px solid var(--ui-border);border-radius:12px;overflow:hidden}.torrent-poster img{display:block;width:100%;height:100%;object-fit:cover;transition:opacity .2s}.torrent-card-link:hover img{opacity:.85}.poster-missing{display:grid;place-items:center;height:100%;padding:16px;color:#bbb;text-align:center;font-size:14px}.torrent-card h3{font-size:14px;line-height:20px;font-weight:600;margin:12px 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.torrent-card p{font-size:12px;line-height:16px;color:var(--ui-text-muted,#bbb);margin:0}.torrent-card-rating{position:absolute;left:8px;top:8px;padding:4px 8px;border-radius:8px;border:1px solid #f4d45e88;background:#0b1115e6;color:#f4d45e;font-size:12px;line-height:16px;font-weight:600}.card-library{position:absolute;right:8px;top:8px}.card-library :deep(.library-button){width:44px;height:44px}.card-library :deep(.library-tooltip){left:auto;right:0;transform:none;bottom:auto;top:calc(100% + 8px);white-space:normal;width:155px}
@media(prefers-reduced-motion:reduce){.torrent-poster img{transition:none}}
</style>
