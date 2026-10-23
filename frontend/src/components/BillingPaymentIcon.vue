<script setup lang="ts">
defineProps<{method:string;symbol:string}>()
</script>
<template>
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
 <path v-if="method==='ton'" d="M5 6h22L16 27 5 6Zm11 0v21" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
 <g v-else-if="method==='usdt_ton'" stroke="currentColor" stroke-width="2"><path d="M8 6h16v4h-6v16h-4V10H8V6Z" fill="currentColor" stroke="none"/><ellipse cx="16" cy="14" rx="11" ry="3"/></g>
 <path v-else-if="method==='trc20'" d="m4 4 25 5-11 20L4 4Zm0 0 16 12 9-7M18 29l2-13L4 4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
 <g v-else-if="method==='bep20'" fill="currentColor"><path d="m16 2 5 5-5 5-5-5Zm0 18 5 5-5 5-5-5ZM2 16l5-5 5 5-5 5Zm18 0 5-5 5 5-5 5Zm-4-5 5 5-5 5-5-5Z"/></g>
 <text v-else-if="method==='gram'" x="16" y="25" text-anchor="middle" fill="currentColor" font-family="Arial,sans-serif" font-size="26" font-weight="700">G</text>
 <circle v-else cx="16" cy="16" r="11" stroke="currentColor" stroke-width="2"/>
</svg>
</template>
