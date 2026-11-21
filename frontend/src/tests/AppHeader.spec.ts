import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AppHeader from '@/components/AppHeader.vue'
import TvConnectModal from '@/components/TvConnectModal.vue'
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

describe('AppHeader.vue TV menu entry', () => {
  let router: any

  beforeEach(async () => {
    vi.resetAllMocks()
    localStorage.clear()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/movies', component: { template: '<div>Movies</div>' } },
        { path: '/series', component: { template: '<div>Series</div>' } },
        { path: '/genres', component: { template: '<div>Genres</div>' } },
        { path: '/torrents', component: { template: '<div>Torrents</div>' } },
        { path: '/login', component: { template: '<div>Login</div>' } },
        { path: '/register', component: { template: '<div>Register</div>' } }
      ]
    })
    router.push('/')
    await router.isReady()
  })

  function mountHeader() {
    return mount(AppHeader, { global: { plugins: [router], stubs: { teleport: true } } })
  }

  it('shows a "ТВ" item in the desktop navigation right after "Торренты"', async () => {
    const wrapper = mountHeader()
    await flushPromises()
    const nav = wrapper.get('nav.desktop-nav')
    const tv = nav.get('[data-testid="header-tv-desktop"]')
    expect(tv.text()).toBe('ТВ')
    expect(tv.find('svg').exists()).toBe(true)
    const items = nav.findAll(':scope > .nav-link, :scope > details')
    const labels = items.map(item => item.text())
    expect(labels.indexOf('ТВ')).toBe(labels.indexOf('Торренты') + 1)
  })

  it('opens TvConnectModal from the desktop "ТВ" item and closes it again', async () => {
    const wrapper = mountHeader()
    await flushPromises()
    const modal = wrapper.findComponent(TvConnectModal)
    expect(modal.props('show')).toBe(false)
    expect(wrapper.find('[data-testid="tv-connect-modal"]').exists()).toBe(false)

    await wrapper.get('[data-testid="header-tv-desktop"]').trigger('click')
    expect(modal.props('show')).toBe(true)
    expect(wrapper.find('[data-testid="tv-connect-modal"]').exists()).toBe(true)

    await wrapper.get('[data-testid="tv-connect-close"]').trigger('click')
    expect(modal.props('show')).toBe(false)
  })

  it('shows "ТВ" in the mobile menu and opens the modal while closing the drawer', async () => {
    const wrapper = mountHeader()
    await flushPromises()
    expect(wrapper.find('[data-testid="header-tv-mobile"]').exists()).toBe(false)

    await wrapper.get('.mobile-hamburger-btn').trigger('click')
    const mobileTv = wrapper.get('nav.mobile-nav [data-testid="header-tv-mobile"]')
    expect(mobileTv.text()).toBe('ТВ')

    await mobileTv.trigger('click')
    expect(wrapper.find('.mobile-menu-drawer').exists()).toBe(false)
    expect(wrapper.findComponent(TvConnectModal).props('show')).toBe(true)
  })

  it('does not load the TV layer itself (no /tv navigation on click)', async () => {
    const wrapper = mountHeader()
    await flushPromises()
    await wrapper.get('[data-testid="header-tv-desktop"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
