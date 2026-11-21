<script setup lang="ts">
/**
 * Leanback sidebar of the TV layer: 96px icons while the focus is on the content,
 * 320px with labels and section headings once ArrowLeft opens it. Section headings never take the focus.
 */
import { computed, nextTick, ref, watch } from 'vue'
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
              <span class="tv-menu-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="tv-menu-label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </nav>
</template>

<style scoped>
.tv-menu {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 2vh;
  padding: 3vh 14px;
  background: linear-gradient(90deg, rgba(7, 8, 11, 0.96) 60%, rgba(7, 8, 11, 0));
  transition: width 0.22s ease, background 0.22s ease;
  overflow: hidden;
}

.tv-menu.open {
  width: 320px;
  background: rgba(7, 8, 11, 0.97);
  box-shadow: 24px 0 60px rgba(0, 0, 0, 0.55);
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
  border-radius: 14px;
  background: #f4d45e;
  color: #0d0e12;
  font-size: 30px;
  font-weight: 900;
}

.tv-menu-brand-name {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: #fff;
  opacity: 0;
  transition: opacity 0.18s ease;
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
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
  color: #6b7280;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.tv-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 15px;
  border: 3px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: clamp(16px, 1vw, 26px);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.tv-menu-icon {
  width: 30px;
  flex: none;
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.tv-menu-item.active {
  color: #f4d45e;
  background: rgba(244, 212, 94, 0.08);
}

.tv-menu-item:hover,
.tv-menu-item.tv-focused {
  color: #fff;
  background: rgba(0, 210, 255, 0.14);
  border-color: rgba(0, 210, 255, 0.7);
  box-shadow: 0 0 18px rgba(0, 210, 255, 0.35);
}

.tv-menu-item.exit.tv-focused {
  border-color: rgba(255, 99, 99, 0.8);
  background: rgba(255, 99, 99, 0.14);
  box-shadow: 0 0 18px rgba(255, 99, 99, 0.35);
}

.tv-menu-label {
  opacity: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.18s ease;
}

.tv-menu.open .tv-menu-label,
.tv-menu.open .tv-menu-brand-name,
.tv-menu.open .tv-menu-heading {
  opacity: 1;
}

.tv-menu.open .tv-menu-heading {
  height: auto;
  padding: 0.8vh 15px 0.4vh;
}
</style>
