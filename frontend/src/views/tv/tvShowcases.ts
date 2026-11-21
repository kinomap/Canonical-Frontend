/**
 * Category showcases of the TV layer (/tv/movies, /tv/series, /tv/torrents*, /tv/genres/:source/:slug, /tv/library):
 * a rotating hero plus shelves. Every shelf uses an existing /api/v1 client method; no new endpoints.
 * «Выбор редакции» has no editorial endpoint in the API, so no showcase invents one.
 */
import { apiClient } from '@/api/client'
import { torrentsApi, type TorrentFilters, type TorrentKind } from '@/api/torrents'
import { libraryApi } from '@/api/library'
import { getHistory } from '@/api/watchHistory'
import { contentPath } from '@/utils/contentPath'
import { posterUrl } from '@/utils/poster'
import type { GenreContentPage, MovieFilters, MovieSummary } from '@/types/movie'
import { movieCard, seriesCard, torrentCard, type TvCard } from './tvCards'

export type TvShowcaseId = 'movies' | 'series' | 'torrents' | 'torrent-movies' | 'torrent-series' | 'genre' | 'library'

export type TvLoader = (signal: AbortSignal) => Promise<TvCard[]>
export interface TvShelfSpec { id: string; title: string; load: TvLoader }
export interface TvShowcaseSpec {
  title: string
  subtitle: string
  hero: TvLoader
  shelves: TvShelfSpec[]
  /** Shown when every shelf came back empty. */
  emptyText: string
}
export interface TvShowcaseParams { source?: string; slug?: string; name?: string; kinds?: TorrentKind[] }

export const SHOWCASE_LIMIT = 20
export const HERO_SIZE = 5

const thisYear = () => new Date().getFullYear()
const none: TvLoader = async () => []

function top(load: TvLoader, size = HERO_SIZE): TvLoader {
  return signal => load(signal).then(cards => cards.slice(0, size))
}

/** One request shared by several shelves of the same showcase load. */
function shared<T>(fetch: (signal: AbortSignal) => Promise<T>) {
  let pending: Promise<T> | null = null
  return (signal: AbortSignal) => (pending ??= fetch(signal))
}

export function catalogMovies(filters: MovieFilters): TvLoader {
  return signal => apiClient.listMovies({ page_size: SHOWCASE_LIMIT, ...filters }, signal).then(page => (page.items ?? []).map(movieCard))
}

export function catalogSeries(filters: MovieFilters): TvLoader {
  return signal => apiClient.listSeries({ page_size: SHOWCASE_LIMIT, ...filters }, signal).then(page => (page.items ?? []).map(seriesCard))
}

export function torrentShelf(kind: TorrentKind, extra: Omit<TorrentFilters, 'kind'> = {}): TvLoader {
  return signal => torrentsApi.list({ kind, ...extra }, signal).then(page => (page.items ?? []).slice(0, SHOWCASE_LIMIT).map(torrentCard))
}

const spotlight: TvLoader = signal => torrentsApi.list({ kind: 'movie', collection: 'spotlight' }, signal).then(page => (page.items ?? []).slice(0, 1).map(torrentCard))

/** Items of GET /api/v1/genres/{slug}: films and series mixed, each with its `type`. */
export function genreItemCard(item: MovieSummary & { type?: 'movie' | 'series' }): TvCard {
  if (item.type !== 'series') return movieCard(item)
  return {
    ...movieCard(item),
    key: `series-${item.id}`,
    to: contentPath('series', item.id, item.title),
    play: { src: 'catalog', kind: 'series', id: item.id },
  }
}

function historyCards(signal: AbortSignal): Promise<TvCard[]> {
  void signal
  return getHistory(1, SHOWCASE_LIMIT).then(page => (page.items ?? [])
    .filter(item => item.available !== false && !item.completed)
    .map(item => ({
      key: `history-${item.movie.id}`,
      title: item.movie.title,
      year: item.movie.year ?? null,
      rating: typeof item.movie.rating === 'number' && item.movie.rating > 0 ? item.movie.rating : null,
      poster: posterUrl(item.movie.poster ?? null) ?? null,
      to: contentPath('movie', item.movie.id, item.movie.title),
      play: { src: 'catalog' as const, kind: 'movie' as const, id: item.movie.id },
    })))
}

function bookmarks(kind: TorrentKind): TvLoader {
  return () => libraryApi.list(1, kind).then(page => (page.items ?? []).map(torrentCard))
}

