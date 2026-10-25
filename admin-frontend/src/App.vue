<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import ToastContainer from './components/ToastContainer.vue'
import BrandMark from '../../design-system/BrandMark.vue'

const route = useRoute()
const router = useRouter()
const mobileNavOpen = ref(false)
watch(() => route.fullPath, () => { mobileNavOpen.value = false })

const pageNames: Record<string, string> = {'dashboard':'Обзор','movies':'Фильмы','metadata':'Метаданные','series':'Сериалы','movie-detail':'Карточка фильма','series-detail':'Карточка сериала','ad-studio':'Ad Studio','audience':'Пользователи и развитие','telegram':'Telegram-источники','security-center':'Security Center','account-security':'Безопасность аккаунта','media-nodes':'Медиа-ноды','media-node-detail':'Медиа-нода','media-sessions':'Медиа-сессии','media-session-detail':'Медиа-сессия','media-infrastructure':'Мониторинг','system':'Состояние системы','domains':'Домены','comments':'Комментарии','without-poster':'Без постера','blocked':'Заблокировано','garbage':'Корзина','series-garbage':'Корзина сериалов','descriptions':'Описания'}
const pageName = computed(() => pageNames[String(route.name)] || 'Управление')
const isLoginPage = computed(() => route.name === 'login')

const logout = async () => {
  try { await fetch('/api/v1/auth/logout', {method:'POST'}) } catch {}
  localStorage.removeItem('admin_token')
  router.push('/login')
}
</script>

<template>
  <div v-if="isLoginPage">
    <router-view />
    <ToastContainer />
  </div>
  <div v-else class="admin-layout">
    <a class="skip-link" href="#admin-main">Перейти к содержимому</a>
    <ToastContainer />
    <header class="mobile-header"><BrandMark /><button type="button" aria-controls="admin-navigation" :aria-expanded="mobileNavOpen" @click="mobileNavOpen = !mobileNavOpen">{{ mobileNavOpen ? 'Закрыть меню' : 'Открыть меню' }}</button></header>
    <aside id="admin-navigation" class="sidebar" :class="{ 'sidebar--open': mobileNavOpen }">
      <div class="sidebar-header"><BrandMark /><span class="brand-sub">Управление кинотеатром</span></div>
      <nav class="sidebar-nav" aria-label="Разделы администрирования">
        <router-link to="/account-security" class="nav-item" active-class="nav-item--active">Безопасность · 2FA</router-link>
        <router-link to="/" class="nav-item" exact-active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Обзор
        </router-link>

        <div class="nav-section-label">
          Контент
        </div>

        <router-link to="/movies" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
            <line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
          Фильмы
        </router-link>

        <router-link to="/metadata" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Метаданные
        </router-link>

        <router-link to="/series" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Сериалы
        </router-link>

        <router-link to="/series-garbage" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
          Корзина сериалов
        </router-link>

        <router-link to="/blocked" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          Заблокировано
        </router-link>

        <router-link to="/without-poster" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Без постера
        </router-link>

        <router-link to="/garbage" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
          Корзина
        </router-link>

        <router-link to="/comments" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Комментарии
        </router-link>

        <div class="nav-section-label">Источники</div>

        <router-link to="/telegram" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
          </svg>
          Telegram
        </router-link>

        <div class="nav-section-label">Медиа-инфраструктура</div>

        <router-link to="/media-infrastructure" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Мониторинг
        </router-link>

        <router-link to="/media-nodes" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          Медиа-узлы
        </router-link>

        <router-link to="/media-sessions" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
          </svg>
          Sessions
        </router-link>

        <router-link to="/ad-studio" class="nav-item" active-class="nav-item--active"><span>Видео и Реклама (Ad Studio)</span></router-link>
            <router-link to="/audience" class="nav-item" active-class="nav-item--active">Пользователи / Маркетинг / Подписки</router-link>
        <div class="nav-section-label">
          Система
        </div>

        <router-link to="/system" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Health &amp; Workers
        </router-link>

        <router-link to="/domains" class="nav-item" active-class="nav-item--active">
          Домены и Cloudflare
        </router-link>
        <router-link to="/security" class="nav-item" active-class="nav-item--active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Центр безопасности
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <button @click="logout" class="logout-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Выйти
        </button>
      </div>
    </aside>
    <main id="admin-main" tabindex="-1" class="main-content">
      <div class="workspace-bar"><div class="workspace-crumb"><span>KINOSOTA</span><span aria-hidden="true">/</span><strong>{{ pageName }}</strong></div><span class="workspace-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>Панель администратора</span></div>
      <router-view />
    </main>
  </div>
</template>

<style>
@import './admin-theme.css';
</style>
