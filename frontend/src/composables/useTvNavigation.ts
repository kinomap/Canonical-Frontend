/**
 * D-pad (remote control) engine of the KINOSOTA TV layer (/tv).
 *
 * The screen is a model, not a DOM scan: an optional left menu (a vertical list) plus
 * content rows (hero, shelves), each row a horizontal list of `size` items. Every
 * focusable element carries `data-tv-key="<rowId>:<index>"` (or `menu:<index>`); the
 * engine moves the focus in the model, the template binds `.tv-focused` via
 * `isFocused()`, and the element gets DOM focus + a smooth `scrollIntoView` centring.
 *
 * Memory return: the focused row and the last column of every row are kept in
 * sessionStorage under `memoryKey`, so coming back from a title page lands on the
 * same card of the same shelf.
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export type TvAction =
  | 'up' | 'down' | 'left' | 'right' | 'select' | 'back'
  | 'playPause' | 'play' | 'pause' | 'fastForward' | 'rewind'

export type TvMediaAction = Extract<TvAction, 'playPause' | 'play' | 'pause' | 'fastForward' | 'rewind'>

/** Hardware "Back" key codes: Samsung Tizen (10009), LG webOS (461), HbbTV / MSX (196), Netcast (145), Samsung Orsay (88, 45), Android TV (4), Escape (27), Backspace (8). */
export const TV_BACK_KEYCODES = [10009, 461, 196, 145, 88, 45, 4, 27, 8] as const

const KEY_ACTIONS: Record<string, TvAction> = {
  ArrowUp: 'up', Up: 'up',
  ArrowDown: 'down', Down: 'down',
  ArrowLeft: 'left', Left: 'left',
  ArrowRight: 'right', Right: 'right',
  Enter: 'select', NumpadEnter: 'select', Select: 'select',
  Escape: 'back', Esc: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back', Back: 'back',
  MediaPlayPause: 'playPause', MediaPlay: 'play', MediaPause: 'pause',
  MediaFastForward: 'fastForward', MediaRewind: 'rewind',
}

/** Legacy TV browsers report `key: "Unidentified"`: fall back to the numeric codes. */
const KEYCODE_ACTIONS: Record<number, TvAction> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  5: 'right', 213: 'right', 206: 'right',
  214: 'left', 205: 'left',
  211: 'up', 203: 'up', 29460: 'up',
  212: 'down', 204: 'down', 29461: 'down',
  13: 'select', 29443: 'select', 195: 'select', 23: 'select', 66: 'select', 32: 'select',
  27: 'back', 8: 'back', 10009: 'back', 461: 'back', 196: 'back', 145: 'back', 88: 'back', 45: 'back', 4: 'back',
  179: 'playPause', 10252: 'playPause', 415: 'play', 19: 'pause', 417: 'fastForward', 412: 'rewind',
}

export function resolveTvKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'> & { which?: number }): TvAction | null {
  if (event.code === 'NumpadEnter') return 'select'
  const code = event.keyCode || event.which || 0
  if ((TV_BACK_KEYCODES as readonly number[]).includes(code as (typeof TV_BACK_KEYCODES)[number])) return 'back'
  const keyAction = event.key && event.key !== 'Unidentified' ? KEY_ACTIONS[event.key] : null
  return keyAction ?? KEYCODE_ACTIONS[code] ?? null
}

export interface TvRow { id: string; size: number }

export type TvSelectTarget =
  | { area: 'menu'; index: number }
  | { area: 'content'; rowId: string; index: number }

export interface TvNavigationOptions {
  rows: Ref<TvRow[]>
  /** Number of items in the left menu; 0 disables the menu. */
  menuSize?: number
  /** sessionStorage key for the focus memory; omit to disable it. */
  memoryKey?: string
  onSelect?: (target: TvSelectTarget) => void
  /** Return true when the Back press was handled (then its default is prevented). */
  onBack?: () => boolean | void
  onMedia?: (action: TvMediaAction) => void
  /** Container searched for `data-tv-key` elements; defaults to `document`. */
  root?: Ref<HTMLElement | null>
  /** Attach the keydown listener on mount (default true). */
  listen?: boolean
}

interface StoredFocus { rowId: string; cols: Record<string, number> }

const STORAGE_PREFIX = 'kinosota:tv-focus:'

function readMemory(key?: string): StoredFocus | null {
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed.rowId === 'string' && parsed.cols && typeof parsed.cols === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeMemory(key: string | undefined, value: StoredFocus) {
  if (!key) return
  try { sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)) } catch { /* storage full or disabled */ }
}

