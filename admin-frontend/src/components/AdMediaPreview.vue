<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue'
const props=defineProps<{src:string,label:string}>()
const emit=defineEmits<{retry:[]}>()
const problem=ref(''),waiting=ref(false)
let timer:ReturnType<typeof setTimeout>|null=null
function clear(){if(timer)clearTimeout(timer);timer=null;waiting.value=false}
function stalled(){clear();waiting.value=true;timer=setTimeout(()=>{waiting.value=false;problem.value='Видео не начало воспроизводиться. Обновите адрес и повторите предпросмотр.'},20000)}
function failed(){clear();problem.value='Не удалось воспроизвести видео. Обновите адрес предпросмотра; если ошибка повторится, проверьте доступность Media Node.'}
function ready(){clear();problem.value=''}
watch(()=>props.src,()=>{problem.value='';if(props.src)stalled();else clear()},{immediate:true})
onBeforeUnmount(clear)
</script>
<template><div class="ad-media-preview"><video v-if="src" :key="src" :src="src" :aria-label="label" controls playsinline crossorigin="anonymous" preload="metadata" @loadedmetadata="ready" @playing="ready" @waiting="stalled" @error="failed"></video><p v-if="waiting" role="status">Подключаем видео…</p><div v-if="problem" role="alert" class="preview-problem">{{problem}} <button type="button" @click="emit('retry')">Повторить предпросмотр</button></div></div></template>
<style scoped>.ad-media-preview video{display:block;width:100%;max-height:360px;background:#10151e;aspect-ratio:16/9;border-radius:10px}.preview-problem{padding:12px;background:#402832;color:#ffd7df;border:1px solid #c77d8e;border-radius:8px}.preview-problem button{margin-top:8px}</style>
