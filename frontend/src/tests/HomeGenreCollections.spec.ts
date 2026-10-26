import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { mergeHomeGenreCollections } from '@/utils/homeGenres'
import MainCatalogView from '@/views/MainCatalogView.vue'
import { apiClient } from '@/api/client'
import type { GenreCollection, HomeCollections, MovieSummary } from '@/types/movie'

vi.mock('@/api/client', () => ({ apiClient: { getHomeCollections: vi.fn(), checkLatest: vi.fn() } }))
const movie = (id: string, type: 'movie' | 'series' = 'movie'): MovieSummary => ({ id, type, title: id, original_title: '', year: null, poster: null, rating: null, runtime: null, quality: null, status: 'available', genres: [] })
const row = (id: number, name: string, slug: string, movies: MovieSummary[]): GenreCollection => ({ genre: { id, name, slug }, movies })
const detective = row(2, 'детектив', 'detektiv', [movie('a'), movie('b')])
const alias = row(18, 'Детектив', 'mystery', [movie('b'), movie('c')])
const home = (rows: GenreCollection[]): HomeCollections => ({ hero: null, newest: [], popular: [], top_rated: [], by_year: [], by_genre: rows })

describe('Home genre collection grouping', () => {
  it('merges detektiv/mystery display-name variants and retains every unique item', () => {
    const result = mergeHomeGenreCollections([detective, alias])
    expect(result).toHaveLength(1)
    expect(result[0]!.genre.slug).toBe('detektiv')
    expect(result[0]!.movies.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
  it('normalizes case and Unicode whitespace for matching', () => {
    expect(mergeHomeGenreCollections([detective, row(99, '  ДЕТЕКТИВ\u00a0 ', 'other', [movie('c')])])).toHaveLength(1)
  })
  it('preserves unrelated genre and movie order', () => {
    const comedy = row(11, 'комедия', 'komedija', [movie('d')])
    const result = mergeHomeGenreCollections([comedy, detective, alias])
    expect(result.map(item => item.genre.slug)).toEqual(['komedija', 'detektiv'])
    expect(result[1]!.movies.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
  it('does not drop a series sharing a movie ID or mutate cached API rows', () => {
    const source = [detective, row(18, 'Детектив', 'mystery', [movie('a', 'series')])]
    const before = JSON.stringify(source)
    const result = mergeHomeGenreCollections(source)
    expect(result[0]!.movies).toHaveLength(3)
    expect(JSON.stringify(source)).toBe(before)
    expect(result[0]!.genre).not.toBe(detective.genre)
  })
  it('handles empty responses and repeated aliases idempotently', () => {
    expect(mergeHomeGenreCollections()).toEqual([])
    const result = mergeHomeGenreCollections([detective, alias, alias])
    expect(mergeHomeGenreCollections(result)).toEqual(result)
  })
})

const Rail = defineComponent({ name: 'MovieRail', props: ['title', 'movies', 'viewAllLink'], template: '<section class="test-rail"><h2>{{ title }}</h2></section>' })
let wrapper: VueWrapper | undefined
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.mocked(apiClient.checkLatest).mockResolvedValue({ total: 1, latest_created_at: '2026-10-26' }) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers() })
async function open() {
  wrapper = mount(MainCatalogView, { global: { stubs: { MovieRail: Rail, QuickCategories: true, ShowcaseHero: true } } })
  await flushPromises()
  return wrapper
}
function genreRails() { return wrapper!.findAllComponents(Rail).filter(rail => rail.props('viewAllLink')?.startsWith('/genres')) }

it('renders just one detective rail and preserves its working view-all link', async () => {
  vi.mocked(apiClient.getHomeCollections).mockResolvedValue(home([detective, alias]))
  await open()
  expect(genreRails()).toHaveLength(1)
  expect(genreRails()[0]!.props('movies').map((item: MovieSummary) => item.id)).toEqual(['a', 'b', 'c'])
  expect(genreRails()[0]!.props('viewAllLink')).toBe('/genres?genre=detektiv')
})
it('does not recreate duplicate rails after a silent catalog refresh', async () => {
  vi.mocked(apiClient.getHomeCollections).mockResolvedValueOnce(home([detective])).mockResolvedValueOnce(home([detective, alias]))
  vi.mocked(apiClient.checkLatest).mockResolvedValueOnce({ total: 1, latest_created_at: 'old' }).mockResolvedValue({ total: 2, latest_created_at: 'new' })
  await open()
  await vi.advanceTimersByTimeAsync(60_000)
  await flushPromises()
  expect(apiClient.getHomeCollections).toHaveBeenLastCalledWith(true)
  expect(genreRails()).toHaveLength(1)
  expect(genreRails()[0]!.props('movies')).toHaveLength(3)
})
