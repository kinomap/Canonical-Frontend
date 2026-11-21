import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { defineComponent, h, ref } from 'vue'
import TvSideMenu from '@/views/tv/TvSideMenu.vue'
import { TV_MENU_ITEMS, TV_MENU_SECTIONS, tvMenuIdForRoute, tvMenuIndex } from '@/views/tv/tvMenu'
import { useTvMenu, TV_SEARCH_NOTICE } from '@/views/tv/useTvMenu'
import { TV_LAUNCHER_URL, tvLauncher } from '@/views/tv/tvLauncher'

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
    expect(TV_LAUNCHER_URL).toBe('https://watch.scenrix.com/launcher')
  })

  it('tvLauncher.exit goes to the launcher URL', () => {
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } })
    tvLauncher.exit()
    expect(assign).toHaveBeenCalledWith('https://watch.scenrix.com/launcher')
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })
})
