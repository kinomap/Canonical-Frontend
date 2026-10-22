<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck, KeyRound } from 'lucide-vue-next'
import { tr, language } from '@/i18n'
const props=defineProps<{ account:any }>()
const enrolled=computed(()=>props.account.two_factor_enabled_at?new Date(props.account.two_factor_enabled_at).toLocaleDateString(language.value==='ru'?'ru-RU':'en-US'):null)
</script>
<template>
<section v-if="account.two_factor_enabled" class="factor-active" aria-label="2FA ON" role="status">
 <div class="factor-heading"><ShieldCheck :size="27"/><strong>{{tr('Двухфакторная защита (2FA) АКТИВНА','Two-factor protection (2FA) is ACTIVE')}}</strong><span>2FA ON</span></div>
 <div class="factor-meta"><p>{{enrolled?tr('Подключена: ','Enabled: ')+enrolled:tr('Дата подключения ранее не сохранялась.','Enrollment date was not recorded previously.')}}</p><p><KeyRound :size="16"/>{{tr('Резервных кодов осталось: ','Recovery codes remaining: ')}}<b>{{account.recovery_codes_remaining}}</b></p></div>
 <slot/>
</section>
</template>
<style scoped>
.factor-active{padding:22px;border:1px solid var(--ui-success);border-radius:var(--ui-radius-panel);background:var(--ui-surface);color:var(--ui-success);margin:0 0 22px}.factor-heading{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.factor-heading strong{flex:1;min-width:180px;font-size:18px;line-height:1.4}.factor-heading>span{font-size:14px;font-weight:700;background:var(--ui-success-bg);padding:6px 10px;border-radius:var(--ui-radius)}.factor-meta{margin-top:14px;font-size:14px;line-height:1.6;color:var(--ui-secondary)}.factor-meta p{display:flex;align-items:center;gap:8px;margin:6px 0}.factor-meta p:first-child{display:block}@media(max-width:500px){.factor-active{padding:18px}.factor-heading strong{font-size:17px}.factor-meta p{flex-wrap:wrap}}
</style>
