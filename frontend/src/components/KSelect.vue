<script setup lang="ts">
/**
 * Custom select of the KINOSOTA mockups: rounded trigger and a blurred listbox popup instead of the
 * native dropdown. Keyboard: ↑/↓, Home/End, Enter/Space to pick, Esc to close, Tab moves on.
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

export type KSelectValue = string | number
export type KSelectOption = { value: KSelectValue; label: string; hint?: string; disabled?: boolean }
const props = withDefaults(defineProps<{
  modelValue: KSelectValue | null
  options: KSelectOption[]
  label: string
  placeholder?: string
  disabled?: boolean
}>(), { placeholder: 'Выберите', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: KSelectValue] }>()

const uid = `kselect-${useId()}`
const open = ref(false)
const active = ref(-1)
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const current = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null)

function enabledFrom(from: number, step: 1 | -1): number {
  for (let i = from; i >= 0 && i < props.options.length; i += step) if (!props.options[i].disabled) return i
  return -1
}
function reveal() {
  void nextTick(() => list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView?.({ block: 'nearest' }))
}
function show() {
  if (props.disabled || !props.options.length) return
  const index = props.options.findIndex((o) => o.value === props.modelValue)
  active.value = index >= 0 && !props.options[index].disabled ? index : enabledFrom(0, 1)
  open.value = true
  reveal()
}
function hide(focus = true) {
  open.value = false
  if (focus) trigger.value?.focus()
}
function pick(index: number) {
  const option = props.options[index]
  if (!option || option.disabled) return
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
  hide()
}
function move(step: 1 | -1) {
  const next = enabledFrom(active.value + step, step)
  if (next >= 0) { active.value = next; reveal() }
}
function jump(index: number) {
  if (index >= 0) { active.value = index; reveal() }
}
function onKey(event: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
    return
  }
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break
    case 'ArrowUp': event.preventDefault(); move(-1); break
    case 'Home': event.preventDefault(); jump(enabledFrom(0, 1)); break
    case 'End': event.preventDefault(); jump(enabledFrom(props.options.length - 1, -1)); break
    case 'Enter': case ' ': event.preventDefault(); pick(active.value); break
    case 'Escape': event.preventDefault(); hide(); break
    case 'Tab': hide(false); break
  }
}
function hover(index: number) {
  if (!props.options[index]?.disabled) active.value = index
}
function outside(event: Event) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) hide(false)
}
watch(open, (value) => {
  if (typeof document === 'undefined') return
  if (value) document.addEventListener('pointerdown', outside, true)
  else document.removeEventListener('pointerdown', outside, true)
})
watch(() => props.disabled, (value) => { if (value && open.value) hide(false) })
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.removeEventListener('pointerdown', outside, true) })
</script>
<template>
  <div ref="root" class="kselect" :class="{ open }">
    <button
      ref="trigger" type="button" class="kselect-trigger" role="combobox" aria-haspopup="listbox"
      :aria-label="label" :aria-expanded="open" :aria-controls="open ? `${uid}-list` : undefined"
      :aria-activedescendant="open && active >= 0 ? `${uid}-${active}` : undefined" :disabled="disabled"
      @click="open ? hide() : show()" @keydown="onKey"
    >
      <span class="kselect-value">{{ current?.label ?? placeholder }}</span>
      <ChevronDown class="kselect-chevron" :size="18" aria-hidden="true" />
    </button>
    <ul v-if="open" :id="`${uid}-list`" ref="list" class="kselect-list" role="listbox" :aria-label="label">
      <li
        v-for="(o, i) in options" :id="`${uid}-${i}`" :key="String(o.value)" :data-index="i" role="option" class="kselect-option"
        :class="{ active: i === active, selected: o.value === modelValue, disabled: o.disabled }"
        :aria-selected="o.value === modelValue" :aria-disabled="o.disabled ? 'true' : undefined"
        @mousemove="hover(i)" @mousedown.prevent @click="pick(i)"
      >
        <span class="kselect-label">{{ o.label }}</span>
        <span v-if="o.hint" class="kselect-hint">{{ o.hint }}</span>
        <Check v-if="o.value === modelValue" class="kselect-check" :size="16" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>
<style scoped>
.kselect{position:relative;min-width:160px}
.kselect.open{z-index:30}
.kselect-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;height:40px;padding:0 12px;border:0;border-radius:12px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);color:#f5f6f8;font:inherit;font-size:14px;line-height:20px;font-weight:500;text-align:left;cursor:pointer;transition:background-color .3s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)}
.kselect-trigger:hover:not(:disabled){background:rgba(255,255,255,.1)}
.kselect.open .kselect-trigger,.kselect-trigger:focus-visible{outline:0;box-shadow:inset 0 0 0 1px rgba(255,194,26,.55),0 0 0 4px rgba(255,194,26,.12)}
.kselect-trigger:disabled{opacity:.5;cursor:not-allowed}
.kselect-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kselect-chevron{flex:none;color:rgba(245,246,248,.68);transition:transform .3s cubic-bezier(.22,1,.36,1)}
.kselect.open .kselect-chevron{transform:rotate(180deg)}
.kselect-list{position:absolute;left:0;top:calc(100% + 8px);min-width:100%;width:max-content;max-width:min(360px,80vw);max-height:320px;overflow-y:auto;margin:0;padding:8px;list-style:none;box-sizing:border-box;border-radius:16px;background:rgba(23,26,33,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 0 0 1px rgba(255,255,255,.07),0 24px 48px rgba(0,0,0,.5);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
.kselect-option{display:flex;align-items:center;gap:12px;min-height:36px;padding:8px 12px;border-radius:12px;color:rgba(245,246,248,.84);font-size:14px;line-height:20px;cursor:pointer;transition:background-color .2s cubic-bezier(.22,1,.36,1),color .2s cubic-bezier(.22,1,.36,1)}
.kselect-option.active{background:rgba(255,255,255,.07);color:#f5f6f8}
.kselect-option.selected{color:#ffd24d;font-weight:600}
.kselect-option.disabled{color:rgba(245,246,248,.34);cursor:not-allowed}
.kselect-label{flex:1 1 auto;white-space:nowrap}
.kselect-hint{flex:none;margin-left:auto;font-size:12px;line-height:16px;font-weight:500;color:rgba(245,246,248,.44)}
.kselect-check{flex:none;color:#ffc21a}
.kselect-hint+.kselect-check{margin-left:0}
@media(prefers-reduced-motion:reduce){.kselect-trigger,.kselect-chevron,.kselect-option{transition:none}}
</style>
