export interface Genre {
  id: number
  name: string
  slug: string
}

export interface MovieSummary {
  id: string
  type?: 'movie' | 'series'
  title: string
  original_title: string
  year: number | null
  poster: string | null
  rating: number | null
  runtime: number | null
  quality: string | null
  status: string
  genres: Genre[]
}

export interface MovieDetail extends MovieSummary {
  overview: string
  backdrop: string | null
  tmdb_id: number | null
  mime_type: string | null
  file_size: number | null
}

export interface PaginatedMovies {
  items: MovieSummary[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// GET /api/v1/genres/{slug}: available movies first, then available series.
export interface GenreContentPage {
  genre: Genre
  items: (MovieSummary & { type: 'movie' | 'series' })[]
  total: number
  movies_total: number
  series_total: number
  page: number
  page_size: number
  total_pages: number
}

export interface LatestCheck {
  total: number
  latest_created_at: string | null
}

export interface AudioTrack {
  id: number
  track_index: number
  language: string
  title: string
  codec: string
  channels: number
  sample_rate: number
  is_default: boolean
}

export interface MovieFilters {
  page?: number
  page_size?: number
  genre?: string
  year?: number
  quality?: string
  min_rating?: number
  sort?: string
}

export interface YearCollection {
  year: number
  movies: MovieSummary[]
}

export interface GenreCollection {
  genre: Genre
  movies: MovieSummary[]
}

export interface HomeCollections {
  hero: MovieSummary | null
  popular: MovieSummary[]
  newest: MovieSummary[]
  top_rated: MovieSummary[]
  by_year: YearCollection[]
  by_genre: GenreCollection[]
}

export interface User {
  password_login_available?: boolean
  id: string
  username: string
  email: string
  role: string
  status: string
  created_at: string
}

export interface AuthTokenResponse {
  access_token: string
  token_type: string
  user: User
}

export interface SeriesSummary {
  id: string
  title: string
  original_title: string
  year: number | null
  poster_url: string | null
  rating: number | null
  genres: Genre[]
}

export interface SeriesGenreCollection {
  genre: Genre
  series: SeriesSummary[]
}

export interface SeriesHomeCollections {
  new_releases: SeriesSummary[]
  genres: SeriesGenreCollection[]
}

export interface SeriesEpisode {
  id: string
  episode_number: number
  title: string | null
  overview: string | null
  file_size: number | null
  mime_type: string | null
  is_playable?: boolean
}

export interface SeriesSeason {
  id: string
  season_number: number
  episodes: SeriesEpisode[]
}

export interface SeriesDetail extends SeriesSummary {
  overview: string | null
  backdrop_url: string | null
  seasons: SeriesSeason[]
}

export interface PaginatedSeries {
  items: SeriesSummary[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

