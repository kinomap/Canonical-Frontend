import {t} from '../i18n'
// The "Series" tab: header link -> application router -> lazy SeriesCatalogView ->
// GET /series -> cards; plus browser back/forward and direct URL open.
// Uses the real application router (router/index.ts) and the real backend
// response shape (fixtures/series-list.json captured from the backend via Nginx).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import seriesList from './fixtures/series-list.json'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    apiClient: {
      listGenres: vi.fn().mockResolvedValue([]),
      listSeries: vi.fn(),
      searchSeries: vi.fn().mockResolvedValue([]),
      getHomeCollections: vi.fn().mockResolvedValue({ hero: null, popular: [], newest: [], top_rated: [], by_year: [], by_genre: [] }),
      getSeriesHome: vi.fn().mockResolvedValue({ new_releases: [], by_genre: [] }),
      checkLatest: vi.fn().mockResolvedValue({ total: 0, latest_created_at: null }),
      listMovies: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
      searchMovies: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
    },
  }
})

import { apiClient } from '@/api/client'
import router from '@/router'
import AppHeader from '@/components/AppHeader.vue'

const Shell = defineComponent({ render: () => h('div', [h(AppHeader), h(RouterView)]) })

async function waitForPath(path: string, timeoutMs = 5000) {
  // first navigation to a lazy route compiles/imports the chunk asynchronously
  const start = Date.now()
  while (router.currentRoute.value.path !== path && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 20))
  }
  await settle()
}

async function settle() {
  // lazy route import + API promise + render
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
  }
}

describe('Series tab navigation', () => {
  beforeEach(async () => {
    vi.mocked(apiClient.listSeries).mockReset().mockResolvedValue(seriesList as any)
    localStorage.clear()
    await router.push('/genres')
    await router.isReady()
  })

  it('opens the series catalog from the header link and renders backend items', async () => {
    const wrapper = mount(Shell, { global: { plugins: [router] }, attachTo: document.body })
    await settle()
    const link = wrapper.find('a.nav-link[href="/series"]')
    expect(link.exists()).toBe(true)
    await link.trigger('click')
    await waitForPath('/series')

    expect(router.currentRoute.value.fullPath).toBe('/series')
    expect(wrapper.text()).toContain(t('Каталог сериалов'))
    expect(apiClient.listSeries).toHaveBeenCalled()
    const first = (seriesList as any).items[0]
    expect(wrapper.text()).toContain(first.title)
    expect(wrapper.find(`a[href="/series/${first.id}"]`).exists()).toBe(true)
    wrapper.unmount()
  })

  it('supports browser back and forward between Genres and Series', async () => {
    const wrapper = mount(Shell, { global: { plugins: [router] }, attachTo: document.body })
    await settle()
    await wrapper.find('a.nav-link[href="/series"]').trigger('click')
    await waitForPath('/series')
    expect(router.currentRoute.value.path).toBe('/series')

    router.back()
    await settle()
    expect(router.currentRoute.value.path).toBe('/genres')

    router.forward()
    await settle()
    expect(router.currentRoute.value.path).toBe('/series')
    expect(wrapper.text()).toContain(t('Каталог сериалов'))
    wrapper.unmount()
  })

  it('opens /series directly', async () => {
    await router.push('/series')
    const wrapper = mount(Shell, { global: { plugins: [router] }, attachTo: document.body })
    await settle()
    expect(wrapper.text()).toContain((seriesList as any).items[0].title)
    wrapper.unmount()
  })

  it('shows the error state when the series API really fails', async () => {
    vi.mocked(apiClient.listSeries).mockReset().mockRejectedValue(new Error('HTTP 502'))
    await router.push('/series')
    const wrapper = mount(Shell, { global: { plugins: [router] }, attachTo: document.body })
    await settle()
    expect(wrapper.find('.error-state').exists()).toBe(true)
    wrapper.unmount()
  })
})
