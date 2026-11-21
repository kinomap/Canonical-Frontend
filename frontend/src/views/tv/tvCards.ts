/** Normalised card model of the TV shelves: one shape for catalogue films, series and torrent titles. */
import type { MovieSummary, SeriesSummary } from '@/types/movie'
import { torrentPath, type TorrentItem } from '@/api/torrents'
import { contentPath } from '@/utils/contentPath'
import { posterUrl } from '@/utils/poster'

export interface TvCard {
  key: string
  title: string
  year: number | null
  rating: number | null
  poster: string | null
  /** Where Enter / OK leads. Title pages of the TV layer replace these in a later stage. */
  to: string
}

function rating(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

export function movieCard(movie: MovieSummary): TvCard {
  return {
    key: `movie-${movie.id}`,
    title: movie.title,
    year: movie.year,
    rating: rating(movie.rating),
    poster: posterUrl(movie.poster) ?? null,
    to: contentPath('movie', movie.id, movie.title),
  }
}

export function seriesCard(series: SeriesSummary): TvCard {
  return {
    key: `series-${series.id}`,
    title: series.title,
    year: series.year,
    rating: rating(series.rating),
    poster: posterUrl(series.poster_url) ?? null,
    to: contentPath('series', series.id, series.title),
  }
}

export function torrentCard(item: TorrentItem): TvCard {
  return {
    key: `torrent-${item.kind}-${item.tmdb_id}`,
    title: item.title,
    year: item.year,
    rating: rating(item.rating),
    poster: item.poster,
    to: torrentPath(item),
  }
}
