import type {
  AudioTrack,
  AuthTokenResponse,
  Genre,
  HomeCollections,
  LatestCheck,
  MovieDetail,
  MovieFilters,
  PaginatedMovies,
  User,
} from '@/types/movie'

export interface CommentUser {
  id: string
  username: string
}

export interface Comment {
  id: string
  movie_id: string
  user: CommentUser
  text: string
  created_at: string
  updated_at: string
}

export interface MovieReaction {
  reaction_type: string
  count: number
  user_reacted: boolean
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE_URL = '/api/v1'

// ── JWT client-side expiry check ──────────────────────────────────────────────
// Decodes the payload without signature verification (backend still validates).
// Lets us skip the network round-trip when the token is already expired.
function isTokenExpired(token: string): boolean {
  try {
    const payloadB64 = token.split('.')[1]
    if (!payloadB64) return true
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    // exp is Unix seconds; add 10s clock-skew buffer
    return typeof payload.exp === 'number' && Date.now() >= (payload.exp - 10) * 1000
  } catch {
    return true
  }
}

const memoryCache = new Map<string, { data: any; expiresAt: number }>()

function getCached<T>(key: string): T | null {
  const item = memoryCache.get(key)
  if (item && item.expiresAt > Date.now()) {
    return item.data as T
  }
  memoryCache.delete(key)
  return null
}

function setCached(key: string, data: any, ttlMs: number): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function clearClientCache(): void {
  memoryCache.clear()
}

async function request<T>(endpoint: string, options?: RequestInit, cacheTtlMs = 0): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const isGet = !options || !options.method || options.method.toUpperCase() === 'GET'

  if (isGet && cacheTtlMs > 0) {
    const cached = getCached<T>(endpoint)
    if (cached !== null) {
      return cached
    }
  }

  const token = localStorage.getItem('tg_stream_access_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (token && !headers['Authorization']) {
    // Check expiry before attaching — avoids pointless network round-trip
    if (isTokenExpired(token)) {
      window.dispatchEvent(new CustomEvent('auth:expired'))
      throw new ApiError(401, 'Session expired. Please sign in again.')
    }
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const data = await response.json()
      if (data && data.detail) {
        errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
      }
    } catch {
      // Body is not JSON
    }
    // ── Centralized 401 handler ────────────────────────────────────────────
    // Expired / invalid tokens → clear session and redirect to login.
    // Do NOT expose the raw backend error message via alert().
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    throw new ApiError(response.status, errorDetail)
  }

  const resData = (await response.json()) as T
  if (isGet && cacheTtlMs > 0) {
    setCached(endpoint, resData, cacheTtlMs)
  }
  return resData
}

export const apiClient = {
  async listMovies(filters: MovieFilters = {}): Promise<PaginatedMovies> {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.page_size) params.append('page_size', filters.page_size.toString())
    if (filters.genre) params.append('genre', filters.genre)
    if (filters.year) params.append('year', filters.year.toString())
    if (filters.quality) params.append('quality', filters.quality)
    if (filters.min_rating) params.append('min_rating', filters.min_rating.toString())
    if (filters.sort) params.append('sort', filters.sort)

    const queryStr = params.toString() ? `?${params.toString()}` : ''
    return request<PaginatedMovies>(`/movies${queryStr}`, undefined, 15_000)
  },

  async getHomeCollections(): Promise<HomeCollections> {
    return request<HomeCollections>('/movies/home', undefined, 30_000)
  },

  async getMovie(id: string): Promise<MovieDetail> {
    return request<MovieDetail>(`/movies/${id}`, undefined, 60_000)
  },

  async searchMovies(query: string, page = 1, pageSize = 20): Promise<PaginatedMovies> {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      page_size: pageSize.toString(),
    })
    return request<PaginatedMovies>(`/search?${params.toString()}`)
  },

  async searchMoviesQuick(query: string, limit = 5): Promise<PaginatedMovies> {
    const params = new URLSearchParams({
      q: query,
      page: '1',
      page_size: limit.toString(),
    })
    return request<PaginatedMovies>(`/search?${params.toString()}`)
  },

  async listGenres(): Promise<Genre[]> {
    return request<Genre[]>('/genres', undefined, 3600_000)
  },

  async checkLatest(): Promise<LatestCheck> {
    return request<LatestCheck>('/movies/latest-check')
  },

  async getAudioTracks(movieId: string): Promise<AudioTrack[]> {
    return request<AudioTrack[]>(`/movies/${movieId}/audio`)
  },

  async getComments(movieId: string): Promise<Comment[]> {
    return request<Comment[]>(`/movies/${movieId}/comments`)
  },

  async postComment(movieId: string, text: string): Promise<Comment> {
    return request<Comment>(`/movies/${movieId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  async deleteComment(commentId: string): Promise<void> {
    return request<void>(`/comments/${commentId}`, {
      method: 'DELETE',
    })
  },

  async updateComment(commentId: string, text: string): Promise<Comment> {
    return request<Comment>(`/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    })
  },

  async getReactions(movieId: string): Promise<MovieReaction[]> {
    return request<MovieReaction[]>(`/movies/${movieId}/reactions`)
  },

  async toggleReaction(movieId: string, reaction_type: string): Promise<{status: string, action: string}> {
    return request<{status: string, action: string}>(`/movies/${movieId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ reaction_type }),
    })
  },

  async startPlayback(movieId: string): Promise<{ session_id: string, media_endpoint: string, playback_token: string, node_id: string }> {
    return request<{ session_id: string, media_endpoint: string, playback_token: string, node_id: string }>(`/playback/start`, {
      method: 'POST',
      body: JSON.stringify({ movie_id: movieId }),
    })
  },

  async register(username: string, email: string, password: string): Promise<AuthTokenResponse> {
    return request<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    })
  },

  async login(usernameOrEmail: string, password: string): Promise<AuthTokenResponse> {
    return request<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
    })
  },

  async getCurrentUser(token: string): Promise<User> {
    return request<User>('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },
}
