/** Normalised card model of the TV shelves: one shape for catalogue films, series and torrent titles. */
import type { MovieSummary, SeriesSummary } from '@/types/movie'
import { torrentPath, type TorrentItem } from '@/api/torrents'
import { contentPath } from '@/utils/contentPath'
import { posterUrl } from '@/utils/poster'
import type { TvPlayTarget } from './tvPlayback'

export interface TvCard {
  key: string
  title: string
  year: number | null
  rating: number | null
  poster: string | null
  /** Desktop title page of the card (kept for links outside the TV layer). */
  to: string
  /** What Enter / OK plays in the TV player (/tv/player). */
  play: TvPlayTarget
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
    play: { src: 'catalog', kind: 'movie', id: movie.id },
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
    play: { src: 'catalog', kind: 'series', id: series.id },
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
    play: { src: 'torrent', kind: item.kind, id: String(item.tmdb_id) },
  }
}
