function trafficReferrer(): string { try { return typeof document !== 'undefined' && /^https?:/.test(document.referrer) ? new URL(document.referrer).origin : '' } catch { return '' } }
import type {
  AudioTrack,
  AuthTokenResponse,
  Genre,
  GenreContentPage,
  HomeCollections,
  LatestCheck,
  MovieDetail,
  MovieFilters,
  PaginatedMovies,
  PaginatedSeries,
  SeriesSummary,
  User,
  SeriesHomeCollections,
  SeriesDetail,
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
    message: string,
    public detail?: { code?: string; message?: string; reason?: string; entitlement?: string }
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Public API base. Default: same-origin '/api/v1' (frontend Nginx proxies it). On a separate
// public frontend host set VITE_API_BASE_URL at build time (e.g. https://api.example.com/api/v1);
// a trailing slash is stripped. Never point it at the Control Plane's private addresses.
const BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1').replace(/\/+$/, '')

// ── JWT client-side expiry check ──────────────────────────────────────────────
// Decodes the payload without signature verification (backend still validates).
// Lets us skip the network round-trip when the token is already expired.
function isTokenExpired(token: string): boolean {
  if (token === 'cookie-session') return false
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

const revalidating = new Set<string>()
const publicListing = (endpoint: string) => /^\/(?:movies(?:\/home)?|series(?:\/home)?|genres)(?:\?|$)/.test(endpoint)
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
  memoryCache.delete(key)
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs })
  while (memoryCache.size > 128) memoryCache.delete(memoryCache.keys().next().value!)
}

export function clearClientCache(): void {
  memoryCache.clear()
}

