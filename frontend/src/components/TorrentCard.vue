<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import type { TorrentItem } from '@/api/torrents'
import { torrentPath } from '@/api/torrents'
const props=defineProps<{item:TorrentItem;landscape?:boolean}>()
const imageFailed=ref(false)
const artwork=computed(()=>props.landscape?(props.item.backdrop||props.item.poster):props.item.poster)
watch(()=>artwork.value,()=>{imageFailed.value=false})
const route=useRoute()
</script>
<template>
 <router-link :to="{path:torrentPath(item),query:route.query}" class="torrent-card" :class="{'torrent-card-landscape':landscape}" :aria-label="`Описание: ${item.title}`">
  <div class="torrent-poster"><img v-if="artwork&&!imageFailed" :src="artwork" :alt="`Постер «${item.title}»`" width="342" height="513" loading="lazy" decoding="async" @error="imageFailed=true" /><span v-else class="poster-missing">Постер пока недоступен</span><span v-if="landscape&&item.rating" class="torrent-card-rating">{{item.rating.toFixed(1)}}</span><span v-else-if="!landscape" class="torrent-card-tag">TMDB</span></div>
  <h3>{{ item.title }}</h3><p v-if="!landscape">{{ item.year || 'Год не указан' }} · {{ item.kind==='tv'?'Сериал':'Фильм' }}<span v-if="item.rating"> · ★ {{ item.rating.toFixed(1) }}</span></p>
 </router-link>
</template>
<style scoped>
.torrent-card{display:block;min-width:0;text-decoration:none;color:var(--ui-text,#fff);border-radius:12px;transition:opacity 300ms cubic-bezier(.22,1,.36,1)}.torrent-card:hover{opacity:.85}.torrent-card:focus-visible{outline:2px solid #69ddc4;outline-offset:4px}.torrent-poster{aspect-ratio:2/3;position:relative;background:#1f1f1f;border:1px solid var(--ui-border);border-radius:12px;overflow:hidden}.torrent-poster img{width:100%;height:100%;object-fit:cover}.poster-missing{display:grid;place-items:center;height:100%;padding:16px;color:#bbb;text-align:center;font-size:14px}.torrent-card-tag{position:absolute;bottom:8px;left:8px;background:#181818;color:#a3e8d9;border:1px solid #527d73;border-radius:4px;padding:4px 8px;font-size:12px;line-height:16px}.torrent-card h3{font-size:16px;line-height:24px;font-weight:600;margin:12px 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.torrent-card p{font-size:12px;line-height:16px;color:var(--ui-text-muted,#bbb);margin:0}
.torrent-card-landscape .torrent-poster{aspect-ratio:4/3}.torrent-card-landscape h3{font-size:14px;line-height:20px;margin-top:12px}.torrent-card-rating{position:absolute;right:8px;top:8px;padding:4px 8px;border-radius:8px;border:1px solid #f4d45e88;background:#0b1115e6;color:#f4d45e;font-size:12px;line-height:16px;font-weight:600}
</style>
