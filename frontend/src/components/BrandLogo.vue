<script setup lang="ts">
import BrandMark from '../../../design-system/BrandMark.vue'
defineProps<{ compact?: boolean }>()
</script>
<template><BrandMark :compact="compact" /></template>
