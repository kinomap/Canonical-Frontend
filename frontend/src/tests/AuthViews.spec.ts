import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import ProfileView from '@/views/ProfileView.vue'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({
  apiClient: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn()
  }
}))

describe('Auth Views & Store', () => {
  let router: any
  let authStore: any

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    authStore = useAuthStore()
    authStore.setToken(null)

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/movies', component: { template: '<div>Catalog</div>' } },
        { path: '/login', component: LoginView },
        { path: '/register', component: RegisterView },
        { path: '/profile', component: ProfileView, meta: { requiresAuth: true } }
      ]
    })

    router.beforeEach((to: any, _from: any, next: any) => {
      const token = localStorage.getItem('tg_stream_access_token')
      if (to.meta.requiresAuth && !token) {
        next({ path: '/login', query: { redirect: to.fullPath } })
      } else {
        next()
      }
    })
  })

  it('LoginView submits credentials and authenticates user', async () => {
    const mockUser = {
      id: 'u-1',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
      created_at: '2026-08-16T10:00:00Z'
    }

    vi.mocked(apiClient.login).mockResolvedValueOnce({
      access_token: 'mock-jwt-token',
      token_type: 'bearer',
      user: mockUser
    })

    const wrapper = mount(LoginView, {
      global: { plugins: [router] }
    })

    const inputs = wrapper.findAll('.form-input')
    await inputs[0].setValue('testuser')
    await inputs[1].setValue('password123')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(apiClient.login).toHaveBeenCalledWith('testuser', 'password123')
    expect(authStore.isAuthenticated.value).toBe(true)
    expect(authStore.user.value?.username).toBe('testuser')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it.each(['/profile', '/movies', '//external.invalid'])('successful login lands on Home even with redirect=%s', async (redirect) => {
    await router.push({ path: '/login', query: { redirect } })
    vi.mocked(apiClient.login).mockResolvedValueOnce({ access_token: 'cookie-session', token_type: 'bearer', user: { id: 'u-1', username: 'viewer', role: 'user', status: 'active' } } as any)
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    const inputs = wrapper.findAll('.form-input')
    await inputs[0].setValue('viewer')
    await inputs[1].setValue('synthetic-password')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })

  it('successful registration lands on Home', async () => {
    await router.push('/register')
    vi.mocked(apiClient.register).mockResolvedValueOnce({ access_token: 'cookie-session', token_type: 'bearer', user: { id: 'u-2', username: 'newviewer', role: 'user', status: 'active' } } as any)
    const wrapper = mount(RegisterView, { global: { plugins: [router] } })
    const inputs = wrapper.findAll('.form-input')
    for (const [i, value] of ['newviewer', 'new@example.test', 'synthetic-password', 'synthetic-password'].entries()) await inputs[i].setValue(value)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(apiClient.register).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })

  it('RegisterView validates matching passwords before submit', async () => {
    const wrapper = mount(RegisterView, {
      global: { plugins: [router] }
    })

    const inputs = wrapper.findAll('.form-input')
    await inputs[0].setValue('newuser')
    await inputs[1].setValue('newuser@test.com')
    await inputs[2].setValue('password123')
    await inputs[3].setValue('different_password')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Passwords do not match')
    expect(apiClient.register).not.toHaveBeenCalled()
  })

  it('ProfileView displays user profile info and logs out', async () => {
    authStore.setToken('mock-jwt-token')
    authStore.user.value = {
      id: 'u-1',
      username: 'activeuser',
      email: 'active@test.com',
      role: 'user',
      status: 'active',
      created_at: '2026-08-16T10:00:00Z'
    }

    const wrapper = mount(ProfileView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('activeuser')
    expect(wrapper.text()).toContain('active@test.com')

    const logoutBtn = wrapper.find('.logout-btn')
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(authStore.isAuthenticated.value).toBe(false)
  })

  it('Protected route redirects unauthenticated user to /login', async () => {
    authStore.logout()
    await router.push('/profile')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
  })
})
