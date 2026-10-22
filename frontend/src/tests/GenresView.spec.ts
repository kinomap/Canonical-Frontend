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
  it('uses explicit canonical artwork from API without guessing filenames',async()=>{
    vi.mocked(apiClient.listGenres).mockResolvedValueOnce([
      {id:1,name:'Детектив',slug:'detektiv',artwork:'/genres/v2/detektiv.jpg'},
      {id:2,name:'Телевизионный фильм',slug:'televizionnyj-fil-m',artwork:'/genres/v2/televizionnyj-fil-m.jpg'},
      {id:3,name:'Фэнтези',slug:'fentezi',artwork:'/genres/v2/fentezi.jpg'}
    ])
    const w=mount(GenresView,{global:{plugins:[router]}});await flushPromises()
    const styles=w.findAll('.genre-card-bg').map(c=>c.attributes('style')).join(' ')
    expect(styles).toContain('/genres/v2/detektiv.jpg')
    expect(styles).toContain('/genres/v2/televizionnyj-fil-m.jpg')
    expect(styles).toContain('/genres/v2/fentezi.jpg')
  })

})
