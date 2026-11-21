import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'

const api = vi.hoisted(() => ({
  getMovie: vi.fn(),
  getSeriesDetail: vi.fn(),
  detail: vi.fn(),
  sources: vi.fn(),
  membership: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@/api/client', () => ({ apiClient: { getMovie: api.getMovie, getSeriesDetail: api.getSeriesDetail }, adRequest: vi.fn() }))
vi.mock('@/api/torrents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/torrents')>()
  return { ...actual, torrentsApi: { detail: api.detail }, torrentPlaybackApi: { sources: api.sources } }
})
vi.mock('@/api/library', () => ({ libraryApi: { membership: api.membership, set: api.set } }))

import TvDetailsModal from '@/views/tv/TvDetailsModal.vue'

const source = (id: string, quality: string, seeders: number, extra: Record<string, unknown> = {}) => ({
  source_id: id, title: `Release ${quality}`, quality, source_type: 'WEB-DL', languages: ['ru'], seeders, size_bytes: 8 * 1024 ** 3,
  state: 'ready', progress: 1, start_ms: null, default: false, episodes: [], file_count: 1, ...extra,
})

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let router: Router
let wrapper: VueWrapper | undefined

async function mountDetails(query: Record<string, string>) {
  await router.push({ path: '/tv/details', query })
  wrapper = mount(TvDetailsModal, { global: { plugins: [router] }, attachTo: document.body })
  for (let i = 0; i < 3; i++) { await flushPromises(); await nextTick() }
  return wrapper
}

const focused = () => wrapper!.findAll('.tv-focused').map(el => el.attributes('data-tv-key'))
const at = () => ({ path: router.currentRoute.value.path, query: router.currentRoute.value.query })

describe('TvDetailsModal.vue', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    for (const fn of Object.values(api)) fn.mockReset()
    api.getMovie.mockResolvedValue({ id: 'm1', title: 'Матрица', original_title: 'The Matrix', year: 1999, rating: 8.7, runtime: 136, poster: 'https://img/p.jpg', backdrop: 'https://img/b.jpg', overview: 'Нео выбирает таблетку', genres: [{ id: 1, name: 'Фантастика', slug: 'sf' }], quality: null, status: 'ready' })
    api.getSeriesDetail.mockResolvedValue({ id: 's1', title: 'Тьма', original_title: 'Dark', year: 2017, rating: 8.8, poster_url: null, backdrop_url: 'https://img/dark.jpg', overview: '', genres: [], seasons: [
      { id: 'se2', season_number: 2, episodes: [{ id: 'e21', episode_number: 1, title: 'Начало и конец', overview: null, file_size: null, mime_type: null }] },
      { id: 'se1', season_number: 1, episodes: [
        { id: 'e12', episode_number: 2, title: 'Ложь', overview: null, file_size: null, mime_type: null },
        { id: 'e11', episode_number: 1, title: 'Секреты', overview: null, file_size: null, mime_type: null },
      ] },
    ] })
    api.detail.mockResolvedValue({ tmdb_id: 550, kind: 'movie', title: 'Бойцовский клуб', original_title: 'Fight Club', year: 1999, overview: 'Тайлер Дёрден', poster: null, backdrop: 'https://img/fc.jpg', rating: 8.4, runtime: 139, playback_available: false, genres: [{ id: 18, name: 'драма' }], director_list: [{ name: 'Дэвид Финчер', photo: null }] })
    api.sources.mockResolvedValue({ allowed: true, selected_source_id: null, episodes: [], sources: [
      source('s720', '720p', 300), source('s4k', '2160p', 40, { title: 'Fight Club 2160p HDR' }), source('s1080', '1080p', 900, { voices: ['Дубляж', 'МВО'] }),
    ] })
    api.membership.mockResolvedValue({ saved: [] })
    api.set.mockResolvedValue({ saved: true })
    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv/details', component: TvDetailsModal },
      { path: '/:any(.*)*', component: { render: () => null } },
    ] })
    await router.push('/tv')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('catalogue film: backdrop, facts, «Смотреть фильм» in focus, OK starts the player (never a blind start from the shelf)', async () => {
    await mountDetails({ src: 'catalog', kind: 'movie', id: 'm1' })
    expect(api.getMovie).toHaveBeenCalledWith('m1')
    expect(wrapper!.get('[data-testid="tv-details-title"]').text()).toBe('Матрица')
    expect(wrapper!.text()).toContain('The Matrix')
    const facts = wrapper!.get('[data-testid="tv-details-facts"]').text()
    expect(facts).toContain('8.7')
    expect(facts).toContain('1999')
    expect(facts).toContain('2 ч 16 мин')
    expect(facts).toContain('Фантастика')
    expect(wrapper!.get('.tv-details-bg').attributes('src')).toBe('https://img/b.jpg')
    expect(wrapper!.get('[data-testid="tv-details-watch"]').text()).toContain('Смотреть фильм')
    expect(focused()).toEqual(['actions:0'])
    expect(wrapper!.find('[data-testid="tv-details-sources"]').exists()).toBe(false)
    press('Enter'); await flushPromises()
    expect(at()).toEqual({ path: '/tv/player', query: { src: 'catalog', kind: 'movie', id: 'm1' } })
  })

  it('catalogue series: seasons strip and episodes carousel; OK on an episode plays exactly it', async () => {
    await mountDetails({ src: 'catalog', kind: 'series', id: 's1' })
    expect(wrapper!.findAll('[data-testid^="tv-details-season-"]').map(el => el.text())).toEqual(['Сезон 1', 'Сезон 2'])
    expect(wrapper!.findAll('.tv-details-episode').map(el => el.text())).toEqual(['1Секреты', '2Ложь'])
    press('ArrowDown'); await nextTick()
    expect(focused()).toEqual(['seasons:0'])
    press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['seasons:1'])
    expect(wrapper!.findAll('.tv-details-episode').map(el => el.text())).toEqual(['1Начало и конец'])
    press('ArrowLeft'); await nextTick()
    press('ArrowDown'); await nextTick()
    press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['episodes:1'])
    press('Enter'); await flushPromises()
    expect(at()).toEqual({ path: '/tv/player', query: { src: 'catalog', kind: 'series', id: 's1', ep: 'e12' } })
  })

  it('catalogue series: «Смотреть» starts the first episode of the chosen season', async () => {
    await mountDetails({ src: 'catalog', kind: 'series', id: 's1' })
    press('Enter'); await flushPromises()
    expect(at().query).toEqual({ src: 'catalog', kind: 'series', id: 's1', ep: 'e11' })
  })

  it('torrent release: the sources list (quality → seeders), size, voices; the chosen source goes to the player', async () => {
    await mountDetails({ src: 'torrent', kind: 'movie', id: '550' })
    expect(api.detail).toHaveBeenCalledWith('movie', '550')
    expect(api.sources).toHaveBeenCalledWith('movie', 550)
    expect(wrapper!.text()).toContain('Режиссёр: Дэвид Финчер')
    expect(wrapper!.get('[data-testid="tv-details-facts"]').text()).toContain('TMDB')
    const rows = wrapper!.findAll('.tv-details-source')
    expect(rows.map(el => el.get('.tv-details-quality').text())).toEqual(['4K HDR', '1080p', '720p'])
    expect(rows[1].text()).toContain('8.0 ГБ')
    expect(rows[1].text()).toContain('Дубляж, МВО')
    expect(rows[1].text()).toContain('900 сидов')

    press('ArrowDown'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['sources:1'])
    press('Enter'); await nextTick()
    expect(wrapper!.get('[data-testid="tv-details-source-1"]').classes()).toContain('active')
    press('Escape'); await nextTick()
    expect(focused()).toEqual(['actions:0'])
    press('Enter'); await flushPromises()
    expect(at()).toEqual({ path: '/tv/player', query: { src: 'torrent', kind: 'movie', id: '550', source: 's1080' } })
  })

  it('torrent series: seasons and episodes from the sources; OK on an episode plays it with a source holding it', async () => {
    api.detail.mockResolvedValue({ tmdb_id: 1399, kind: 'tv', title: 'Игра престолов', original_title: 'Game of Thrones', year: 2011, overview: '', poster: null, backdrop: null, rating: 8.5, playback_available: false })
    api.sources.mockResolvedValue({ allowed: true, selected_source_id: 'pack1', episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 2, episode: 1 }], sources: [
      source('pack1', '1080p', 500, { episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] }),
      source('pack2', '720p', 100, { episodes: [{ season: 2, episode: 1 }] }),
    ] })
    await mountDetails({ src: 'torrent', kind: 'tv', id: '1399' })
    expect(wrapper!.findAll('[data-testid^="tv-details-season-"]').map(el => el.text())).toEqual(['Сезон 1', 'Сезон 2'])
    press('ArrowDown'); press('ArrowDown'); press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['episodes:1'])
    expect(wrapper!.findAll('.tv-details-source')).toHaveLength(1)
    press('Enter'); await flushPromises()
    expect(at()).toEqual({ path: '/tv/player', query: { src: 'torrent', kind: 'tv', id: '1399', season: '1', episode: '2', source: 'pack1' } })
  })

  it('«В закладки / Кинотеку» saves a torrent title in the account library', async () => {
    await mountDetails({ src: 'torrent', kind: 'movie', id: '550' })
    expect(api.membership).toHaveBeenCalledWith(['movie:550'])
    press('ArrowRight'); await nextTick()
    expect(focused()).toEqual(['actions:1'])
    press('Enter'); await flushPromises(); await nextTick()
    expect(api.set).toHaveBeenCalledWith('movie', 550, true)
    expect(wrapper!.get('[data-testid="tv-details-bookmark"]').text()).toContain('В Кинотеке')
  })

  it('no sources yet: «Смотреть» still starts the best available release', async () => {
    api.sources.mockRejectedValue(new Error('discovering'))
    await mountDetails({ src: 'torrent', kind: 'movie', id: '550' })
    expect(wrapper!.find('[data-testid="tv-details-no-sources"]').exists()).toBe(true)
    press('Enter'); await flushPromises()
    expect(at()).toEqual({ path: '/tv/player', query: { src: 'torrent', kind: 'movie', id: '550' } })
  })

  it('shows an error when the title cannot be loaded; Back returns to the catalogue', async () => {
    api.getMovie.mockRejectedValue(new Error('404'))
    await mountDetails({ src: 'catalog', kind: 'movie', id: 'gone' })
    expect(wrapper!.find('[data-testid="tv-details-error"]').exists()).toBe(true)
    press('Escape'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })
})
