/** Genre cards of the TV genres screen: catalogue genres (GET /api/v1/genres) and TMDB torrent genres. */
import type { Genre } from '@/types/movie'
import type { TmdbGenre, TorrentKind } from '@/api/torrents'

export type TvGenreSource = 'catalog' | 'torrents'

export interface TvGenreCard {
  key: string
  /** Catalogue slug, or the TMDB genre id for torrents. */
  slug: string
  title: string
  icon: string
  source: TvGenreSource
  kinds: TorrentKind[]
}

/** Stems of genre names (Russian catalogue + TMDB ru) → icon; first match wins, fallback 🎬. */
const ICONS: [string, string][] = [
  ['боевик', '⚔️'], ['приключ', '🧭'], ['комед', '😄'], ['фантаст', '🚀'], ['нф ', '🚀'],
  ['ужас', '👻'], ['триллер', '⚡'], ['детектив', '🔍'], ['мелодрам', '💞'], ['драм', '🎭'],
  ['семей', '👨‍👩‍👧'], ['мульт', '✨'], ['аниме', '🌸'], ['кримин', '🕵️'], ['фэнтези', '🐉'],
  ['воен', '🎖️'], ['войн', '🎖️'], ['истор', '📜'], ['документ', '🎥'], ['музык', '🎵'], ['мюзикл', '🎤'],
  ['вестерн', '🤠'], ['биограф', '📖'], ['спорт', '🏅'], ['детск', '🧸'], ['реалити', '📡'],
  ['ток-шоу', '🎙️'], ['новост', '📰'], ['мыльн', '🧼'], ['телефильм', '📺'],
]

export function genreIcon(name: string): string {
  const value = ` ${name.toLocaleLowerCase('ru-RU')} `
  return ICONS.find(([stem]) => value.includes(stem))?.[1] ?? '🎬'
}

export function genreTitle(name: string): string {
  return name.slice(0, 1).toLocaleUpperCase('ru-RU') + name.slice(1)
}

export function catalogGenreCards(genres: Genre[]): TvGenreCard[] {
  return genres
    .filter(genre => genre.slug && genre.name)
    .map(genre => ({ key: `catalog-${genre.slug}`, slug: genre.slug, title: genreTitle(genre.name), icon: genreIcon(genre.name), source: 'catalog' as const, kinds: [] }))
}

/** TMDB genres of films and series merged by id (one card «Драма» opens both kinds). */
export function torrentGenreCards(lists: { kind: TorrentKind; items: TmdbGenre[] }[]): TvGenreCard[] {
  const byId = new Map<number, TvGenreCard>()
  for (const { kind, items } of lists) {
    for (const genre of items) {
      const card = byId.get(genre.id)
      if (card) { if (!card.kinds.includes(kind)) card.kinds.push(kind); continue }
      byId.set(genre.id, { key: `torrents-${genre.id}`, slug: String(genre.id), title: genreTitle(genre.name), icon: genreIcon(genre.name), source: 'torrents', kinds: [kind] })
    }
  }
  return [...byId.values()]
}

export function tvGenreLocation(card: TvGenreCard) {
  const query: Record<string, string> = { name: card.title }
  if (card.source === 'torrents' && card.kinds.length) query.kinds = card.kinds.join(',')
  return { path: `/tv/genres/${card.source}/${encodeURIComponent(card.slug)}`, query }
}
