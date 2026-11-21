<script setup lang="ts">
import { TV_MENU_ITEMS } from './tvMenu'

defineProps<{ open: boolean; focusedIndex: number; activeIndex: number }>()
const emit = defineEmits<{ (e: 'select', index: number): void }>()
</script>

<template>
  <nav class="tv-menu" :class="{ open }" aria-label="Меню ТВ" data-testid="tv-menu">
    <div class="tv-menu-brand" aria-hidden="true">K</div>
    <ul class="tv-menu-list">
      <li v-for="(item, index) in TV_MENU_ITEMS" :key="item.id">
        <button
          type="button"
          class="tv-menu-item"
          :class="{ 'tv-focused': focusedIndex === index, active: activeIndex === index }"
          :data-tv-key="`menu:${index}`"
          :data-testid="`tv-menu-${item.id}`"
          :aria-label="item.label"
          @click="emit('select', index)"
        >
          <component :is="item.icon" :size="30" aria-hidden="true" />
          <span class="tv-menu-label">{{ item.label }}</span>
        </button>
      </li>
    </ul>
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
  align-items: stretch;
  gap: 4vh;
  padding: 4vh 14px;
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
  width: 56px;
  height: 56px;
  margin: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #f4d45e;
  color: #0d0e12;
  font-size: 30px;
  font-weight: 900;
}

.tv-menu-list {
  display: flex;
  flex-direction: column;
  gap: 1.2vh;
  margin: auto 0;
  padding: 0;
  list-style: none;
}

.tv-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 15px;
  border: 3px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: clamp(18px, 1.2vw, 30px);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.tv-menu-item.active {
  color: #f4d45e;
}

.tv-menu-item:hover,
.tv-menu-item.tv-focused {
  color: #fff;
  background: rgba(0, 210, 255, 0.14);
}

.tv-menu-label {
  opacity: 0;
  transition: opacity 0.18s ease;
}

.tv-menu.open .tv-menu-label {
  opacity: 1;
}
</style>