const inFlight = new Map<string, Promise<unknown>>()
async function request<T>(endpoint: string, options?: RequestInit, cacheTtlMs = 0): Promise<T> {
  const share = (!options?.method || options.method === 'GET') && !options?.signal && cacheTtlMs > 0
  if (!share) return performRequest<T>(endpoint, options, cacheTtlMs)
  const key = endpoint + ':' + (localStorage.getItem('tg_stream_access_token') || '')
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const work = performRequest<T>(endpoint, options, cacheTtlMs)
  inFlight.set(key, work)
  try { return await work } finally { if (inFlight.get(key) === work) inFlight.delete(key) }
}
async function performRequest<T>(endpoint: string, options?: RequestInit, cacheTtlMs = 0): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const isGet = !options || !options.method || options.method.toUpperCase() === 'GET'

  if (isGet && cacheTtlMs > 0) {
    const stale = memoryCache.get(endpoint)
    if (stale && stale.expiresAt <= Date.now() && stale.expiresAt + 60_000 > Date.now() && publicListing(endpoint)) {
      if (!revalidating.has(endpoint)) {
        revalidating.add(endpoint)
        void request<T>(endpoint, options, -cacheTtlMs).catch(() => {}).finally(() => revalidating.delete(endpoint))
      }
      return stale.data as T
    }
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
    let structuredDetail: { code?: string; message?: string; reason?: string; entitlement?: string } | undefined
    try {
      const data = await response.json()
      if (data && data.detail) {
        structuredDetail = typeof data.detail === 'object' && !Array.isArray(data.detail) ? data.detail : undefined
        errorDetail = typeof data.detail === 'string' ? data.detail : structuredDetail?.message || JSON.stringify(data.detail)
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
    throw new ApiError(response.status, errorDetail, structuredDetail)
  }

  const resData = (await response.json()) as T
  if (isGet && cacheTtlMs !== 0) {
    setCached(endpoint, resData, Math.abs(cacheTtlMs))
  }
  return resData
}

export const apiClient = {
  async listMovies(filters: MovieFilters = {}, signal?: AbortSignal): Promise<PaginatedMovies> {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.page_size) params.append('page_size', filters.page_size.toString())
    if (filters.genre) params.append('genre', filters.genre)
    if (filters.year) params.append('year', filters.year.toString())
    if (filters.quality) params.append('quality', filters.quality)
    if (filters.min_rating) params.append('min_rating', filters.min_rating.toString())
    if (filters.sort) params.append('sort', filters.sort)

    const queryStr = params.toString() ? `?${params.toString()}` : ''
    return request<PaginatedMovies>(`/movies${queryStr}`, { signal }, 15_000)
  },

  async getHomeCollections(refresh = false): Promise<HomeCollections> {
    if (refresh) memoryCache.delete('/movies/home')
    return request<HomeCollections>('/movies/home', undefined, 30_000)
  },

  async getSeriesHomeCollections(): Promise<SeriesHomeCollections> {
    return request<SeriesHomeCollections>('/series/home', undefined, 30_000)
  },

  async getSeriesDetail(id: string): Promise<SeriesDetail> {
    return request<SeriesDetail>(`/series/${id}`, undefined, 60_000)
  },

  async getMovie(id: string): Promise<MovieDetail> {
    return request<MovieDetail>(`/movies/${id}`, undefined, 60_000)
  },

  async searchMovies(query: string, page = 1, pageSize = 20, signal?: AbortSignal): Promise<PaginatedMovies> {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      page_size: pageSize.toString(),
    })
    return request<PaginatedMovies>(`/search?${params.toString()}`, { signal })
  },

  async searchMoviesQuick(query: string, limit = 5, signal?: AbortSignal): Promise<PaginatedMovies> {
    const params = new URLSearchParams({
      q: query,
      page: '1',
      page_size: limit.toString(),
    })
    return request<PaginatedMovies>(`/search?${params.toString()}`, { signal })
  },

  async listSeries(filters: MovieFilters = {}, signal?: AbortSignal): Promise<PaginatedSeries> {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.page_size) params.append('page_size', filters.page_size.toString())
    if (filters.genre) params.append('genre', filters.genre)
    if (filters.year) params.append('year', filters.year.toString())
    if (filters.min_rating) params.append('min_rating', filters.min_rating.toString())
    if (filters.sort) params.append('sort', filters.sort)

    if (filters.q) params.append('q', filters.q)

    const queryStr = params.toString() ? `?${params.toString()}` : ''
    return request<PaginatedSeries>(`/series${queryStr}`, { signal }, 15_000)
  },

  async searchSeries(query: string, limit = 20, signal?: AbortSignal): Promise<SeriesSummary[]> {
    const params = new URLSearchParams({
      q: query,
    })
    return request<SeriesSummary[]>(`/series/search?${params.toString()}`, { signal })
  },

  async getGenreContent(slug: string, page = 1, pageSize = 20, sort?: string, signal?: AbortSignal): Promise<GenreContentPage> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    })
    if (sort) params.append('sort', sort)
    return request<GenreContentPage>(`/genres/${encodeURIComponent(slug)}?${params.toString()}`, { signal }, 15_000)
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

  async getComments(targetId: string, targetType: 'movie' | 'series' = 'movie'): Promise<Comment[]> {
    const prefix = targetType === 'series' ? 'series' : 'movies'
    return request<Comment[]>(`/${prefix}/${targetId}/comments`)
  },

  async postComment(targetId: string, targetType: 'movie' | 'series' = 'movie', text: string): Promise<Comment> {
    const prefix = targetType === 'series' ? 'series' : 'movies'
    return request<Comment>(`/${prefix}/${targetId}/comments`, {
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

  async getReactions(targetId: string, targetType: 'movie' | 'series' = 'movie'): Promise<MovieReaction[]> {
    const prefix = targetType === 'series' ? 'series' : 'movies'
    return request<MovieReaction[]>(`/${prefix}/${targetId}/reactions`)
  },

  async toggleReaction(targetId: string, targetType: 'movie' | 'series' = 'movie', reaction_type: string): Promise<{status: string, action: string}> {
    const prefix = targetType === 'series' ? 'series' : 'movies'
    return request<{status: string, action: string}>(`/${prefix}/${targetId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ reaction_type }),
    })
  },

  async diagnosePlayback(movieId: string): Promise<{state: 'available'|'unavailable'|'temporary', code?: string, source_id?: string}> {
    return request('/playback/diagnose', {method: 'POST', body: JSON.stringify({movie_id: movieId})})
  },

  async startPlayback(movieId: string, sourceId?: string): Promise<{ session_id: string, media_endpoint: string, playback_token: string, node_id: string, media_url?: string, source_id?: string, heartbeat_interval_seconds?: number, traffic_id?: string }> {
    return request<{ session_id: string, media_endpoint: string, playback_token: string, node_id: string, media_url?: string, source_id?: string, heartbeat_interval_seconds?: number, traffic_id?: string }>(`/playback/start`, {
      method: 'POST',
      body: JSON.stringify({ movie_id: movieId, ...(sourceId ? {source_id: sourceId} : {}) }),
      headers: { 'X-View-Referrer': trafficReferrer() },
    })
  },

  // ── Playback session lease ─────────────────────────────────────────
  // A started session holds Media Node capacity until it is stopped or its
  // lease lapses. Renew it while the user is actually watching, and release it
  // as soon as watching stops.

  async heartbeatPlayback(sessionId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/playback/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    })
  },

  /**
   * End a playback session. Idempotent, so it is safe to call from several
   * teardown paths (player stopped, component unmounted, tab hidden/closed).
   *
   * `keepalive` lets the request survive the document being torn down during
   * `pagehide`. sendBeacon cannot be used here because it cannot carry the
   * Authorization header this endpoint requires.
   */
  async stopPlayback(sessionId: string, opts: { keepalive?: boolean } = {}): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/playback/stop`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      keepalive: opts.keepalive === true,
    })
  },

  async startSeriesPlayback(episodeId: string): Promise<{ media_endpoint: string, playback_token: string, media_url?: string, traffic_id?: string }> {
    return request<{ media_endpoint: string, playback_token: string, media_url?: string, traffic_id?: string }>(`/series_playback/start`, {
      method: 'POST',
      body: JSON.stringify({ episode_id: episodeId }),
      headers: { 'X-View-Referrer': trafficReferrer() },
    })
  },

  async register(username: string, email: string, password: string): Promise<AuthTokenResponse> {
    return request<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, acquisition_source: sessionStorage.getItem('acquisition_source') || undefined }),
    })
  },

  async login(usernameOrEmail: string, password: string, otp = ''): Promise<AuthTokenResponse> {
    return request<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      headers: otp ? {'X-TOTP-Code':otp} : undefined,
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

// Advertising uses the same authenticated/CSRF-wrapped transport as playback.
export const adRequest = request
