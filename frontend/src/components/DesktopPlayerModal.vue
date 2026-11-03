<script setup lang="ts">
/** Shown when the kinosota:// link was not picked up by an installed KINOSOTA Player. */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DESKTOP_PLAYER_TEXT } from '@/lib/desktopLaunch'
const props = defineProps<{ show: boolean; canBrowse?: boolean }>()
const emit = defineEmits<{ close: []; browser: [] }>()
const dialog = ref<HTMLElement | null>(null)
let previous: Element | null = null
watch(() => props.show, async (open) => {
  if (open) {
    previous = document.activeElement
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('.desktop-modal-primary')?.focus()
  } else if (previous instanceof HTMLElement) {
    previous.focus()
    previous = null
  }
})
function onKey(event: KeyboardEvent) {
  if (!props.show) return
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const items = [...dialog.value.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
  if (!items.length) return
  const first = items[0], last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>
<template>
  <Teleport to="body">
    <div v-if="show" class="desktop-modal-overlay" data-testid="desktop-player-modal" @click.self="emit('close')">
      <div ref="dialog" class="desktop-modal" role="dialog" aria-modal="true" aria-labelledby="desktop-modal-title" aria-describedby="desktop-modal-text">
        <button type="button" class="desktop-modal-close" aria-label="Закрыть" @click="emit('close')">×</button>
        <div class="desktop-modal-icon" aria-hidden="true">▶</div>
        <h2 id="desktop-modal-title">KINOSOTA Player</h2>
        <p id="desktop-modal-text">{{ DESKTOP_PLAYER_TEXT }}</p>
        <div class="desktop-modal-actions">
          <router-link class="desktop-modal-primary" to="/profile?tab=player" @click="emit('close')">Перейти в Профиль</router-link>
          <button v-if="canBrowse" type="button" class="desktop-modal-secondary" @click="emit('browser')">Смотреть в браузере</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.desktop-modal-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.75)}
.desktop-modal{position:relative;width:100%;max-width:440px;box-sizing:border-box;padding:32px 28px 28px;border:1px solid var(--ui-border,#2c2c2c);border-radius:16px;background:var(--ui-bg,#0d1114);color:#fff;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,.6)}
.desktop-modal-close{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:50%;background:transparent;color:#bbb;font-size:24px;line-height:1;cursor:pointer}
.desktop-modal-close:hover{color:#fff;background:rgba(255,255,255,.08)}
.desktop-modal-icon{display:grid;place-items:center;width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#fff;color:#0b0f12;font-size:22px;padding-left:4px;box-sizing:border-box}
.desktop-modal h2{margin:0 0 12px;font-size:22px;line-height:28px}
.desktop-modal p{margin:0 0 24px;color:#d6d6d6;font-size:15px;line-height:23px;text-wrap:pretty}
.desktop-modal-actions{display:flex;flex-direction:column;gap:10px}
.desktop-modal-primary,.desktop-modal-secondary{display:flex;align-items:center;justify-content:center;min-height:48px;padding:10px 18px;box-sizing:border-box;border-radius:10px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.desktop-modal-primary{background:#fff;color:#0b0f12;border:1px solid #fff}
.desktop-modal-secondary{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}
.desktop-modal-primary:focus-visible,.desktop-modal-secondary:focus-visible,.desktop-modal-close:focus-visible{outline:2px solid #9ce8d7;outline-offset:3px}
</style>