export function clearTvFocusMemory(key: string) {
  try { sessionStorage.removeItem(STORAGE_PREFIX + key) } catch { /* ignore */ }
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

export function useTvNavigation(options: TvNavigationOptions) {
  const menuSize = options.menuSize ?? 0
  const memory = readMemory(options.memoryKey)

  const area = ref<'menu' | 'content'>('content')
  const menuOpen = ref(false)
  const menuIndex = ref(0)
  const activeRowId = ref<string>(memory?.rowId ?? options.rows.value[0]?.id ?? '')
  const cols = ref<Record<string, number>>({ ...(memory?.cols ?? {}) })

  const rows = computed(() => options.rows.value)
  const filledRows = computed(() => rows.value.filter(row => row.size > 0))

  /** The row really holding the focus: the remembered one once it has items, else the first filled row. */
  const currentRow = computed<TvRow | null>(() => {
    const active = rows.value.find(row => row.id === activeRowId.value)
    if (active && active.size > 0) return active
    return filledRows.value[0] ?? null
  })

  function colOf(row: TvRow): number {
    return Math.max(0, Math.min(cols.value[row.id] ?? 0, row.size - 1))
  }

  const focusKey = computed<string | null>(() => {
    if (area.value === 'menu') return `menu:${menuIndex.value}`
    const row = currentRow.value
    return row ? `${row.id}:${colOf(row)}` : null
  })

  function isFocused(rowId: string, index: number): boolean {
    return focusKey.value === `${rowId}:${index}`
  }

  function isMenuFocused(index: number): boolean {
    return focusKey.value === `menu:${index}`
  }

  function setRow(row: TvRow) {
    activeRowId.value = row.id
  }

  function setCol(row: TvRow, col: number) {
    cols.value = { ...cols.value, [row.id]: Math.max(0, Math.min(col, row.size - 1)) }
  }

  function openMenu() {
    if (!menuSize) return false
    menuOpen.value = true
    area.value = 'menu'
    return true
  }

  function closeMenu() {
    menuOpen.value = false
    area.value = 'content'
  }

  /** Put the focus on a row (and optionally a column), closing the menu. */
  function focusRow(rowId: string, col?: number) {
    const row = rows.value.find(item => item.id === rowId)
    if (!row) return
    activeRowId.value = row.id
    if (col !== undefined && row.size > 0) setCol(row, col)
    closeMenu()
  }

  function moveVertical(step: 1 | -1): boolean {
    const row = currentRow.value
    if (!row) return false
    const list = filledRows.value
    const index = list.findIndex(item => item.id === row.id)
    const next = list[index + step]
    if (!next) return false
    setRow(next)
    return true
  }

  function handle(action: TvAction): boolean {
    if (action === 'playPause' || action === 'play' || action === 'pause' || action === 'fastForward' || action === 'rewind') {
      if (!options.onMedia) return false
      options.onMedia(action)
      return true
    }

    if (area.value === 'menu') {
      switch (action) {
        case 'up':
          menuIndex.value = Math.max(0, menuIndex.value - 1)
          return true
        case 'down':
          menuIndex.value = Math.min(menuSize - 1, menuIndex.value + 1)
          return true
        case 'right':
        case 'back':
          closeMenu()
          return true
        case 'left':
          return true
        case 'select': {
          const index = menuIndex.value
          closeMenu()
          options.onSelect?.({ area: 'menu', index })
          return true
        }
      }
      return false
    }

    const row = currentRow.value
    switch (action) {
      case 'left':
        if (row && colOf(row) > 0) { setCol(row, colOf(row) - 1); return true }
        return openMenu()
      case 'right':
        if (row && colOf(row) < row.size - 1) { setCol(row, colOf(row) + 1); return true }
        return Boolean(row)
      case 'up':
        return moveVertical(-1) || Boolean(row)
      case 'down':
        return moveVertical(1) || Boolean(row)
      case 'select':
        if (!row) return false
        options.onSelect?.({ area: 'content', rowId: row.id, index: colOf(row) })
        return true
      case 'back':
        return options.onBack?.() === true
    }
    return false
  }

  function onKeydown(event: KeyboardEvent) {
    const action = resolveTvKey(event)
    if (!action) return
    // Text fields (on-screen search) keep their own caret / delete keys.
    if (isTextField(event.target) && (action === 'left' || action === 'right' || event.key === 'Backspace')) return
    if (handle(action)) event.preventDefault()
  }

  function findElement(key: string): HTMLElement | null {
    const scope: ParentNode | null = options.root?.value ?? (typeof document !== 'undefined' ? document : null)
    return scope?.querySelector<HTMLElement>(`[data-tv-key="${key}"]`) ?? null
  }

  /** Give DOM focus to the model focus and centre it smoothly on screen. */
  async function syncDom() {
    await nextTick()
    const key = focusKey.value
    if (!key) return
    const el = findElement(key)
    if (!el) return
    if (typeof el.focus === 'function') el.focus({ preventScroll: true })
    if (area.value === 'content' && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  }

  watch(focusKey, () => { void syncDom() })

  watch([activeRowId, cols], () => {
    writeMemory(options.memoryKey, { rowId: currentRow.value?.id ?? activeRowId.value, cols: cols.value })
  }, { deep: true })

  if (getCurrentInstance()) {
    onMounted(() => {
      if (options.listen !== false) window.addEventListener('keydown', onKeydown)
      void syncDom()
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeydown)
    })
  }

  return {
    area,
    menuOpen,
    menuIndex,
    focusKey,
    currentRow,
    isFocused,
    isMenuFocused,
    focusRow,
    openMenu,
    closeMenu,
    handle,
    onKeydown,
    syncDom,
  }
}
