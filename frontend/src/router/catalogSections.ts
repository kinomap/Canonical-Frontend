import type { LocationQuery } from 'vue-router'

// Business edition: matches the server's home.newest collection, not arrival date.
export const NEW_RELEASE_YEAR = 2026
export const NEW_RELEASES_URL = `/movies?year=${NEW_RELEASE_YEAR}&sort=newest`
export const TOP_RATED_URL = '/movies?min_rating=0.1&sort=rating_desc'

/** Old bookmarked Novinki URLs had sort only. Keep them scoped too. Sorting in
 * the API (and the series catalogue) remains independent of the year filter. */
export function movieCatalogYear(query: LocationQuery): string {
  if (typeof query.year === 'string' && query.year) return query.year
  return !query.q && query.sort === 'newest' ? String(NEW_RELEASE_YEAR) : ''
}
