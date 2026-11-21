import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TvNotFoundView from '@/views/tv/TvNotFoundView.vue'
import { containsEmoji } from '@/views/tv/tvIcons'

describe('TV layer isolation: unknown /tv/* routes', () => {
  it('resolve to the TV 404 inside the TV layer, never the desktop 404', async () => {
    const { default: appRouter } = await import('@/router')
    for (const path of ['/tv/unknown', '/tv/movies/extra/deep', '/tv/torrents/nope']) {
      const route = appRouter.resolve(path)
      expect(route.name).toBe('tv-not-found')
      expect(route.meta.tvLayer).toBe(true)
    }
    expect(appRouter.resolve('/tv/genres/catalog/drama').name).toBe('tv-genre')
    expect(appRouter.resolve('/tv/library').name).toBe('tv-library')
    expect(appRouter.resolve('/something-else').name).toBe('not-found')
  })
})

describe('TvNotFoundView.vue', () => {
  let wrapper: VueWrapper | undefined
  afterEach(() => { wrapper?.unmount(); wrapper = undefined })

  async function mountNotFound() {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/tv', component: { render: () => null } },
      { path: '/tv/:pathMatch(.*)*', component: TvNotFoundView },
    ] })
    await router.push('/tv/unknown')
    await router.isReady()
    wrapper = mount(TvNotFoundView, { global: { plugins: [router] }, attachTo: document.body })
    return router
  }

  it.each(['Enter', 'Escape', 'Backspace'])('%s returns to the TV home', async (key) => {
    const router = await mountNotFound()
    expect(wrapper!.get('[data-testid="tv-not-found-home"]').text()).toContain('Вернуться на главную ТВ')
    expect(containsEmoji(wrapper!.text())).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tv')
  })
})
