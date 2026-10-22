import { nextTick } from 'vue'
import type { Router, RouterScrollBehavior } from 'vue-router'

/** Only return to an internal listing, never an external page or another film. */
export function listingHistoryBack(back: unknown): string | null {
  return typeof back === 'string' && /^\/(?:movies|series|genres|discover)?(?:[?#]|$)/.test(back) ? back : null
}

export function catalogPage(value: unknown): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function returnToListing(router: Pick<Router, 'back' | 'push'>, event: MouseEvent,
  back: unknown = window.history.state?.back): void {
  // Preserve normal anchor semantics for new tabs / modified clicks.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (listingHistoryBack(back)) router.back()
  else void router.push('/movies')
}

/** Native history owns each entry's exact URL and scroll position. Wait for
 * async catalogue rows before restoring it, otherwise the short skeleton clips
 * the saved offset. A newer navigation cancels an older pending restoration. */
export function createCatalogScrollBehavior(): RouterScrollBehavior {
  let generation = 0
  let cancelPending: (() => void) | undefined
  return async (to, _from, savedPosition) => {
    const current = ++generation
    cancelPending?.()
    await nextTick()
    if (current !== generation) return false
    if (to.name === 'catalog' && savedPosition) {
      await new Promise<void>((resolve) => {
        const finish = () => { observer.disconnect(); clearTimeout(timer); cancelPending = undefined; resolve() }
        const observer = new MutationObserver(() => { if (document.querySelector('.catalog-page[data-catalog-ready="true"]')) finish() })
        const timer = setTimeout(finish, 10000)
        cancelPending = finish
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-catalog-ready'] })
        if (document.querySelector('.catalog-page[data-catalog-ready="true"]')) finish()
      })
    }
    if (current !== generation) return false
    return savedPosition || { left: 0, top: 0 }
  }
}