export function tvShowcase(id: TvShowcaseId, params: TvShowcaseParams = {}): TvShowcaseSpec {
  const year = thisYear()
  switch (id) {
    case 'movies': {
      const popular = catalogMovies({ sort: 'popular' })
      return {
        title: 'Фильмы онлайн', subtitle: 'Каталог KINOSOTA', hero: top(popular),
        shelves: [
          { id: 'popular', title: 'Популярное сейчас', load: popular },
          { id: 'new', title: 'Новинки этого года', load: catalogMovies({ year, sort: 'newest' }) },
          { id: 'top', title: 'Высокий рейтинг (8.0+)', load: catalogMovies({ min_rating: 8, sort: 'rating_desc' }) },
        ],
        emptyText: 'Фильмы сейчас недоступны. Попробуйте чуть позже.',
      }
    }
    case 'series': {
      const popular = catalogSeries({ sort: 'popular' })
      return {
        title: 'Сериалы онлайн', subtitle: 'Каталог KINOSOTA', hero: top(popular),
        shelves: [
          { id: 'popular', title: 'Популярное сейчас', load: popular },
          { id: 'new', title: 'Новинки этого года', load: catalogSeries({ year, sort: 'newest' }) },
          { id: 'top', title: 'Высокий рейтинг (8.0+)', load: catalogSeries({ min_rating: 8, sort: 'rating_desc' }) },
        ],
        emptyText: 'Сериалы сейчас недоступны. Попробуйте чуть позже.',
      }
    }
    case 'torrents':
      return {
        title: 'Торрент хаб', subtitle: '4K и свежие релизы', hero: spotlight,
        shelves: [
          { id: 'movies', title: 'Популярные фильмы', load: torrentShelf('movie') },
          { id: 'series', title: 'Популярные сериалы', load: torrentShelf('tv') },
          { id: 'new', title: 'Новинки этого года', load: torrentShelf('movie', { year: String(year) }) },
          { id: 'top', title: 'Высокий рейтинг (8.0+)', load: torrentShelf('movie', { rating: '8' }) },
        ],
        emptyText: 'Торрент-каталог сейчас недоступен. Попробуйте чуть позже.',
      }
    case 'torrent-movies':
    case 'torrent-series': {
      const kind: TorrentKind = id === 'torrent-movies' ? 'movie' : 'tv'
      const popular = torrentShelf(kind)
      return {
        title: kind === 'movie' ? 'Торрент-фильмы' : 'Торрент-сериалы', subtitle: 'Торрент хаб',
        hero: kind === 'movie' ? spotlight : top(popular),
        shelves: [
          { id: 'popular', title: 'Популярное сейчас', load: popular },
          { id: 'new', title: 'Новинки этого года', load: torrentShelf(kind, { year: String(year) }) },
          { id: 'top', title: 'Высокий рейтинг (8.0+)', load: torrentShelf(kind, { rating: '8' }) },
        ],
        emptyText: 'Торрент-каталог сейчас недоступен. Попробуйте чуть позже.',
      }
    }
    case 'genre': {
      const name = params.name || 'Жанр'
      const slug = params.slug ?? ''
      if (params.source === 'torrents') {
        const kinds = params.kinds?.length ? params.kinds : (['movie', 'tv'] as TorrentKind[])
        const shelves = kinds.map(kind => ({ id: kind, title: kind === 'movie' ? 'Фильмы' : 'Сериалы', load: torrentShelf(kind, { genre: slug }) }))
        return { title: name, subtitle: 'Торрент-жанры', hero: shelves[0] ? top(shelves[0].load) : none, shelves, emptyText: 'В этом жанре пока ничего нет.' }
      }
      const page = shared<GenreContentPage>(signal => apiClient.getGenreContent(slug, 1, SHOWCASE_LIMIT * 2, undefined, signal))
      const of = (type: 'movie' | 'series'): TvLoader => signal => page(signal).then(result => (result.items ?? []).filter(item => (item.type ?? 'movie') === type).map(genreItemCard))
      return {
        title: name, subtitle: 'Жанры каталога KINOSOTA',
        hero: top(signal => page(signal).then(result => (result.items ?? []).map(genreItemCard))),
        shelves: [
          { id: 'movies', title: 'Фильмы', load: of('movie') },
          { id: 'series', title: 'Сериалы', load: of('series') },
        ],
        emptyText: 'В этом жанре пока ничего нет.',
      }
    }
    case 'library':
      return {
        title: 'Кинотека', subtitle: 'История и закладки', hero: none,
        shelves: [
          { id: 'history', title: 'Продолжить просмотр', load: historyCards },
          { id: 'saved-movies', title: 'Закладки: фильмы', load: bookmarks('movie') },
          { id: 'saved-series', title: 'Закладки: сериалы', load: bookmarks('tv') },
        ],
        emptyText: 'Здесь появятся история просмотра и закладки. Войдите в аккаунт: «Профиль» в меню.',
      }
  }
}
