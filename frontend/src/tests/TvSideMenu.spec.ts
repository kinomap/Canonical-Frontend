import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { defineComponent, h, ref } from 'vue'
import TvSideMenu from '@/views/tv/TvSideMenu.vue'
import { TV_MENU_ITEMS, TV_MENU_SECTIONS, tvMenuIdForRoute, tvMenuIndex } from '@/views/tv/tvMenu'
import { useTvMenu, TV_SEARCH_NOTICE } from '@/views/tv/useTvMenu'
import { TV_EXIT_FALLBACK_MS, TV_LAUNCHER_URL, resetTvLauncherForTests, tvLauncher } from '@/views/tv/tvLauncher'
import { TV_ICONS, containsEmoji } from '@/views/tv/tvIcons'

describe('TV left menu: sections and routes', () => {
  it('splits the menu into online catalogue, torrent hub, mine & profile and system', () => {
    expect(TV_MENU_SECTIONS.map(s => s.title).filter(Boolean)).toEqual([
      'Каталог онлайн (Telegram)', 'Торрент хаб (4K & релизы)', 'Моё и профиль', 'Система',
    ])
    expect(TV_MENU_ITEMS.map(item => [item.section, item.label, item.to ?? null])).toEqual([
      ['top', 'Поиск', null],
      ['catalog', 'Главная', '/tv'],
      ['catalog', 'Фильмы онлайн', '/tv/movies'],
      ['catalog', 'Сериалы онлайн', '/tv/series'],
      ['catalog', 'Жанры каталога', '/tv/genres?source=catalog'],
      ['torrents', 'Торренты: Главная', '/tv/torrents'],
      ['torrents', 'Торрент-фильмы', '/tv/torrents/movies'],
      ['torrents', 'Торрент-сериалы', '/tv/torrents/series'],
      ['torrents', 'Торрент-жанры', '/tv/genres?source=torrents'],
      ['mine', 'Кинотека (История / Закладки)', '/tv/library'],
      ['mine', 'Профиль', '/tv/auth'],
      ['system', 'Выход в Launcher', null],
    ])
    expect(TV_MENU_ITEMS.at(-1)?.id).toBe('exit')
  })

  it('uses vector icons of the TV set, never emoji', () => {
    for (const item of TV_MENU_ITEMS) {
      expect(Object.keys(TV_ICONS)).toContain(item.icon)
      expect(containsEmoji(item.icon + item.label)).toBe(false)
    }
  })

  it('marks the active entry for every TV route', () => {
    expect(tvMenuIdForRoute('/tv')).toBe('home')
    expect(tvMenuIdForRoute('/tv/movies')).toBe('movies')
    expect(tvMenuIdForRoute('/tv/series')).toBe('series')
    expect(tvMenuIdForRoute('/tv/genres', { source: 'catalog' })).toBe('genres')
    expect(tvMenuIdForRoute('/tv/genres', { source: 'torrents' })).toBe('torrent-genres')
    expect(tvMenuIdForRoute('/tv/genres/catalog/drama')).toBe('genres')
    expect(tvMenuIdForRoute('/tv/genres/torrents/18')).toBe('torrent-genres')
    expect(tvMenuIdForRoute('/tv/torrents')).toBe('torrents')
    expect(tvMenuIdForRoute('/tv/torrents/movies')).toBe('torrent-movies')
    expect(tvMenuIdForRoute('/tv/torrents/series')).toBe('torrent-series')
    expect(tvMenuIdForRoute('/tv/library')).toBe('library')
    expect(tvMenuIdForRoute('/tv/auth')).toBe('profile')
    expect(tvMenuIdForRoute('/tv/details')).toBeNull()
  })
})

describe('TvSideMenu.vue', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })

  it('collapses to icons (96px) and opens with labels and headings (320px)', async () => {
    const wrapper = mount(TvSideMenu, { props: { open: false, focusedIndex: -1, activeIndex: tvMenuIndex('home') } })
    expect(wrapper.get('[data-testid="tv-menu"]').classes()).not.toContain('open')
    await wrapper.setProps({ open: true })
    expect(wrapper.get('[data-testid="tv-menu"]').classes()).toContain('open')
    expect(wrapper.findAll('.tv-menu-heading').map(el => el.text())).toEqual(TV_MENU_SECTIONS.map(s => s.title).filter(Boolean))
    expect(wrapper.text()).toContain('KINOSOTA TV')
  })

  it('gives every entry a remote key; headings never take the focus', () => {
    const wrapper = mount(TvSideMenu, { props: { open: true, focusedIndex: 3, activeIndex: 1 } })
    const keys = wrapper.findAll('[data-tv-key]').map(el => el.attributes('data-tv-key'))
    expect(keys).toEqual(TV_MENU_ITEMS.map((_, i) => `menu:${i}`))
    expect(wrapper.findAll('.tv-menu-heading').every(el => !el.attributes('data-tv-key'))).toBe(true)
    expect(wrapper.get('[data-testid="tv-menu-series"]').classes()).toContain('tv-focused')
    expect(wrapper.get('[data-testid="tv-menu-home"]').classes()).toContain('active')
    expect(wrapper.get('[data-testid="tv-menu-exit"]').text()).toContain('Выход в Launcher')
  })

  it('renders an inline SVG icon per entry, a glass panel with a scrim and a status card, without emoji', () => {
    const wrapper = mount(TvSideMenu, { props: { open: true, focusedIndex: -1, activeIndex: -1 } })
    expect(wrapper.findAll('.tv-menu-item svg.tv-icon')).toHaveLength(TV_MENU_ITEMS.length)
    expect(wrapper.get('[data-testid="tv-menu-exit"] svg').attributes('data-icon')).toBe('exit')
    expect(wrapper.find('.tv-menu-glass').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tv-menu-scrim"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="tv-menu-status"]').text()).toContain('Гость')
    expect(containsEmoji(wrapper.text())).toBe(false)
  })

  it('emits the index of the clicked entry', async () => {
    const wrapper = mount(TvSideMenu, { props: { open: true, focusedIndex: -1, activeIndex: -1 } })
    await wrapper.get('[data-testid="tv-menu-torrent-genres"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[tvMenuIndex('torrent-genres')]])
  })
})

