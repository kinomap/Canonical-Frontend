/** Shared behaviour of the TV left menu on every TV screen: routing, «active» entry, launcher exit. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TV_MENU_ITEMS, tvMenuIdForRoute, tvMenuIndex } from './tvMenu'
import { exitToLauncher } from './tvLauncher'

export const TV_SEARCH_NOTICE = 'Поиск с экранной клавиатурой скоро появится'

export function useTvMenu(showNotice: (text: string) => void = () => {}) {
  const router = useRouter()
  const route = useRoute()

  const activeIndex = computed(() => {
    const id = tvMenuIdForRoute(route.path, route.query)
    return id ? tvMenuIndex(id) : -1
  })

  /** Runs a menu entry. Returns false when it stayed on the current screen. */
  function open(index: number): boolean {
    const item = TV_MENU_ITEMS[index]
    if (!item) return false
    if (item.id === 'search') { showNotice(TV_SEARCH_NOTICE); return false }
    if (item.id === 'exit') { exitToLauncher(); return true }
    if (!item.to) return false
    if (router.currentRoute.value.fullPath === item.to) return false
    void router.push(item.to)
    return true
  }

  return { items: TV_MENU_ITEMS, activeIndex, open }
}
