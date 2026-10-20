<script setup lang="ts">
import {computed} from 'vue'
const props=defineProps<{user:any;size?:number}>()
const palette=['#e17076','#e5a150','#7bc862','#65aadd','#a695e7','#ee7aae','#6ec9cb']
const name=computed<string>(()=>String(props.user?.display_name||props.user?.telegram_first_name||props.user?.username||'?'))
const color=computed(()=>{const id=String(props.user?.telegram_id||props.user?.id||name.value);let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return palette[hash%palette.length]})
const picture=computed(()=>props.user?.avatar_url||(props.user?.avatar_preset!=null?'/avatars/'+props.user.avatar_preset+'.svg':null))
</script>
<template><span class="user-avatar" :style="{background:color,borderRadius:'50%',width:(size||44)+'px',height:(size||44)+'px',fontSize:Math.round((size||44)*.44)+'px'}" :aria-label="name"><img v-if="picture" :src="picture" alt=""/><span v-else>{{Array.from(name.trim())[0]?.toLocaleUpperCase()||'?'}}</span></span></template>
<style scoped>.user-avatar{display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;color:white;font-weight:700;line-height:1;vertical-align:middle}.user-avatar img{width:100%;height:100%;object-fit:cover}</style>
