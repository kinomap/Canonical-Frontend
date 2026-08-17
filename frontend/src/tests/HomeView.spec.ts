import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'
import { apiClient } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    getHomeCollections: vi.fn(),
    listMovies: vi.fn(),
    listGenres: vi.fn()
  }
}))

describe('HomeView.vue', () => {
  let router: any

  beforeEach(() => {
    vi.resetAllMocks()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/movies/:id', component: { template: '<div>Movie</div>' } }
      ]
    })
  })

  it('renders hero banner and collection rails when API succeeds', async () => {
    const mockHome = {
      hero: {
        id: 'hero-1',
        title: 'Hero Featured Movie',
        original_title: '',
        year: 2026,
        poster: 'http://poster.jpg',
        rating: 9.2,
        runtime: 125,
        quality: 'UHD',
        status: 'available',
        genres: [{ id: 1, name: 'Sci-Fi', slug: 'sci-fi' }]
      },
      popular: [
        {
          id: 'pop-1',
          title: 'Popular Movie',
          original_title: '',
          year: 2024,
          poster: null,
          rating: 8.1,
          runtime: 110,
          quality: 'HD',
          status: 'available',
          genres: []
        }
      ],
      newest: [],
      top_rated: [],
      by_year: [
        {
          year: 2026,
          movies: [
            {
              id: 'y-1',
              title: '2026 Movie',
              original_title: '',
              year: 2026,
              poster: null,
              rating: 8.0,
              runtime: 100,
              quality: 'HD',
              status: 'available',
              genres: []
            }
          ]
        }
      ],
      by_genre: []
    }

    vi.mocked(apiClient.getHomeCollections).mockResolvedValueOnce(mockHome)

    const wrapper = mount(HomeView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Hero Featured Movie')
    expect(wrapper.text()).toContain('Популярное')
    expect(wrapper.text()).toContain('Popular Movie')
    expect(wrapper.text()).toContain('Фильмы 2026 года')
  })

  it('renders friendly error state when home collections call fails without raw 500 error', async () => {
    vi.mocked(apiClient.getHomeCollections).mockRejectedValueOnce(new Error('500 Server Error'))

    const wrapper = mount(HomeView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.home-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Не удалось загрузить каталог')
    expect(wrapper.text()).not.toContain('500 Server Error')
  })
})
