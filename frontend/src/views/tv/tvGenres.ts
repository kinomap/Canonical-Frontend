/** Genre cards of the TV genres screen: catalogue genres (GET /api/v1/genres) and TMDB torrent genres. */
import type { Genre } from '@/types/movie'
import type { TmdbGenre, TorrentKind } from '@/api/torrents'
import type { TvIconName } from './tvIcons'

export type TvGenreSource = 'catalog' | 'torrents'

/** Atmospheric gradient of a genre card (TvGenresView.vue `.theme-*`). */
export type TvGenreTheme = 'fire' | 'indigo' | 'mystic' | 'amber' | 'noir' | 'rose' | 'violet' | 'emerald' | 'gold' | 'ocean' | 'steel'

export interface TvGenreCard {
  key: string
  /** Catalogue slug, or the TMDB genre id for torrents. */
  slug: string
  title: string
  /** Vector sticker of the genre (tvIcons.ts), never an emoji. */
  icon: TvIconName
  theme: TvGenreTheme
  source: TvGenreSource
  kinds: TorrentKind[]
}

/** Stems of genre names (Russian catalogue + TMDB ru) → sticker + gradient; first match wins, fallback clapperboard. */
const STYLES: [string, TvIconName, TvGenreTheme][] = [
  ['боевик', 'flame', 'fire'], ['приключ', 'compass', 'emerald'], ['комед', 'smile', 'amber'], ['фантаст', 'rocket', 'indigo'], ['нф ', 'rocket', 'indigo'],
  ['ужас', 'ghost', 'mystic'], ['триллер', 'pulse', 'noir'], ['детектив', 'search', 'noir'], ['мелодрам', 'heart', 'rose'], ['драм', 'genres', 'violet'],
  ['семей', 'family', 'gold'], ['мульт', 'sparkles', 'ocean'], ['аниме', 'sparkles', 'rose'], ['кримин', 'fingerprint', 'noir'], ['фэнтези', 'wand', 'indigo'],
  ['воен', 'medal', 'steel'], ['войн', 'medal', 'steel'], ['истор', 'scroll', 'gold'], ['документ', 'camera', 'ocean'], ['музык', 'note', 'violet'], ['мюзикл', 'mic', 'rose'],
  ['вестерн', 'cactus', 'amber'], ['биограф', 'book', 'gold'], ['спорт', 'trophy', 'emerald'], ['детск', 'balloon', 'ocean'], ['реалити', 'broadcast', 'steel'],
  ['ток-шоу', 'mic', 'steel'], ['новост', 'news', 'steel'], ['мыльн', 'bubbles', 'rose'], ['телефильм', 'series', 'ocean'],
]

function genreStyle(name: string): [TvIconName, TvGenreTheme] {
  const value = ` ${name.toLocaleLowerCase('ru-RU')} `
  const match = STYLES.find(([stem]) => value.includes(stem))
  return match ? [match[1], match[2]] : ['movies', 'steel']
}

export function genreIcon(name: string): TvIconName {
  return genreStyle(name)[0]
}

export function genreTheme(name: string): TvGenreTheme {
  return genreStyle(name)[1]
}

export function genreTitle(name: string): string {
  return name.slice(0, 1).toLocaleUpperCase('ru-RU') + name.slice(1)
}

export function catalogGenreCards(genres: Genre[]): TvGenreCard[] {
  return genres
    .filter(genre => genre.slug && genre.name)
    .map(genre => ({
      key: `catalog-${genre.slug}`,
      slug: genre.slug,
      title: genreTitle(genre.name),
      icon: genreIcon(genre.name),
      theme: genreTheme(genre.name),
      source: 'catalog' as const,
      kinds: [],
    }))
}

/** TMDB genres of films and series merged by id (one card «Драма» opens both kinds). */
export function torrentGenreCards(lists: { kind: TorrentKind; items: TmdbGenre[] }[]): TvGenreCard[] {
  const byId = new Map<number, TvGenreCard>()
  for (const { kind, items } of lists) {
    for (const genre of items) {
      const card = byId.get(genre.id)
      if (card) { if (!card.kinds.includes(kind)) card.kinds.push(kind); continue }
      byId.set(genre.id, {
        key: `torrents-${genre.id}`,
        slug: String(genre.id),
        title: genreTitle(genre.name),
        icon: genreIcon(genre.name),
        theme: genreTheme(genre.name),
        source: 'torrents',
        kinds: [kind],
      })
    }
  }
  return [...byId.values()]
}

export function tvGenreLocation(card: TvGenreCard) {
  const query: Record<string, string> = { name: card.title }
  if (card.source === 'torrents' && card.kinds.length) query.kinds = card.kinds.join(',')
  return { path: `/tv/genres/${card.source}/${encodeURIComponent(card.slug)}`, query }
}
