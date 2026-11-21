import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  getHomeCollections: vi.fn(),
  listSeries: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { getHomeCollections: api.getHomeCollections, listSeries: api.listSeries },
  adRequest: vi.fn(),
}))
vi.mock('@/api/torrents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/torrents')>()
  return { ...actual, torrentsApi: { list: api.list } }
})

import TvHomeView from '@/views/tv/TvHomeView.vue'

const movie = (id: string, title: string) => ({ id, title, original_title: '', year: 2023, poster: null, rating: 7.5, runtime: 100, quality: null, status: 'ready', genres: [] })
const torrent = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  tmdb_id: id, kind: 'movie', title, original_title: '', year: 2025, overview: '', poster: null, backdrop: null, rating: 8.1, playback_available: false, ...extra,
})

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let router: Router
let wrapper: VueWrapper | undefined

async function mountHome() {
  wrapper = mount(TvHomeView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  await nextTick()
  return wrapper
}

const focused = () => (wrapper as VueWrapper).findAll('.tv-focused').map(el => el.attributes('data-tv-key'))

describe('TvHomeView.vue', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    api.list.mockReset().mockImplementation((filters: { collection?: string }) => Promise.resolve(filters.collection === 'spotlight'
      ? { items: [torrent(550, 'Бойцовский клуб', { genres: [{ id: 18, name: 'драма' }] })], refresh_at: new Date(Date.now() + 3600_000).toISOString() }
      : { items: [torrent(1, 'Торрент 1'), torrent(2, 'Торрент 2')] }))
    api.getHomeCollections.mockReset().mockResolvedValue({ hero: null, popular: [movie('p1', 'Поп 1'), movie('p2', 'Поп 2'), movie('p3', 'Поп 3')], newest: [movie('n1', 'Нов 1')], top_rated: [], by_year: [], by_genre: [] })
    api.listSeries.mockReset().mockResolvedValue({ items: [{ id: 's1', title: 'Сериал 1', original_title: '', year: 2020, poster_url: null, rating: 9, genres: [] }], total: 1, page: 1, page_size: 20, total_pages: 1 })

    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv', component: TvHomeView },
      { path: '/:any(.*)*', component: { render: () => null } },
    ] })
    router.push('/tv')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('loads the spotlight hero and the four shelves from the existing API', async () => {
    await mountHome()
    expect(api.list).toHaveBeenCalledWith({ kind: 'movie', collection: 'spotlight' }, expect.any(AbortSignal))
    expect(api.list).toHaveBeenCalledWith({ kind: 'movie' })
    expect(api.listSeries).toHaveBeenCalledWith({ sort: 'rating_desc', page_size: 20 })
    expect(wrapper!.get('[data-testid="tv-hero-title"]').text()).toBe('Бойцовский клуб')
    const titles = wrapper!.findAll('.tv-shelf-title').map(el => el.text())
    expect(titles).toEqual(['Популярное', 'Новинки', 'Топ сериалов', 'Торренты'])
  })

  it('puts the primary remote focus on «Смотреть»', async () => {
    await mountHome()
    expect(focused()).toEqual(['hero:0'])
    expect(document.activeElement).toBe(wrapper!.get('[data-testid="tv-hero-watch"]').element)
  })

  it('walks the shelves with the arrows and opens the focused card with Enter', async () => {
    await mountHome()
    press('ArrowDown'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['popular:1'])
    press('ArrowDown'); press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['series:0'])
    press('ArrowUp'); press('ArrowUp'); await nextTick()
    expect(focused()).toEqual(['popular:1'])
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/movies/p2/pop-2')
  })

  it('«Смотреть» opens the spotlight title', async () => {
    await mountHome()
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/torrents/movie/550')
  })

  it('opens the left menu with ArrowLeft from the first card and jumps to a section', async () => {
    await mountHome()
    press('ArrowDown'); press('ArrowLeft'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-menu"]').classes()).toContain('open')
    expect(focused()).toEqual(['menu:0'])
    for (let i = 0; i < 4; i++) press('ArrowDown')
    await nextTick()
    expect(focused()).toEqual(['menu:4'])
    press('Enter'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-menu"]').classes()).not.toContain('open')
    expect(focused()).toEqual(['torrents:0'])
  })

  it('menu «Поиск» shows a notice and «Профиль» opens the profile', async () => {
    await mountHome()
    press('ArrowLeft'); press('Enter'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-notice"]').text()).toContain('Поиск')
    press('ArrowLeft'); for (let i = 0; i < 5; i++) press('ArrowDown')
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('Back on a shelf returns to the banner, Back on the banner is left to the TV', async () => {
    await mountHome()
    press('ArrowDown'); press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['newest:0'])
    expect(press('Escape').defaultPrevented).toBe(true)
    await nextTick()
    expect(focused()).toEqual(['hero:0'])
    expect(press('Escape').defaultPrevented).toBe(false)
  })

  it('memory return: coming back from a title focuses the same card', async () => {
    await mountHome()
    press('ArrowDown'); press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['popular:2'])
    press('Enter'); await flushPromises()
    wrapper!.unmount()

    await router.push('/tv')
    await mountHome()
    expect(focused()).toEqual(['popular:2'])
  })

  it('still works when some shelves fail to load', async () => {
    api.getHomeCollections.mockRejectedValue(new Error('down'))
    await mountHome()
    expect(wrapper!.findAll('.tv-shelf-title').map(el => el.text())).toEqual(['Топ сериалов', 'Торренты'])
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['series:0'])
  })
})
