import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AppHeader from '@/components/AppHeader.vue'
import { createRouter, createMemoryHistory } from 'vue-router'

describe('AppHeader.vue Branding', () => {
  let router: any

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/movies', component: { template: '<div>Movies</div>' } },
        { path: '/genres', component: { template: '<div>Genres</div>' } },
        { path: '/login', component: { template: '<div>Login</div>' } }
      ]
    })
  })

  it('renders KINOSOTA logo and contains no Telegram Stream text', async () => {
    const wrapper = mount(AppHeader, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('KINOSOTA')
    expect(wrapper.text()).not.toContain('Telegram Stream')
    expect(wrapper.text()).not.toContain('Telegram')
  })
})
