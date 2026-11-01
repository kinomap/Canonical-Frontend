<script setup lang="ts">
import TorrentPlaybackSubscription from './TorrentPlaybackSubscription.vue'
defineProps<{access:boolean|null;accessError:boolean;poster?:string;kind:'movie'|'tv'}>()
defineEmits<{retry:[]}>()
</script>
<template>
  <section class="torrent-player" data-testid="torrent-player" aria-label="Плеер фильма">
    <TorrentPlaybackSubscription v-if="access===false&&!accessError" :poster="poster" />
    <div v-else class="torrent-player-state" :role="accessError?'alert':'status'">
      <template v-if="accessError"><h2>Не удалось проверить доступ к просмотру</h2><p>Каталог и описание доступны. Повторите проверку перед воспроизведением.</p><button type="button" @click="$emit('retry')">Повторить проверку</button></template>
      <template v-else-if="access===null"><p>Проверяем доступ к просмотру…</p></template>
      <template v-else><h2>Торрент воспроизведение ещё не подключено</h2><p>Доступ PRO подтверждён. Раздачи и воспроизведение появятся после подключения торрент сервиса. Карточка не гарантирует наличие источника.</p><router-link :to="`/torrents?kind=${kind}`">Продолжить выбор →</router-link></template>
    </div>
  </section>
</template>
<style scoped>
.torrent-player{margin-top:32px;width:100%;min-width:0;box-sizing:border-box;border:1px solid #313131;border-radius:12px;background:#090b0e;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr)}
.torrent-player :deep(.subscription-player){border:0;border-radius:0}
.torrent-player-state{aspect-ratio:16/9;min-height:360px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;padding:40px 24px;text-align:center;color:#fff}
.torrent-player-state h2{font-size:24px;line-height:32px;margin:0;text-wrap:balance}.torrent-player-state p{max-width:620px;margin:0;color:#dedede;font-size:16px;line-height:24px}
.torrent-player-state button,.torrent-player-state a{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;box-sizing:border-box;border:1px solid #f4cc4c;border-radius:8px;background:#f4cc4c;color:#131209;text-decoration:none;cursor:pointer}
.torrent-player-state button:focus-visible,.torrent-player-state a:focus-visible{outline:2px solid #fff;outline-offset:4px}
@media(max-width:600px){.torrent-player-state{aspect-ratio:auto;min-height:400px;padding:24px 16px}}
</style>
