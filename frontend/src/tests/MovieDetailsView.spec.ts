import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MovieDetailsView from '@/views/MovieDetailsView.vue'
import { apiClient, ApiError } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/client', () => ({
  adRequest: vi.fn().mockResolvedValue({cue_points:[],plan_token:null}),
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
    vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})

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

  it('hides the audio tracks block when the movie has no audio tracks', async () => {
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
    expect(wrapper.find('.audio-tracks-section').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Audio tracks unavailable')
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

  it.each(['success', 'failure'])('keeps the player splash and page stable during a pending playback start (%s)', async (outcome) => {
    vi.mocked(apiClient.getMovie).mockResolvedValueOnce({
      id: 'movie-123', title: 'Stable Movie', original_title: '', year: 2024,
      poster: '/poster.jpg', rating: null, runtime: 90, quality: 'HD',
      status: 'available', genres: [], overview: 'Stable description', backdrop: null,
      tmdb_id: null, mime_type: 'video/mp4', file_size: 1000000
    })
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ id: 'u1', username: 'viewer' } as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ ok: true })
    useAuthStore().setToken('test-token')
    let resolveStart!: (value: any) => void
    let rejectStart!: (error: Error) => void
    vi.mocked(apiClient.startPlayback).mockReturnValueOnce(new Promise((resolve, reject) => {
      resolveStart = resolve
      rejectStart = reject
    }))
    const wrapper = mount(MovieDetailsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(apiClient.startPlayback).not.toHaveBeenCalled()
    const splash = wrapper.find('.player-container').element
    const content = wrapper.find('.main-content').element
    await wrapper.find('.player-container').trigger('click')
    await wrapper.find('.player-container').trigger('click')
    expect(apiClient.startPlayback).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.player-container').element).toBe(splash)
    expect(wrapper.find('.main-content').element).toBe(content)
    expect(wrapper.find('.player-container').attributes('aria-busy')).toBe('true')
    expect(router.currentRoute.value.fullPath).toBe('/movies/movie-123')
    if (outcome === 'success') {
      resolveStart({ session_id: 's1', media_url: 'https://media.example/stream', heartbeat_interval_seconds: 30 })
    } else {
      rejectStart(new Error('Node unavailable'))
    }
    await flushPromises()
    expect(wrapper.find('.main-content').element).toBe(content)
    if (outcome === 'success') {
      expect(wrapper.findComponent({ name: 'VideoPlayer' }).exists()).toBe(true)
    } else {
      expect(wrapper.find('.player-container').element).toBe(splash)
      expect(wrapper.text()).toContain('Node unavailable')
      expect(wrapper.find('.player-container').attributes('aria-busy')).toBe('false')
    }
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
