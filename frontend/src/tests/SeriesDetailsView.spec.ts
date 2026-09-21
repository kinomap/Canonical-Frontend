import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SeriesDetailsView from '@/views/SeriesDetailsView.vue'
import { apiClient, ApiError } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    getSeriesDetail: vi.fn(),
    startSeriesPlayback: vi.fn(),
    getComments: vi.fn(),
    getReactions: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message)
    }
  }
}))

describe('SeriesDetailsView.vue', () => {
  let router: any

  const mockSeries = {
    id: 'series-123',
    title: 'Breaking Bad',
    original_title: 'Breaking Bad',
    year: 2008,
    poster_url: 'http://poster.jpg',
    backdrop_url: 'http://backdrop.jpg',
    rating: 9.5,
    genres: [{ id: 1, name: 'Drama', slug: 'drama' }],
    overview: 'A high school chemistry teacher diagnosed with inoperable lung cancer...',
    seasons: [
      {
        id: 'season-1',
        season_number: 1,
        episodes: [
          { id: 'ep-101', episode_number: 1, title: 'Pilot', overview: 'First episode', file_size: 104857600, mime_type: 'video/mp4', is_playable: true },
          { id: 'ep-102', episode_number: 2, title: "Cat's in the Bag...", overview: 'Second episode', file_size: 104857600, mime_type: 'video/mp4', is_playable: true },
          { id: 'ep-103', episode_number: 3, title: 'Unavailable Ep', overview: 'No source', file_size: null, mime_type: null, is_playable: false }
        ]
      },
      {
        id: 'season-2',
        season_number: 2,
        episodes: [
          { id: 'ep-201', episode_number: 1, title: 'Seven Thirty-Seven', overview: 'Season 2 Ep 1', file_size: 104857600, mime_type: 'video/mp4', is_playable: true },
          { id: 'ep-202', episode_number: 2, title: 'Grill', overview: 'Season 2 Ep 2', file_size: 104857600, mime_type: 'video/mp4', is_playable: true }
        ]
      }
    ]
  }

  beforeEach(() => {
    vi.resetAllMocks()

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/series', component: { template: '<div>Catalog</div>' } },
        { path: '/series/:id', component: SeriesDetailsView }
      ]
    })
  })

  it('renders series details and auto-selects Season 1 Episode 1', async () => {
    await router.push('/series/series-123')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockResolvedValueOnce(mockSeries as any)

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Breaking Bad')
    expect(wrapper.text()).toContain('2008')
    expect(wrapper.text()).toContain('9.5')
    expect(wrapper.text()).toContain('S01E01 — Pilot')

    // Active season button check
    const activeSeasonBtn = wrapper.find('.season-btn.active')
    expect(activeSeasonBtn.exists()).toBe(true)
    expect(activeSeasonBtn.text()).toContain('Season 1')

    // Active episode button check
    const activeEpisodeBtn = wrapper.find('.episode-btn.active')
    expect(activeEpisodeBtn.exists()).toBe(true)
    expect(activeEpisodeBtn.text()).toContain('1 серия')
  })

  it('switches episode when Episode button is clicked', async () => {
    await router.push('/series/series-123')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockResolvedValueOnce(mockSeries as any)

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    const epBtns = wrapper.findAll('.episode-btn')
    expect(epBtns.length).toBe(3)

    // Click on Episode 2
    await epBtns[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain("S01E02 — Cat's in the Bag...")
    expect(router.currentRoute.value.query.episode).toBe('2')
  })

  it('switches season and auto-selects first episode when Season button is clicked', async () => {
    await router.push('/series/series-123')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockResolvedValueOnce(mockSeries as any)

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    const seasonBtns = wrapper.findAll('.season-btn')
    expect(seasonBtns.length).toBe(2)

    // Click Season 2 button
    await seasonBtns[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('S02E01 — Seven Thirty-Seven')
    expect(router.currentRoute.value.query.season).toBe('2')
    expect(router.currentRoute.value.query.episode).toBe('1')

    const epBtns = wrapper.findAll('.episode-btn')
    expect(epBtns.length).toBe(2)
    expect(epBtns[0].text()).toContain('1 серия')
  })

  it('respects deep-linking query parameters ?season=2&episode=2', async () => {
    await router.push('/series/series-123?season=2&episode=2')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockResolvedValueOnce(mockSeries as any)

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('S02E02 — Grill')
    const activeSeason = wrapper.find('.season-btn.active')
    expect(activeSeason.text()).toContain('Season 2')
    const activeEpisode = wrapper.find('.episode-btn.active')
    expect(activeEpisode.text()).toContain('2 серия')
  })

  it('disables episode button if episode is not playable', async () => {
    await router.push('/series/series-123')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockResolvedValueOnce(mockSeries as any)

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    const epBtns = wrapper.findAll('.episode-btn')
    const disabledEp = epBtns[2] // ep-103
    expect(disabledEp.classes()).toContain('disabled')
    expect(disabledEp.attributes('disabled')).toBeDefined()
  })

  it('renders 404 state when getSeriesDetail returns 404 ApiError', async () => {
    await router.push('/series/series-999')
    await router.isReady()
    vi.mocked(apiClient.getSeriesDetail).mockRejectedValueOnce(new ApiError(404, 'Series not found'))

    const wrapper = mount(SeriesDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.not-found-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Series Not Found')
  })
})
