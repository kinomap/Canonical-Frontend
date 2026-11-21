import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, type PropType } from 'vue'
import { resolveTvKey, useTvNavigation, type TvRow, type TvSelectTarget } from '@/composables/useTvNavigation'

const scrollIntoView = vi.fn()

function press(key: string, extra: { keyCode?: number; code?: string; target?: EventTarget } = {}) {
  const event = new KeyboardEvent('keydown', { key, code: extra.code ?? '', bubbles: true, cancelable: true })
  if (extra.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { get: () => extra.keyCode })
  ;(extra.target ?? window).dispatchEvent(event)
  return event
}

const Harness = defineComponent({
  props: {
    initialRows: { type: Array as PropType<TvRow[]>, required: true },
    memoryKey: { type: String, default: undefined },
    onSelect: { type: Function as PropType<(t: TvSelectTarget) => void>, default: undefined },
    onBack: { type: Function as PropType<() => boolean | void>, default: undefined },
  },
  setup(props) {
    const rows = ref<TvRow[]>(props.initialRows)
    const root = ref<HTMLElement | null>(null)
    const nav = useTvNavigation({
      rows,
      menuSize: 3,
      memoryKey: props.memoryKey,
      root,
      onSelect: target => props.onSelect?.(target),
      onBack: () => props.onBack?.(),
    })
    return { nav, rows, root }
  },
  render() {
    const nav = this.nav
    return h('div', { ref: 'root' }, [
      h('nav', [0, 1, 2].map(i => h('button', { 'data-tv-key': `menu:${i}`, class: { 'tv-focused': nav.isMenuFocused(i) } }, `menu${i}`))),
      h('input', { 'data-testid': 'field' }),
      ...this.rows.map(row => h('section', { 'data-row': row.id }, Array.from({ length: row.size }, (_, i) =>
        h('button', { 'data-tv-key': `${row.id}:${i}`, class: { 'tv-focused': nav.isFocused(row.id, i) } }, `${row.id}${i}`)))),
    ])
  },
})

const ROWS: TvRow[] = [{ id: 'hero', size: 1 }, { id: 'popular', size: 4 }, { id: 'empty', size: 0 }, { id: 'series', size: 3 }]

function mountNav(props: Record<string, unknown> = {}) {
  return mount(Harness, { props: { initialRows: ROWS, ...props }, attachTo: document.body })
}

function focusedText(wrapper: VueWrapper) {
  return wrapper.findAll('.tv-focused').map(el => el.text())
}

describe('resolveTvKey', () => {
  it('maps arrows, OK, Back and media keys', () => {
    expect(resolveTvKey({ key: 'ArrowUp', code: '', keyCode: 0 })).toBe('up')
    expect(resolveTvKey({ key: 'ArrowDown', code: '', keyCode: 0 })).toBe('down')
    expect(resolveTvKey({ key: 'ArrowLeft', code: '', keyCode: 0 })).toBe('left')
    expect(resolveTvKey({ key: 'ArrowRight', code: '', keyCode: 0 })).toBe('right')
    expect(resolveTvKey({ key: 'Enter', code: '', keyCode: 13 })).toBe('select')
    expect(resolveTvKey({ key: 'Enter', code: 'NumpadEnter', keyCode: 13 })).toBe('select')
    expect(resolveTvKey({ key: 'Escape', code: '', keyCode: 27 })).toBe('back')
    expect(resolveTvKey({ key: 'Backspace', code: '', keyCode: 8 })).toBe('back')
    expect(resolveTvKey({ key: 'MediaPlayPause', code: '', keyCode: 0 })).toBe('playPause')
    expect(resolveTvKey({ key: 'MediaPlay', code: '', keyCode: 0 })).toBe('play')
    expect(resolveTvKey({ key: 'MediaPause', code: '', keyCode: 0 })).toBe('pause')
    expect(resolveTvKey({ key: 'MediaFastForward', code: '', keyCode: 0 })).toBe('fastForward')
    expect(resolveTvKey({ key: 'MediaRewind', code: '', keyCode: 0 })).toBe('rewind')
  })

  it('recognises the Samsung (10009), LG (461), Android TV (4), HbbTV (196), Netcast (145) Back buttons and legacy key codes', () => {
    expect(resolveTvKey({ key: 'XF86Back', code: '', keyCode: 10009 })).toBe('back')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 461 })).toBe('back')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 196 })).toBe('back')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 145 })).toBe('back')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 4 })).toBe('back')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 39 })).toBe('right')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 13 })).toBe('select')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 29443 })).toBe('select')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 195 })).toBe('select')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 23 })).toBe('select')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 66 })).toBe('select')
    expect(resolveTvKey({ key: 'Unidentified', code: '', keyCode: 32 })).toBe('select')
    expect(resolveTvKey({ key: 'a', code: 'KeyA', keyCode: 65 })).toBeNull()
  })
})

