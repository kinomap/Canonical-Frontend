<script setup lang="ts">
/**
 * Leanback Navigation 2.0 of the TV layer. Collapsed: a 96px glass rail with vector icons.
 * ArrowLeft from the content opens it to 340px over the content (overlay, the grid never moves):
 * acrylic glass (blur 24px), a scrim over the rest of the screen, labels, section headings and a status card.
 * Only transform / opacity are animated (GPU), section headings never take the focus.
 */
import { computed, nextTick, ref, watch } from 'vue'
import TvIcon from './TvIcon.vue'
import { TV_MENU_ITEMS, TV_MENU_SECTIONS } from './tvMenu'

const props = defineProps<{ open: boolean; focusedIndex: number; activeIndex: number }>()
const emit = defineEmits<{ (e: 'select', index: number): void }>()

const list = ref<HTMLElement | null>(null)

const sections = computed(() => TV_MENU_SECTIONS
  .map(section => ({
    ...section,
    items: TV_MENU_ITEMS
      .map((item, index) => ({ item, index }))
      .filter(entry => entry.item.section === section.id),
  }))
  .filter(section => section.items.length > 0))

function readSignedIn(): boolean {
  try { return Boolean(localStorage.getItem('tg_stream_access_token')) } catch { return false }
}
const signedIn = ref(readSignedIn())
watch(() => props.open, (open) => { if (open) signedIn.value = readSignedIn() })

