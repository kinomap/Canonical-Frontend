import { ref, computed } from 'vue'
import type { User } from '@/types/movie'
import { apiClient } from '@/api/client'

const TOKEN_KEY = 'tg_stream_access_token'
const USER_KEY = 'tg_stream_user'

function getInitialUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
const user = ref<User | null>(getInitialUser())
const loading = ref(false)

export function useAuthStore() {
  const isAuthenticated = computed(() => !!token.value)

  function setToken(newToken: string | null) {
    newToken = newToken ? 'cookie-session' : null
    token.value = newToken
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      user.value = null
    }
  }

  function setUser(newUser: User | null) {
    user.value = newUser
    if (newUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  }

  async function fetchCurrentUser() {
    if (!token.value) return null
    loading.value = true
    try {
      const u = await apiClient.getCurrentUser(token.value)
      setUser(u)
      return u
    } catch {
      // Token invalid or expired
      setToken(null)
      setUser(null)
      return null
    } finally {
      loading.value = false
    }
  }

  async function login(usernameOrEmail: string, password: string) {
    const resp = await apiClient.login(usernameOrEmail, password)
    setToken(resp.access_token)
    setUser(resp.user)
    return resp
  }

  async function register(username: string, email: string, password: string) {
    const resp = await apiClient.register(username, email, password)
    setToken(resp.access_token)
    setUser(resp.user)
    return resp
  }

  async function logout() {
    try { await fetch('/api/v1/auth/logout', {method:'POST'}) } catch { /* clear local state even offline */ }
    setToken(null)
    setUser(null)
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    setToken,
    fetchCurrentUser,
    login,
    register,
    logout,
  }
}
