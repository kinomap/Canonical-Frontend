import { ref, computed } from 'vue';
import { apiClient } from '@/api/client';
const TOKEN_KEY = 'tg_stream_access_token';
const USER_KEY = 'tg_stream_user';
function getInitialUser() {
    try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
const token = ref(localStorage.getItem(TOKEN_KEY));
const user = ref(getInitialUser());
const loading = ref(false);
export function useAuthStore() {
    const isAuthenticated = computed(() => !!token.value);
    function setToken(newToken) {
        token.value = newToken;
        if (newToken) {
            localStorage.setItem(TOKEN_KEY, newToken);
        }
        else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            user.value = null;
        }
    }
    function setUser(newUser) {
        user.value = newUser;
        if (newUser) {
            localStorage.setItem(USER_KEY, JSON.stringify(newUser));
        }
        else {
            localStorage.removeItem(USER_KEY);
        }
    }
    async function fetchCurrentUser() {
        if (!token.value)
            return null;
        loading.value = true;
        try {
            const u = await apiClient.getCurrentUser(token.value);
            setUser(u);
            return u;
        }
        catch {
            // Token invalid or expired
            setToken(null);
            setUser(null);
            return null;
        }
        finally {
            loading.value = false;
        }
    }
    async function login(usernameOrEmail, password) {
        const resp = await apiClient.login(usernameOrEmail, password);
        setToken(resp.access_token);
        setUser(resp.user);
        return resp;
    }
    async function register(username, email, password) {
        const resp = await apiClient.register(username, email, password);
        setToken(resp.access_token);
        setUser(resp.user);
        return resp;
    }
    function logout() {
        setToken(null);
        setUser(null);
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
    };
}