/** Keep the focused entry on screen on short TV viewports. */
watch(() => props.focusedIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  const el = list.value?.querySelector<HTMLElement>(`[data-tv-key="menu:${index}"]`)
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <nav class="tv-menu" :class="{ open }" aria-label="Меню ТВ" data-testid="tv-menu">
    <div class="tv-menu-scrim" aria-hidden="true" data-testid="tv-menu-scrim" />
    <div class="tv-menu-glass" aria-hidden="true" />

    <div class="tv-menu-brand">
      <span class="tv-menu-logo" aria-hidden="true">K</span>
      <span class="tv-menu-brand-name">KINOSOTA TV</span>
    </div>

    <div ref="list" class="tv-menu-list">
      <section
        v-for="section in sections"
        :key="section.id"
        class="tv-menu-section"
        :data-testid="`tv-menu-section-${section.id}`"
      >
        <h3 v-if="section.title" class="tv-menu-heading" aria-hidden="true">{{ section.title }}</h3>
        <ul>
          <li v-for="{ item, index } in section.items" :key="item.id">
            <button
              type="button"
              class="tv-menu-item"
              :class="{ 'tv-focused': focusedIndex === index, active: activeIndex === index, exit: item.id === 'exit' }"
              :data-tv-key="`menu:${index}`"
              :data-testid="`tv-menu-${item.id}`"
              :aria-label="item.label"
              :aria-current="activeIndex === index ? 'page' : undefined"
              @click="emit('select', index)"
            >
              <span class="tv-menu-icon"><TvIcon :name="item.icon" size="30" /></span>
              <span class="tv-menu-label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div class="tv-menu-status" :class="{ online: signedIn }" data-testid="tv-menu-status">
      <span class="tv-menu-status-dot" aria-hidden="true" />
      <span class="tv-menu-status-text">
        <strong>{{ signedIn ? 'Профиль подключён' : 'Гость' }}</strong>
        <small>{{ signedIn ? 'Этот телевизор вошёл в KINOSOTA' : 'Вход по QR-коду в «Профиле»' }}</small>
      </span>
    </div>
  </nav>
</template>

<style scoped>
.tv-menu {
  --rail: 96px;
  --panel: 340px;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  width: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 2vh;
  padding: 3vh 14px 2.4vh;
  box-sizing: border-box;
  pointer-events: none;
}

/* Scrim over the content while the menu is open (no layout change behind it). */
.tv-menu-scrim {
  position: fixed;
  inset: 0;
  z-index: -2;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.28s ease;
  will-change: opacity;
}

/* Acrylic glass: the full panel slides in from the rail with transform only. */
.tv-menu-glass {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, rgba(14, 17, 26, 0.92) 0%, rgba(8, 10, 15, 0.92) 100%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  backdrop-filter: blur(24px) saturate(140%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset -1px 0 0 rgba(0, 210, 255, 0.06);
  transform: translate3d(calc(var(--rail) - var(--panel)), 0, 0);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease;
  will-change: transform;
}

.tv-menu.open .tv-menu-glass {
  transform: translate3d(0, 0, 0);
  box-shadow: 30px 0 80px rgba(0, 0, 0, 0.55), inset -1px 0 0 rgba(0, 210, 255, 0.12);
}

.tv-menu.open .tv-menu-scrim {
  opacity: 1;
}

.tv-menu-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
  margin: 0 6px;
  white-space: nowrap;
}

.tv-menu-logo {
  width: 56px;
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(145deg, #ffe58a 0%, #f4d45e 45%, #c99a1c 100%);
  box-shadow: 0 0 24px rgba(244, 212, 94, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  color: #0d0e12;
  font-size: 30px;
  font-weight: 900;
}

.tv-menu-brand-name,
.tv-menu-label,
.tv-menu-heading,
.tv-menu-status-text {
  opacity: 0;
  transform: translate3d(-12px, 0, 0);
  transition: opacity 0.2s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.tv-menu-brand-name {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: #fff;
}

.tv-menu-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.tv-menu-list::-webkit-scrollbar {
  display: none;
}

.tv-menu-section {
  padding: 0.6vh 0;
}

.tv-menu-section + .tv-menu-section {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tv-menu-section ul {
  display: flex;
  flex-direction: column;
  gap: 0.4vh;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tv-menu-heading {
  height: 0;
  margin: 0;
  padding: 0 15px;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.tv-menu-item {
  width: calc(var(--rail) - 28px);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border: 2px solid transparent;
  border-radius: 16px;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: clamp(16px, 1vw, 26px);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.18s ease, color 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.tv-menu.open .tv-menu-item {
  width: 100%;
}

.tv-menu-icon {
  width: 30px;
  height: 30px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.tv-menu-item.active {
  color: #f4d45e;
  background: rgba(244, 212, 94, 0.08);
}

.tv-menu-item.active .tv-menu-icon {
  filter: drop-shadow(0 0 6px rgba(244, 212, 94, 0.55));
}

.tv-menu-item:hover,
.tv-menu-item.tv-focused {
  color: #fff;
  background: linear-gradient(90deg, rgba(0, 210, 255, 0.2), rgba(0, 210, 255, 0.06));
  border-color: rgba(0, 210, 255, 0.7);
  box-shadow: 0 0 22px rgba(0, 210, 255, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transform: scale(1.03);
}

.tv-menu-item.tv-focused .tv-menu-icon {
  transform: scale(1.12);
  filter: drop-shadow(0 0 8px rgba(0, 210, 255, 0.95)) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
}

.tv-menu-item.exit.tv-focused {
  border-color: rgba(255, 99, 99, 0.8);
  background: linear-gradient(90deg, rgba(255, 99, 99, 0.2), rgba(255, 99, 99, 0.06));
  box-shadow: 0 0 22px rgba(255, 99, 99, 0.32);
}

.tv-menu-item.exit.tv-focused .tv-menu-icon {
  filter: drop-shadow(0 0 8px rgba(255, 99, 99, 0.95));
}

.tv-menu-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tv-menu.open .tv-menu-label,
.tv-menu.open .tv-menu-brand-name,
.tv-menu.open .tv-menu-heading,
.tv-menu.open .tv-menu-status-text {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.tv-menu.open .tv-menu-heading {
  height: auto;
  padding: 0.8vh 16px 0.4vh;
}

.tv-menu-status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 6px;
  padding: 10px 18px;
  border-radius: 16px;
  white-space: nowrap;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.tv-menu.open .tv-menu-status {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.tv-menu-status-dot {
  width: 12px;
  height: 12px;
  flex: none;
  margin: 0 7px;
  border-radius: 50%;
  background: #64748b;
}

.tv-menu-status.online .tv-menu-status-dot {
  background: #34d399;
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.8);
}

.tv-menu-status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tv-menu-status-text strong {
  color: #e5e7eb;
  font-size: 15px;
}

.tv-menu-status-text small {
  color: #64748b;
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .tv-menu-glass,
  .tv-menu-scrim,
  .tv-menu-item,
  .tv-menu-label,
  .tv-menu-heading,
  .tv-menu-brand-name,
  .tv-menu-status-text {
    transition: none;
  }
}
</style>
