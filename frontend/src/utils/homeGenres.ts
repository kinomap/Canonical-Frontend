import type { GenreCollection } from '@/types/movie'

// Legacy aliases can arrive as separate rows with the same display name.
// Merge presentation only: keep the first working genre link and API ordering.
export function mergeHomeGenreCollections(rows: GenreCollection[] = []): GenreCollection[] {
  const groups = new Map<string, { collection: GenreCollection; movies: Set<string> }>()
  for (const row of rows) {
    const name = row.genre.name.normalize('NFKC').trim().replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase('ru-RU') || row.genre.slug || String(row.genre.id)
    let group = groups.get(key)
    if (!group) {
      group = { collection: { genre: { ...row.genre, name }, movies: [] }, movies: new Set() }
      groups.set(key, group)
    }
    for (const movie of row.movies) {
      const movieKey = `${movie.type ?? 'movie'}:${movie.id}`
      if (group.movies.has(movieKey)) continue
      group.movies.add(movieKey)
      group.collection.movies.push(movie)
    }
  }
  return [...groups.values()].map(group => group.collection)
}
