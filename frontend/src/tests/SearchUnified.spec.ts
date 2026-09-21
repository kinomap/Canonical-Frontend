import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MovieCard from '@/components/MovieCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import { apiClient } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    searchMovies: vi.fn(),
    searchMoviesQuick: vi.fn()
  }
}))

describe('TZ35 Unified Search Frontend Integration', () => {
  let router: any

  beforeEach(() => {
    vi.resetAllMocks()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/movies/:id', component: { template: '<div>Movie Details</div>' } },
        { path: '/series/:id', component: { template: '<div>Series Details</div>' } }
      ]
    })
  })

  it('MovieCard.vue routes to /series/:id for series type and /movies/:id for movie type', async () => {
    const movieItem = {
      id: 'movie-1',
      title: 'Shōgun Movie',
      year: 2024,
      type: 'movie' as const
    }

    const seriesItem = {
      id: 'series-1',
      title: 'Shōgun Series',
      year: 2024,
      type: 'series' as const
    }

    const movieWrapper = mount(MovieCard, {
      props: { movie: movieItem as any },
      global: { plugins: [router] }
    })

    const seriesWrapper = mount(MovieCard, {
      props: { movie: seriesItem as any },
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(movieWrapper.find('a').attributes('href')).toBe('/movies/movie-1')
    expect(seriesWrapper.find('a').attributes('href')).toBe('/series/series-1')
    expect(seriesWrapper.text()).toContain('СЕРИАЛ')
  })

  it('SearchBar.vue renders series badge and routes to /series/:id on click', async () => {
    vi.mocked(apiClient.searchMoviesQuick).mockResolvedValue({
      items: [
        { id: 'movie-10', title: 'Shōgun Movie', year: 2024, type: 'movie' },
        { id: 'series-20', title: 'Shōgun Series', year: 2024, type: 'series' }
      ],
      total: 2,
      page: 1,
      page_size: 5
    } as any)

    const wrapper = mount(SearchBar, {
      global: { plugins: [router] }
    })

    const input = wrapper.find('input')
    await input.setValue('Shōgun')
    await new Promise(r => setTimeout(r, 400))
    await flushPromises()

    expect(apiClient.searchMoviesQuick).toHaveBeenCalledWith('Shōgun', 5)
    expect(wrapper.text()).toContain('Сериал')

    const suggestions = wrapper.findAll('.suggestion-item')
    expect(suggestions.length).toBe(2)

    await suggestions[1].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/series/series-20')
  })
})
