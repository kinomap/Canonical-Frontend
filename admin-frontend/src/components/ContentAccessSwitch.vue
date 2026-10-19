<script setup lang="ts">
import { ref, watch } from 'vue'
import axios from 'axios'
const props = defineProps<{ kind: 'movie' | 'series'; contentId: string }>()
const premium = ref<boolean | null>(null), busy = ref(false), error = ref('')
function config() { return { headers: { Authorization: 'Bearer ' + (localStorage.getItem('admin_token') || 'cookie-session') } } }
const url = () => `/api/v1/admin/audience/crm/content/${props.kind}/${props.contentId}`
async function load() { try { premium.value = (await axios.get(url(), config())).data.premium } catch { error.value = 'Статус доступа не загружен' } }
async function toggle() { if (premium.value === null || busy.value) return; busy.value = true; error.value = ''; try { premium.value = (await axios.put(url(), { enabled: !premium.value }, config())).data.premium } catch { error.value = 'Не удалось сохранить доступ' } finally { busy.value = false } }
watch(() => props.contentId, () => { premium.value = null; load() }, { immediate: true })
</script>
<template><span class="content-access" @click.stop><button role="switch" :aria-checked="premium === true" :disabled="premium === null || busy" :class="{ premium }" @click.stop="toggle">{{ premium === null ? 'Проверка доступа…' : premium ? '🔒 Только Premium' : 'Всем бесплатно' }}</button><small v-if="error" role="alert">{{ error }} <button @click.stop="load">Повторить</button></small></span></template>
<style scoped>.content-access{display:inline-flex;flex-direction:column;gap:5px;min-width:150px}button{min-height:40px;border:1px solid var(--k-border-strong);border-radius:8px;padding:8px 12px;background:var(--k-surface-sunken);color:var(--k-text);font-size:12px;cursor:pointer;white-space:nowrap}.premium{background:#8b5cf61a;color:#c4b5fd;border-color:#8b5cf655}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}small{font-size:11px;color:#fda4af}</style>
