import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient, ApiError } from '@/api/client'

describe('apiClient', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('series search sends query and pagination to the paginated endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ok:true,json:async()=>({items:[],total:65,page:3,page_size:20})} as Response)
    const result = await apiClient.listSeries({q:'Ход королевы',page:3,page_size:20,genre:'drama',year:2020,sort:'newest'})
    const url = new URL(String(vi.mocked(globalThis.fetch).mock.calls[0][0]),'http://localhost')
    expect(url.pathname).toBe('/api/v1/series')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({q:'Ход королевы',page:'3',page_size:'20',genre:'drama',year:'2020',sort:'newest'})
    expect(result.total).toBe(65)
  })

  it('listMovies fetches paginated movies with default params', async () => {
    const mockData = {
      items: [
        {
          id: 'movie-1',
          title: 'Test Movie',
          original_title: '',
          year: 2024,
          poster: null,
          rating: 8.0,
          runtime: 120,
          quality: 'HD',
          status: 'available',
          genres: []
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    } as Response)

    const result = await apiClient.listMovies()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/movies',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(result).toEqual(mockData)
  })

  it('listMovies passes genre query param when provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1, page_size: 20 })
    } as Response)

    await apiClient.listMovies({ page: 1, page_size: 20, genre: 'action' })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/movies?page=1&page_size=20&genre=action',
      expect.any(Object)
    )
  })

  it('getMovie fetches single movie detail', async () => {
    const mockDetail = {
      id: 'movie-123',
      title: 'Detailed Movie',
      original_title: 'Original Title',
      year: 2026,
      poster: 'http://poster.jpg',
      rating: 8.5,
      runtime: 112,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: 'Movie overview',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 2027030264
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetail
    } as Response)

    const result = await apiClient.getMovie('movie-123')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/movies/movie-123',
      expect.any(Object)
    )
    expect(result).toEqual(mockDetail)
  })

  it('searchMovies sends query param q', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1, page_size: 20 })
    } as Response)

    await apiClient.searchMovies('Dark Knight')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/search?q=Dark+Knight&page=1&page_size=20',
      expect.any(Object)
    )
  })

  it('getAudioTracks fetches audio tracks for movie', async () => {
    const mockTracks = [
      {
        id: 1,
        track_index: 0,
        language: 'ru',
        title: 'Russian',
        codec: 'aac',
        channels: 2,
        sample_rate: 48000,
        is_default: true
      }
    ]

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTracks
    } as Response)

    const result = await apiClient.getAudioTracks('movie-123')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/movies/movie-123/audio',
      expect.any(Object)
    )
    expect(result).toEqual(mockTracks)
  })

  it('throws ApiError on non-ok status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'Movie not found' })
    } as Response)

    await expect(apiClient.getMovie('unknown')).rejects.toThrow(ApiError)
  })
})
