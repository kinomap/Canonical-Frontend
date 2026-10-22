import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GenresView from '@/views/GenresView.vue'
import { apiClient } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    listGenres: vi.fn()
  }
}))

describe('GenresView.vue', () => {
  let router: any

  beforeEach(() => {
    vi.resetAllMocks()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/genres', component: GenresView },
        { path: '/movies', component: { template: '<div>Catalog</div>' } }
      ]
    })
  })

  it('renders list of genres as navigation cards', async () => {
    vi.mocked(apiClient.listGenres).mockResolvedValueOnce([
      { id: 1, name: 'Action', slug: 'action' },
      { id: 2, name: 'Drama', slug: 'drama' }
    ])

    const wrapper = mount(GenresView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Action')
    expect(wrapper.text()).toContain('Drama')
    expect(wrapper.findAll('.genre-card').length).toBe(2)
  })

  it('renders error state on API error', async () => {
    vi.mocked(apiClient.listGenres).mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(GenresView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.genres-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Network error')
  })
  it('maps canonical genre slugs to real shipped artwork',async()=>{
    vi.mocked(apiClient.listGenres).mockResolvedValueOnce([
      {id:1,name:'Mystery',slug:'mystery'},
      {id:2,name:'TV',slug:'televizionnyj-fil-m'},
      {id:3,name:'Fantasy',slug:'fentezi'}
    ])
    const w=mount(GenresView,{global:{plugins:[router]}});await flushPromises()
    const styles=w.findAll('.genre-card-bg').map(c=>c.attributes('style')).join(' ')
    expect(styles).toContain('/genres/detektiv.jpg')
    expect(styles).toContain('/genres/televizionnyj-film.jpg')
    expect(styles).toContain('/genres/fjentezi.jpg')
  })

})
