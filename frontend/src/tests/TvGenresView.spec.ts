import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'

const api = vi.hoisted(() => ({ listGenres: vi.fn(), genres: vi.fn() }))

vi.mock('@/api/client', () => ({ apiClient: { listGenres: api.listGenres }, adRequest: vi.fn() }))
vi.mock('@/api/torrents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/torrents')>()
  return { ...actual, torrentsApi: { genres: api.genres } }
})

import TvGenresView from '@/views/tv/TvGenresView.vue'
import { genreIcon, genreTheme } from '@/views/tv/tvGenres'
import { containsEmoji } from '@/views/tv/tvIcons'

const NAMES = ['боевик', 'приключения', 'комедия', 'фантастика', 'ужасы', 'триллер', 'детектив', 'драма', 'семейный', 'мультфильм', 'вестерн', 'история']
const SLUGS = ['action', 'adventure', 'comedy', 'scifi', 'horror', 'thriller', 'detective', 'drama', 'family', 'animation', 'western', 'history']

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let router: Router
let wrapper: VueWrapper | undefined

async function mountGenres(source = 'catalog') {
  await router.push({ path: '/tv/genres', query: { source } })
  wrapper = mount(TvGenresView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises(); await nextTick()
  return wrapper
}

const focused = () => wrapper!.findAll('.tv-focused').map(el => el.attributes('data-tv-key'))

describe('TvGenresView.vue', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    api.listGenres.mockReset().mockResolvedValue(NAMES.map((name, i) => ({ id: i + 1, name, slug: SLUGS[i] })))
    api.genres.mockReset().mockImplementation((kind: string) => Promise.resolve({ items: kind === 'movie'
      ? [{ id: 28, name: 'боевик' }, { id: 18, name: 'драма' }, { id: 16, name: 'мультфильм' }]
      : [{ id: 18, name: 'драма' }, { id: 10765, name: 'НФ и Фэнтези' }] }))
    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv/genres', component: TvGenresView },
      { path: '/:any(.*)*', component: { render: () => null } },
    ] })
    await router.push('/tv')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('shows the catalogue genres as a 5-column cinema grid with icons', async () => {
    await mountGenres()
    expect(api.listGenres).toHaveBeenCalledTimes(1)
    const rows = wrapper!.findAll('.tv-genres-row')
    expect(rows.map(row => row.findAll('.tv-genre-card').length)).toEqual([5, 5, 2])
    expect(wrapper!.get('[data-testid="tv-genre-action"]').find('svg[data-icon="flame"]').exists()).toBe(true)
    expect(wrapper!.get('[data-testid="tv-genre-action"]').text()).toContain('Боевик')
    expect(wrapper!.get('[data-testid="tv-genre-family"]').find('svg[data-icon="family"]').exists()).toBe(true)
    expect(wrapper!.get('[data-testid="tv-genre-animation"]').find('svg[data-icon="sparkles"]').exists()).toBe(true)
    expect(wrapper!.get('[data-testid="tv-genre-action"]').classes()).toContain('theme-fire')
    expect(containsEmoji(wrapper!.text())).toBe(false)
    expect(wrapper!.get('[data-testid="tv-genres-tab-catalog"]').classes()).toContain('active')
    expect(focused()).toEqual(['tabs:0'])
  })

  it('maps genre names to vector stickers and gradients with a fallback', () => {
    expect(['боевик', 'приключения', 'комедия', 'фантастика', 'ужасы', 'триллер', 'детектив', 'драма'].map(genreIcon))
      .toEqual(['flame', 'compass', 'smile', 'rocket', 'ghost', 'pulse', 'search', 'genres'])
    expect(genreIcon('мелодрама')).toBe('heart')
    expect(genreIcon('что-то новое')).toBe('movies')
    expect(genreTheme('ужасы')).toBe('mystic')
    expect(genreTheme('фантастика')).toBe('indigo')
    expect(genreTheme('детектив')).toBe('noir')
  })

  it('moves freely over the grid with the arrows, keeping the column, with the neon focus', async () => {
    await mountGenres()
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['g0:0'])
    press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['g0:2'])
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['g1:2'])
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['g2:1'])
    press('ArrowUp'); await nextTick()
    expect(focused()).toEqual(['g1:1'])
    expect(wrapper!.get('[data-tv-key="g1:1"]').classes()).toContain('tv-genre-card')
    press('ArrowUp'); press('ArrowUp'); await nextTick()
    expect(focused()).toEqual(['tabs:0'])
  })

  it('OK opens the showcase of the chosen catalogue genre', async () => {
    await mountGenres()
    press('ArrowDown'); press('ArrowDown'); press('ArrowRight'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['g1:2'])
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv/genres/catalog/drama')
    expect(router.currentRoute.value.query).toEqual({ name: 'Драма' })
  })

  it('switches to the torrent genres (TMDB films + series merged) and opens one with both kinds', async () => {
    await mountGenres()
    press('ArrowRight'); await flushPromises(); await nextTick()
    expect(api.genres).toHaveBeenCalledWith('movie')
    expect(api.genres).toHaveBeenCalledWith('tv')
    expect(router.currentRoute.value.query).toEqual({ source: 'torrents' })
    expect(wrapper!.get('[data-testid="tv-genres-tab-torrents"]').classes()).toContain('active')
    expect(wrapper!.findAll('.tv-genre-card').map(el => el.attributes('data-testid'))).toEqual(['tv-genre-28', 'tv-genre-18', 'tv-genre-16', 'tv-genre-10765'])
    press('ArrowDown'); press('ArrowRight'); await nextTick()
    press('Enter'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv/genres/torrents/18')
    expect(router.currentRoute.value.query).toEqual({ name: 'Драма', kinds: 'movie,tv' })
  })

  it('opens straight on the torrent tab from the menu entry «Торрент-жанры»', async () => {
    await mountGenres('torrents')
    expect(api.listGenres).not.toHaveBeenCalled()
    expect(focused()).toEqual(['tabs:1'])
    expect(wrapper!.findAll('.tv-genre-card')).toHaveLength(4)
  })

  it('shows an error with a retry when the genres cannot be loaded', async () => {
    api.listGenres.mockRejectedValueOnce(new Error('down'))
    await mountGenres()
    expect(wrapper!.find('[data-testid="tv-genres-error"]').exists()).toBe(true)
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['retry:0'])
    press('Enter'); await flushPromises(); await nextTick()
    expect(api.listGenres).toHaveBeenCalledTimes(2)
    expect(wrapper!.findAll('.tv-genre-card')).toHaveLength(12)
  })

  it('ArrowLeft from the first tab opens the left menu', async () => {
    await mountGenres()
    press('ArrowLeft'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-menu"]').classes()).toContain('open')
  })
})