describe('useTvMenu: menu entries on the remote', () => {
  let router: Router
  let notice: string

  const Harness = defineComponent({
    setup(_, { expose }) {
      const menu = useTvMenu(text => { notice = text })
      const active = ref(menu.activeIndex)
      expose({ open: menu.open, active })
      return () => h('div')
    },
  })

  beforeEach(async () => {
    notice = ''
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] })
    await router.push('/tv')
    await router.isReady()
  })

  afterEach(() => { vi.restoreAllMocks() })

  it.each(TV_MENU_ITEMS.filter(item => item.to && item.id !== 'home').map(item => [item.id, item.to!]))('%s opens %s', async (id, to) => {
    const wrapper = mount(Harness, { global: { plugins: [router] } })
    ;(wrapper.vm as unknown as { open: (i: number) => boolean }).open(tvMenuIndex(id as never))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(to)
  })

  it('«Поиск» shows a notice and stays on the screen', async () => {
    const wrapper = mount(Harness, { global: { plugins: [router] } })
    const opened = (wrapper.vm as unknown as { open: (i: number) => boolean }).open(tvMenuIndex('search'))
    expect(opened).toBe(false)
    expect(notice).toBe(TV_SEARCH_NOTICE)
    expect(router.currentRoute.value.fullPath).toBe('/tv')
  })

  it('«Выход в Launcher» leaves to the KINOSOTA launcher at once', () => {
    const exit = vi.spyOn(tvLauncher, 'exit').mockImplementation(() => {})
    const wrapper = mount(Harness, { global: { plugins: [router] } })
    ;(wrapper.vm as unknown as { open: (i: number) => boolean }).open(tvMenuIndex('exit'))
    expect(exit).toHaveBeenCalledTimes(1)
    expect(TV_LAUNCHER_URL).toBe('http://www.kinosota.devs.surf/')
  })
})

describe('tvLauncher.exit: back to MSX / Launcher, never a desktop page', () => {
  function fakeWindow(overrides: { length?: number; msx?: boolean; navigatesAway?: boolean } = {}) {
    const location = { href: 'https://watch.scenrix.com/tv', replace: vi.fn() }
    const win = {
      location,
      closed: false,
      history: { length: overrides.length ?? 1, go: vi.fn(() => { if (overrides.navigatesAway) location.href = 'http://www.kinosota.devs.surf/' }) },
      close: vi.fn(),
      TVXInteractionPlugin: overrides.msx ? { executeAction: vi.fn() } : undefined,
    }
    return win
  }

  beforeEach(() => { vi.useFakeTimers(); resetTvLauncherForTests(); sessionStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  it('asks MSX to go back, rewinds the history to the entry that opened /tv and closes the window', () => {
    const win = fakeWindow({ length: 4, msx: true, navigatesAway: true })
    tvLauncher.exit(win as never)
    expect(win.TVXInteractionPlugin!.executeAction).toHaveBeenCalledWith('back')
    expect(win.history.go).toHaveBeenCalledWith(-3)
    expect(win.close).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TV_EXIT_FALLBACK_MS)
    expect(win.location.replace).not.toHaveBeenCalled()
  })

  it('falls back to the launcher root when the host keeps the page open', () => {
    const win = fakeWindow({ length: 1 })
    tvLauncher.exit(win as never)
    expect(win.history.go).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TV_EXIT_FALLBACK_MS)
    expect(win.location.replace).toHaveBeenCalledWith('http://www.kinosota.devs.surf/')
  })

  it('clears the TV focus memory and ignores a second exit while one is running', () => {
    sessionStorage.setItem('kinosota:tv-focus:home', '{}')
    sessionStorage.setItem('other', '1')
    const win = fakeWindow()
    tvLauncher.exit(win as never)
    tvLauncher.exit(win as never)
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('kinosota:tv-focus:home')).toBeNull()
    expect(sessionStorage.getItem('other')).toBe('1')
    vi.advanceTimersByTime(TV_EXIT_FALLBACK_MS)
    expect(win.location.replace).toHaveBeenCalledTimes(1)
  })
})
