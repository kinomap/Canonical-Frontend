import { describe, it, expect, vi, beforeEach,afterEach } from 'vitest'
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
  let telegramCallback:any

  beforeEach(() => {
    vi.resetAllMocks()
    window.Telegram={Login:{auth:vi.fn((_:any,cb:any)=>{telegramCallback=cb})}}
    vi.stubGlobal('fetch',vi.fn(async(url:any)=>({ok:true,json:async()=>String(url).endsWith('/providers')?{providers:{telegram:true},telegram_bot_id:'123'}:String(url).endsWith('/start')?{state:'fixture-state'}:{access_token:'cookie-session'}})))
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({id:'u-1',username:'testuser',role:'user',status:'active'} as any)
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

  afterEach(()=>{vi.unstubAllGlobals();delete window.Telegram})

  it('LoginView submits native signed Telegram assertion and authenticates user', async () => {
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

    await flushPromises()
    expect(wrapper.findAll('input')).toHaveLength(0)
    await wrapper.get('.social-login button').trigger('click')
    telegramCallback({id:123,auth_date:123,hash:'fixture',first_name:'Fixture'})
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/social/telegram/complete',expect.objectContaining({body:JSON.stringify({state:'fixture-state',user:{id:123,auth_date:123,hash:'fixture',first_name:'Fixture'}})}))
    expect(authStore.isAuthenticated.value).toBe(true)
    expect(authStore.user.value?.username).toBe('testuser')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it.each(['/profile', '/movies', '//external.invalid'])('successful login lands on Home even with redirect=%s', async (redirect) => {
    await router.push({ path: '/login', query: { redirect } })
    vi.mocked(apiClient.login).mockResolvedValueOnce({ access_token: 'cookie-session', token_type: 'bearer', user: { id: 'u-1', username: 'viewer', role: 'user', status: 'active' } } as any)
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.social-login button').trigger('click')
    telegramCallback({id:123,auth_date:123,hash:'fixture',first_name:'Fixture'})
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

    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(authStore.user.value!)
    vi.stubGlobal('fetch',vi.fn(async(input:any)=>({ok:true,json:async()=>String(input).includes('/billing/plans')?[]:String(input).includes('/billing/orders')?{items:[],total:0}:String(input).includes('/billing/activations')?[]:String(input).includes('/account')?{...authStore.user.value,display_name:'activeuser',language:'en',avatar_preset:0,telegram_notifications:false}:({ok:true})})))
    const wrapper = mount(ProfileView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('activeuser')
    expect((wrapper.get('input[type=email]').element as HTMLInputElement).value).toBe('active@test.com')

    const logoutBtn = wrapper.find('.logout')
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