describe('useTvNavigation', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    sessionStorage.clear()
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('starts on the first row and marks exactly one element .tv-focused', async () => {
    wrapper = mountNav()
    await nextTick()
    expect(focusedText(wrapper)).toEqual(['hero0'])
  })

  it('moves with the arrows, skips empty rows and remembers the column of each row', async () => {
    wrapper = mountNav()
    press('ArrowDown'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['popular0'])
    press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['popular2'])
    press('ArrowDown'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['series0'])
    press('ArrowDown'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['series0'])
    press('ArrowUp'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['popular2'])
    press('ArrowRight'); press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['popular3'])
  })

  it('prevents the default page scroll for handled keys only', () => {
    wrapper = mountNav()
    expect(press('ArrowDown').defaultPrevented).toBe(true)
    expect(press('a').defaultPrevented).toBe(false)
  })

  it('gives DOM focus and centres the focused element smoothly', async () => {
    wrapper = mountNav()
    press('ArrowDown')
    await nextTick(); await nextTick()
    const card = wrapper.get('[data-tv-key="popular:0"]').element
    expect(document.activeElement).toBe(card)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(card)
  })

  it('opens the menu with ArrowLeft from the leftmost card and returns to the same card', async () => {
    wrapper = mountNav()
    const vm = wrapper.vm as any
    press('ArrowDown'); press('ArrowRight'); press('ArrowLeft'); await nextTick()
    expect(vm.nav.menuOpen.value).toBe(false)
    expect(focusedText(wrapper)).toEqual(['popular0'])

    press('ArrowLeft'); await nextTick()
    expect(vm.nav.menuOpen.value).toBe(true)
    expect(focusedText(wrapper)).toEqual(['menu0'])
    press('ArrowDown'); press('ArrowDown'); press('ArrowDown'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['menu2'])

    press('ArrowRight'); await nextTick()
    expect(vm.nav.menuOpen.value).toBe(false)
    expect(focusedText(wrapper)).toEqual(['popular0'])
  })

  it('selects with Enter / NumpadEnter in the content and in the menu', async () => {
    const onSelect = vi.fn()
    wrapper = mountNav({ onSelect })
    press('ArrowDown'); press('ArrowRight'); press('Enter')
    expect(onSelect).toHaveBeenLastCalledWith({ area: 'content', rowId: 'popular', index: 1 })
    press('ArrowLeft'); press('ArrowLeft'); press('ArrowDown'); press('Enter', { code: 'NumpadEnter' })
    expect(onSelect).toHaveBeenLastCalledWith({ area: 'menu', index: 1 })
    expect((wrapper.vm as any).nav.menuOpen.value).toBe(false)
  })

  it('Back closes the open menu first, then asks the screen', async () => {
    const onBack = vi.fn(() => true)
    wrapper = mountNav({ onBack })
    press('ArrowLeft'); await nextTick()
    expect((wrapper.vm as any).nav.menuOpen.value).toBe(true)
    press('Escape')
    expect((wrapper.vm as any).nav.menuOpen.value).toBe(false)
    expect(onBack).not.toHaveBeenCalled()

    expect(press('XF86Back', { keyCode: 10009 }).defaultPrevented).toBe(true)
    expect(press('Unidentified', { keyCode: 461 }).defaultPrevented).toBe(true)
    expect(press('Backspace').defaultPrevented).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(3)
  })

  it('leaves an unhandled Back to the TV (no preventDefault)', () => {
    wrapper = mountNav({ onBack: () => false })
    expect(press('Escape').defaultPrevented).toBe(false)
  })

  it('keeps arrows and Backspace for text fields', async () => {
    const onBack = vi.fn(() => true)
    wrapper = mountNav({ onBack })
    const field = wrapper.get('[data-testid="field"]').element
    press('ArrowRight', { target: field })
    press('Backspace', { target: field })
    await nextTick()
    expect(focusedText(wrapper)).toEqual(['hero0'])
    expect(onBack).not.toHaveBeenCalled()
  })

  it('memory return: the same card is focused again after leaving and coming back', async () => {
    wrapper = mountNav({ memoryKey: 'spec' })
    press('ArrowDown'); press('ArrowDown'); press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['series2'])
    wrapper.unmount()

    wrapper = mountNav({ memoryKey: 'spec' })
    await nextTick()
    expect(focusedText(wrapper)).toEqual(['series2'])
    press('ArrowUp'); await nextTick()
    expect(focusedText(wrapper)).toEqual(['popular0'])
  })

  it('memory return waits for a shelf that loads later', async () => {
    sessionStorage.setItem('kinosota:tv-focus:late', JSON.stringify({ rowId: 'series', cols: { series: 1 } }))
    wrapper = mount(Harness, { props: { initialRows: [{ id: 'hero', size: 1 }, { id: 'series', size: 0 }], memoryKey: 'late' }, attachTo: document.body })
    await nextTick()
    expect(focusedText(wrapper)).toEqual(['hero0'])
    ;(wrapper.vm as any).rows = [{ id: 'hero', size: 1 }, { id: 'series', size: 3 }]
    await nextTick()
    expect(focusedText(wrapper)).toEqual(['series1'])
  })

  it('stops listening after unmount', async () => {
    const onSelect = vi.fn()
    wrapper = mountNav({ onSelect })
    wrapper.unmount()
    wrapper = undefined
    press('Enter')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
