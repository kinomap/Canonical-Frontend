// Genre page content: real backend response shape (fixtures captured from
// GET /api/v1/genres/{slug} through the frontend Nginx), empty genre, unknown
// genre and a real API failure. The view must not hide failures as "empty".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import genreContent from './fixtures/genre-content.json'
import genreEmpty from './fixtures/genre-empty.json'
import genreMixed from './fixtures/genre-mixed.json'
import genresList from './fixtures/genres.json'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, apiClient: { listGenres: vi.fn(), getGenreContent: vi.fn() } }
})

import { apiClient, ApiError } from '@/api/client'
import GenresView from '@/views/GenresView.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/genres', component: GenresView },
      { path: '/movies/:id', component: { template: '<div>Movie</div>' } },
      { path: '/series/:id', component: { template: '<div>Series</div>' } },
    ],
  })
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(GenresView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('GenresView genre content', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listGenres).mockReset().mockResolvedValue(genresList as any)
    vi.mocked(apiClient.getGenreContent).mockReset()
  })

  it('renders movies and series of the genre from the backend response', async () => {
    vi.mocked(apiClient.getGenreContent).mockResolvedValue(genreContent as any)
    const slug = (genreContent as any).genre.slug
    const { wrapper } = await mountAt(`/genres?genre=${slug}`)

    expect(apiClient.getGenreContent).toHaveBeenCalledTimes(1)
    expect(apiClient.getGenreContent).toHaveBeenCalledWith(slug, 1, 20)
    expect(wrapper.find('.error-state').exists()).toBe(false)
    const items = (genreContent as any).items as any[]
    expect(wrapper.findAll('.movie-grid:not(.skeleton-grid) a').length).toBe(items.length)
    for (const item of items) {
      const href = item.type === 'series' ? `/series/${item.id}` : `/movies/${item.id}`
      expect(wrapper.find(`a[href="${href}"]`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain(`${(genreContent as any).total}`)
    if (items.some(i => i.type === 'series')) expect(wrapper.text()).toContain('СЕРИАЛ')
  })

  it('renders a mixed movies+series page (real drama page 3) with correct links', async () => {
    vi.mocked(apiClient.getGenreContent).mockResolvedValue(genreMixed as any)
    const slug = (genreMixed as any).genre.slug
    const { wrapper } = await mountAt(`/genres?genre=${slug}&page=3`)
    expect(apiClient.getGenreContent).toHaveBeenCalledTimes(1)
    expect(apiClient.getGenreContent).toHaveBeenCalledWith(slug, 3, 20)
    const items = (genreMixed as any).items as any[]
    expect(items.some(i => i.type === 'series')).toBe(true)
    expect(items.some(i => i.type === 'movie')).toBe(true)
    for (const item of items) {
      const href = item.type === 'series' ? `/series/${item.id}` : `/movies/${item.id}`
      expect(wrapper.find(`a[href="${href}"]`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('СЕРИАЛ')
  })

  it('selecting a genre card performs exactly one content request', async () => {
    vi.mocked(apiClient.getGenreContent).mockResolvedValue(genreContent as any)
    const { wrapper, router } = await mountAt('/genres')
    expect(apiClient.getGenreContent).not.toHaveBeenCalled()
    await wrapper.findAll('.genre-card')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.genre).toBe((genresList as any)[0].slug)
    expect(apiClient.getGenreContent).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state for a genre without available content', async () => {
    vi.mocked(apiClient.getGenreContent).mockResolvedValue(genreEmpty as any)
    const { wrapper } = await mountAt(`/genres?genre=${(genreEmpty as any).genre.slug}`)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.error-state').exists()).toBe(false)
    expect(wrapper.text()).toContain('контент пока отсутствует')
  })

  it('shows an error (not an empty list) when the API really fails', async () => {
    vi.mocked(apiClient.getGenreContent).mockRejectedValue(new ApiError(502, 'Bad Gateway'))
    const { wrapper } = await mountAt('/genres?genre=voennyj')
    expect(wrapper.find('.error-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    expect(wrapper.text()).toContain('Не удалось загрузить контент жанра')

    // Retry re-requests and recovers.
    vi.mocked(apiClient.getGenreContent).mockResolvedValue(genreContent as any)
    await wrapper.find('.error-state .retry-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.error-state').exists()).toBe(false)
  })

  it('reports an unknown genre as not found', async () => {
    vi.mocked(apiClient.getGenreContent).mockRejectedValue(new ApiError(404, 'Genre not found'))
    const { wrapper } = await mountAt('/genres?genre=no-such-genre')
    expect(wrapper.find('.error-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Жанр не найден')
  })
})
