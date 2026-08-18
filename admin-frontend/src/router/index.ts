import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue')
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/movies',
      name: 'movies',
      component: () => import('../views/Movies.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/movies/:id',
      name: 'movie-detail',
      component: () => import('../views/MovieDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/blocked',
      name: 'blocked',
      component: () => import('../views/Blocked.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/without-poster',
      name: 'without-poster',
      component: () => import('../views/WithoutPoster.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/descriptions',
      name: 'descriptions',
      component: () => import('../views/Descriptions.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/system',
      name: 'system',
      component: () => import('../views/System.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/telegram',
      name: 'telegram',
      component: () => import('../views/Telegram.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('admin_token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
