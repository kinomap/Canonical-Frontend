<script setup lang="ts">
import {ref} from 'vue'
import SignInForm from '@/components/SignInForm.vue'
import {useDialog} from '@/useDialog'
const props=defineProps<{visible:boolean;returnUrl:string}>(),emit=defineEmits<{confirm:[]}>(),card=ref<HTMLElement|null>(null)
useDialog(()=>props.visible,card)
</script>
<template><Teleport to="body"><div v-if="visible" class="session-overlay"><section ref="card" tabindex="-1" class="session-card" role="dialog" aria-modal="true" aria-labelledby="session-title"><img src="/brand/icon-128.png" width="56" height="56" alt=""/><h2 id="session-title">Войдите, чтобы продолжить</h2><p>Не удалось продлить сессию. Войдите снова — вы останетесь на этой странице.</p><SignInForm @success="emit('confirm')"/></section></div></Teleport></template>
<style scoped>
.session-overlay{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:24px;background:#020609c9;backdrop-filter:blur(12px);overflow:auto}.session-card{box-sizing:border-box;width:min(100%,480px);max-height:calc(100dvh - 48px);overflow:auto;padding:32px;border:1px solid #6d5d33;border-radius:24px;background:radial-gradient(at 100% 0,#55411a40,transparent 60%),#10171b;box-shadow:0 24px 96px #0009;color:#f5f6f7}.session-card h2{font-size:24px;line-height:32px;margin:16px 0 8px}.session-card p{color:#bec6cf;line-height:24px;margin:0 0 24px}@media(max-width:480px){.session-overlay{padding:16px}.session-card{padding:24px}}
</style>
