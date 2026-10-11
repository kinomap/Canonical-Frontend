import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MovieDetailsView from '@/views/MovieDetailsView.vue'
import { apiClient, ApiError } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/client', () => ({
  apiClient: {
    getMovie: vi.fn(),
    getAudioTracks: vi.fn(),
  getComments: vi.fn(),
  getReactions: vi.fn(),
    listMovies: vi.fn(),
    listGenres: vi.fn(),
    searchMovies: vi.fn(),
    startPlayback: vi.fn(),
    heartbeatPlayback: vi.fn(),
    stopPlayback: vi.fn(),
    getCurrentUser: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message)
    }
  }
}))

describe('MovieDetailsView.vue', () => {
  let router: any

  beforeEach(async () => {
    vi.resetAllMocks()

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Catalog</div>' } },
        { path: '/movies/:id', component: MovieDetailsView }
      ]
    })

    await router.push('/movies/movie-123')
    await router.isReady()
  })

  it('renders movie details correctly when API succeeds', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Sample Movie Title',
      original_title: 'Sample Original Title',
      year: 2026,
      poster: 'http://poster.jpg',
      rating: 8.7,
      runtime: 112,
      quality: 'HD',
      status: 'available',
      genres: [{ id: 1, name: 'Drama', slug: 'drama' }],
      overview: 'This is a sample movie overview.',
      backdrop: 'http://backdrop.jpg',
      tmdb_id: 12345,
      mime_type: 'video/mp4',
      file_size: 2027030264
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Sample Movie Title')
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('8.7')
    expect(wrapper.text()).toContain('1h 52m')
    expect(wrapper.text()).toContain('1.89 GB')
    expect(wrapper.text()).toContain('This is a sample movie overview.')
  })

  it('renders audio tracks when present', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Movie with Audio',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    const mockTracks = [
      {
        id: 1,
        track_index: 0,
        language: 'ru',
        title: 'Russian AAC',
        codec: 'aac',
        channels: 2,
        sample_rate: 48000,
        is_default: true
      }
    ]

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce(mockTracks)

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    await wrapper.find('.expand-btn').trigger('click')
    expect(wrapper.text()).toContain('Russian AAC')
    expect(wrapper.text()).toContain('Track #1')
    expect(wrapper.text()).toContain('Default')
  })

  it('renders "Audio tracks unavailable" when audio tracks list is empty', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Movie without Audio Tracks',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    await wrapper.find('.expand-btn').trigger('click')
    expect(wrapper.text()).toContain('Audio tracks unavailable')
  })

  it('starts playback when Play button clicked', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Playable Movie',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])
    vi.mocked(apiClient.startPlayback).mockResolvedValueOnce({
      session_id: 's1',
      media_endpoint: '/api/v1/playback/stream/movie-123',
      playback_token: 'token123',
      node_id: 'node1',
      media_url: 'http://10.8.0.2:8090/stream/movie-123?token=token123',
      heartbeat_interval_seconds: 30
    })
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ id: 'u1', username: 'viewer' } as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ ok: true })
    useAuthStore().setToken('test-token')

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] },
      attachTo: document.body
    })

    await flushPromises()

    const playBtn = wrapper.find('.player-container')
    expect(playBtn.exists()).toBe(true)

    await playBtn.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VideoPlayer' }).exists()).toBe(true)

    wrapper.unmount()
  })

  it('renders 404 state when getMovie returns 404 ApiError', async () => {
    vi.mocked(apiClient.getMovie).mockRejectedValueOnce(new ApiError(404, 'Movie not found'))

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.not-found-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Movie Not Found')
  })
})
