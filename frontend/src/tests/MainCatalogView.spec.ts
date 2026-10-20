import {t} from '../i18n'
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MainCatalogView from '@/views/MainCatalogView.vue'
import { apiClient } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock the API client
vi.mock('@/api/client', () => ({
  apiClient: {
    getHomeCollections: vi.fn(),
    checkLatest: vi.fn().mockResolvedValue({ total: 100, latest_created_at: '2026-08-19' })
  }
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: MainCatalogView }]
})

describe('MainCatalogView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TEST D: newest is empty but popular has movies -> frontend does NOT show "Каталог пуст"', async () => {
    vi.mocked(apiClient.getHomeCollections).mockResolvedValueOnce({
      hero: null,
      newest: [],
      popular: [{ id: '1', title: 'Pop' }],
      top_rated: [],
      by_year: [],
      by_genre: []
    } as any)

    const wrapper = mount(MainCatalogView, {
      global: { plugins: [router] }
    })
    
    // wait for async onMounted
    await new Promise(r => setTimeout(r, 10))
    await wrapper.vm.$nextTick()
    
    expect(wrapper.text()).not.toContain(t('Каталог пуст'))
  })

  it('TEST E: newest is empty but by_genre has movies -> frontend still renders the genre rail', async () => {
    vi.mocked(apiClient.getHomeCollections).mockResolvedValueOnce({
      hero: null,
      newest: [],
      popular: [],
      top_rated: [],
      by_year: [],
      by_genre: [{ genre: { id: 1, name: 'Comedy', slug: 'comedy' }, movies: [{ id: '2', title: 'Com' }] }]
    } as any)

    const wrapper = mount(MainCatalogView, {
      global: { plugins: [router] }
    })
    
    await new Promise(r => setTimeout(r, 10))
    await wrapper.vm.$nextTick()
    
    expect(wrapper.text()).not.toContain(t('Каталог пуст'))
    expect(wrapper.text()).toContain('Comedy')
  })

  it('TEST F: all Home collections empty -> frontend DOES show "Каталог пуст"', async () => {
    vi.mocked(apiClient.getHomeCollections).mockResolvedValueOnce({
      hero: null,
      newest: [],
      popular: [],
      top_rated: [],
      by_year: [],
      by_genre: []
    } as any)

    const wrapper = mount(MainCatalogView, {
      global: { plugins: [router] }
    })
    
    await new Promise(r => setTimeout(r, 10))
    await wrapper.vm.$nextTick()
    
    expect(wrapper.text()).toContain(t('Каталог пуст'))
  })
})
