export const catalogViews = {
  '/movies': () => import('@/views/CatalogView.vue'),
  '/series': () => import('@/views/SeriesCatalogView.vue'),
  '/genres': () => import('@/views/GenresView.vue'),
}
const warmed = new Set<string>()
export function warmCatalogLink(event: Event) {
  if ((navigator as Navigator & { connection?: {saveData?: boolean; effectiveType?: string} }).connection?.saveData) return
  const connection = (navigator as Navigator & { connection?: {effectiveType?: string} }).connection
  if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!target) return
  const url = new URL(target.getAttribute('href')!, location.href)
  if (url.origin !== location.origin || warmed.has(url.pathname)) return
  const load = catalogViews[url.pathname as keyof typeof catalogViews]
  if (!load) return
  warmed.add(url.pathname)
  void load().catch(() => warmed.delete(url.pathname))
}
