import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '@/api/client';
describe('apiClient', () => {
    const originalFetch = globalThis.fetch;
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });
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
        };
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
        });
        const result = await apiClient.listMovies();
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/movies', expect.objectContaining({ headers: expect.any(Object) }));
        expect(result).toEqual(mockData);
    });
    it('listMovies passes genre query param when provided', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ items: [], total: 0, page: 1, page_size: 20 })
        });
        await apiClient.listMovies({ page: 1, page_size: 20, genre: 'action' });
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/movies?page=1&page_size=20&genre=action', expect.any(Object));
    });
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
        };
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => mockDetail
        });
        const result = await apiClient.getMovie('movie-123');
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/movies/movie-123', expect.any(Object));
        expect(result).toEqual(mockDetail);
    });
    it('searchMovies sends query param q', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ items: [], total: 0, page: 1, page_size: 20 })
        });
        await apiClient.searchMovies('Dark Knight');
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/search?q=Dark+Knight&page=1&page_size=20', expect.any(Object));
    });
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
        ];
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => mockTracks
        });
        const result = await apiClient.getAudioTracks('movie-123');
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/movies/movie-123/audio', expect.any(Object));
        expect(result).toEqual(mockTracks);
    });
    it('throws ApiError on non-ok status', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ detail: 'Movie not found' })
        });
        await expect(apiClient.getMovie('unknown')).rejects.toThrow(ApiError);
    });
});
