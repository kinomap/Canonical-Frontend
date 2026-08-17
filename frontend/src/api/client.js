export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}
const BASE_URL = '/api/v1';
const memoryCache = new Map();
function getCached(key) {
    const item = memoryCache.get(key);
    if (item && item.expiresAt > Date.now()) {
        return item.data;
    }
    memoryCache.delete(key);
    return null;
}
function setCached(key, data, ttlMs) {
    memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
export function clearClientCache() {
    memoryCache.clear();
}
async function request(endpoint, options, cacheTtlMs = 0) {
    const url = `${BASE_URL}${endpoint}`;
    const isGet = !options || !options.method || options.method.toUpperCase() === 'GET';
    if (isGet && cacheTtlMs > 0) {
        const cached = getCached(endpoint);
        if (cached !== null) {
            return cached;
        }
    }
    const token = localStorage.getItem('tg_stream_access_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options?.headers,
    };
    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
        ...options,
        headers,
    });
    if (!response.ok) {
        let errorDetail = response.statusText;
        try {
            const data = await response.json();
            if (data && data.detail) {
                errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            }
        }
        catch {
            // Body is not JSON
        }
        throw new ApiError(response.status, errorDetail);
    }
    const resData = (await response.json());
    if (isGet && cacheTtlMs > 0) {
        setCached(endpoint, resData, cacheTtlMs);
    }
    return resData;
}
export const apiClient = {
    async listMovies(filters = {}) {
        const params = new URLSearchParams();
        if (filters.page)
            params.append('page', filters.page.toString());
        if (filters.page_size)
            params.append('page_size', filters.page_size.toString());
        if (filters.genre)
            params.append('genre', filters.genre);
        if (filters.year)
            params.append('year', filters.year.toString());
        if (filters.quality)
            params.append('quality', filters.quality);
        if (filters.min_rating)
            params.append('min_rating', filters.min_rating.toString());
        if (filters.sort)
            params.append('sort', filters.sort);
        const queryStr = params.toString() ? `?${params.toString()}` : '';
        return request(`/movies${queryStr}`, undefined, 15_000);
    },
    async getHomeCollections() {
        return request('/movies/home', undefined, 30_000);
    },
    async getMovie(id) {
        return request(`/movies/${id}`, undefined, 60_000);
    },
    async searchMovies(query, page = 1, pageSize = 20) {
        const params = new URLSearchParams({
            q: query,
            page: page.toString(),
            page_size: pageSize.toString(),
        });
        return request(`/search?${params.toString()}`);
    },
    async searchMoviesQuick(query, limit = 5) {
        const params = new URLSearchParams({
            q: query,
            page: '1',
            page_size: limit.toString(),
        });
        return request(`/search?${params.toString()}`);
    },
    async listGenres() {
        return request('/genres', undefined, 3600_000);
    },
    async checkLatest() {
        return request('/movies/latest-check');
    },
    async getAudioTracks(movieId) {
        return request(`/movies/${movieId}/audio`);
    },
    async getComments(movieId) {
        return request(`/movies/${movieId}/comments`);
    },
    async postComment(movieId, text) {
        return request(`/movies/${movieId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text }),
        });
    },
    async deleteComment(commentId) {
        return request(`/comments/${commentId}`, {
            method: 'DELETE',
        });
    },
    async updateComment(commentId, text) {
        return request(`/comments/${commentId}`, {
            method: 'PUT',
            body: JSON.stringify({ text }),
        });
    },
    async getReactions(movieId) {
        return request(`/movies/${movieId}/reactions`);
    },
    async toggleReaction(movieId, reaction_type) {
        return request(`/movies/${movieId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ reaction_type }),
        });
    },
    async startPlayback(movieId) {
        return request(`/playback/start`, {
            method: 'POST',
            body: JSON.stringify({ movie_id: movieId }),
        });
    },
    async register(username, email, password) {
        return request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
    },
    async login(usernameOrEmail, password) {
        return request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
        });
    },
    async getCurrentUser(token) {
        return request('/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    },
};
