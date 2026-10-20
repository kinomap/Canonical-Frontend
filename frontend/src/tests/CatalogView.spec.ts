import {t} from '../i18n'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CatalogView from '@/views/CatalogView.vue'
import { apiClient } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    listMovies: vi.fn(),
    listGenres: vi.fn(),
    searchMovies: vi.fn(),
    getMovie: vi.fn(),
    getAudioTracks: vi.fn()
  }
}))

describe('CatalogView.vue', () => {
  let router: any

  beforeEach(() => {
    vi.resetAllMocks()

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: CatalogView },
        { path: '/movies', component: CatalogView },
        { path: '/movies/:id', component: { template: '<div>Movie</div>' } }
      ]
    })

    vi.mocked(apiClient.listGenres).mockResolvedValue([
      { id: 1, name: 'Action', slug: 'action' },
      { id: 2, name: 'Sci-Fi', slug: 'sci-fi' }
    ])
  })

  it('renders loading state initially then displays movies', async () => {
    vi.mocked(apiClient.listMovies).mockResolvedValue({
      items: [
        {
          id: 'm1',
          title: 'Test Action Movie',
          original_title: '',
          year: 2024,
          poster: null,
          rating: 8.5,
          runtime: 110,
          quality: 'HD',
          status: 'available',
          genres: [{ id: 1, name: 'Action', slug: 'action' }]
        }
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    const wrapper = mount(CatalogView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.skeleton-grid').exists()).toBe(false)
    expect(wrapper.text()).toContain('Test Action Movie')
    expect(wrapper.find('[data-id="m1"]').exists()).toBe(true)
  })

  it('renders empty state when no movies returned', async () => {
    vi.mocked(apiClient.listMovies).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    const wrapper = mount(CatalogView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('No movies found')
  })

  it('renders error state on API failure', async () => {
    vi.mocked(apiClient.listMovies).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(CatalogView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.error-state').exists()).toBe(true)
    expect(wrapper.text()).toContain(t('Не удалось загрузить каталог'))
    expect(wrapper.text()).not.toContain('Network error')
  })



  it('handles pagination next and previous buttons', async () => {
    vi.mocked(apiClient.listMovies).mockResolvedValue({
      items: [
        {
          id: 'p1',
          title: 'Page Movie',
          original_title: '',
          year: 2024,
          poster: null,
          rating: 7.0,
          runtime: 90,
          quality: 'HD',
          status: 'available',
          genres: []
        }
      ],
      total: 40,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    const wrapper = mount(CatalogView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.page-info').text()).toContain('Page 1 of 2')

    const nextBtn = wrapper.findAll('.page-btn')[1]
    await nextBtn.trigger('click')
    await flushPromises()

    // listMovies(filters, signal): the AbortSignal argument is part of the current client contract
    expect(apiClient.listMovies).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, page_size: 20 }),
      expect.any(AbortSignal)
    )
    expect(wrapper.find('.page-info').text()).toContain('Page 2 of 2')
  })
})
