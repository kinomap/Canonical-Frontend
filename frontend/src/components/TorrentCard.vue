<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Play, Star } from 'lucide-vue-next'
import type { TorrentItem } from '@/api/torrents'
import { torrentPath } from '@/api/torrents'
import LibraryButton from './LibraryButton.vue'
// Poster card (catalogue rails and Kinoteka): rating, bookmark and a hover play cue only;
// preparation status / progress lives on the title page, not on the cards.
const props=defineProps<{item:TorrentItem}>()
const imageFailed=ref(false)
watch(()=>props.item.poster,()=>{imageFailed.value=false})
const route=useRoute()
</script>
<template>
 <article class="torrent-card">
  <router-link :to="{path:torrentPath(item),query:route.path==='/torrents/library'?{}:route.query}" class="torrent-card-link" :aria-label="`Описание: ${item.title}`">
   <div class="torrent-poster"><img v-if="item.poster&&!imageFailed" :src="item.poster" :alt="`Постер «${item.title}»`" width="342" height="513" loading="lazy" decoding="async" @error="imageFailed=true" /><span v-else class="poster-missing">Постер пока недоступен</span><span v-if="item.rating" class="torrent-card-rating"><Star :size="12" fill="currentColor" :stroke-width="0" aria-hidden="true" />{{item.rating.toFixed(1)}}</span><span class="torrent-card-play" aria-hidden="true"><Play :size="22" fill="currentColor" :stroke-width="0" /></span></div>
   <h3>{{ item.title }}</h3><p>{{ item.year || 'Год не указан' }} · {{ item.kind==='tv'?'Сериал':'Фильм' }}</p>
  </router-link>
  <LibraryButton :item="item" class="card-library" />
 </article>
</template>
<style scoped>
.torrent-card{position:relative;min-width:0;color:var(--ui-text,#f5f6f8)}
.torrent-card-link{display:block;min-width:0;text-decoration:none;color:inherit;border-radius:16px}
.torrent-card-link:focus-visible{outline:none}
.torrent-card-link:focus-visible .torrent-poster{box-shadow:0 0 0 2px #ffc21a,0 18px 40px rgba(0,0,0,.5)}
.torrent-poster{aspect-ratio:2/3;position:relative;background:#171a21;border-radius:16px;overflow:hidden;box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 12px 32px rgba(0,0,0,.42);transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s cubic-bezier(.22,1,.36,1)}
.torrent-poster::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,11,14,0) 55%,rgba(10,11,14,.55) 100%);opacity:.7;transition:opacity .35s;pointer-events:none}
.torrent-poster img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.22,1,.36,1)}
.torrent-card-link:hover .torrent-poster{transform:translateY(-4px);box-shadow:0 0 0 1px rgba(255,194,26,.55),0 18px 40px rgba(0,0,0,.5)}
.torrent-card-link:hover .torrent-poster img{transform:scale(1.04)}
.torrent-card-link:hover .torrent-poster::after{opacity:1}
.poster-missing{display:grid;place-items:center;height:100%;padding:16px;color:rgba(245,246,248,.44);text-align:center;font-size:14px}
.torrent-card h3{font-size:14px;line-height:20px;font-weight:600;margin:12px 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.torrent-card p{font-size:12px;line-height:16px;color:rgba(245,246,248,.44);margin:0}
.torrent-card-rating{position:absolute;left:8px;top:8px;z-index:1;display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:8px;background:rgba(10,11,14,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#f5f6f8;font-size:12px;line-height:16px;font-weight:700}
.torrent-card-rating svg{color:#ffc21a}
.torrent-card-play{position:absolute;left:50%;top:50%;z-index:1;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ffe36e 0%,#ffc21a 46%,#ff9e1b 100%);color:#1a1405;box-shadow:0 8px 24px rgba(255,170,20,.32);opacity:0;transform:translate(-50%,-50%) scale(.86);transition:opacity .3s cubic-bezier(.22,1,.36,1),transform .3s cubic-bezier(.22,1,.36,1)}
.torrent-card-play svg{margin-left:3px}
.torrent-card-link:hover .torrent-card-play,.torrent-card-link:focus-visible .torrent-card-play{opacity:1;transform:translate(-50%,-50%) scale(1)}
.card-library{position:absolute;right:8px;top:8px;z-index:2}
.card-library :deep(.library-button){width:36px;height:36px;border:0;background:rgba(10,11,14,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#ffc21a}
.card-library :deep(.library-button svg){width:18px;height:18px}
.card-library :deep(.library-button:hover){background:rgba(10,11,14,.86);color:#ffd24d}
.card-library :deep(.library-tooltip){left:auto;right:0;transform:none;bottom:auto;top:calc(100% + 8px);white-space:normal;width:155px}
@media(hover:none){.torrent-card-play{display:none}}
@media(prefers-reduced-motion:reduce){.torrent-poster,.torrent-poster img,.torrent-card-play{transition:none}.torrent-card-link:hover .torrent-poster{transform:none}.torrent-card-link:hover .torrent-poster img{transform:none}}
</style>
