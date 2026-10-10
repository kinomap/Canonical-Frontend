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
      path: '/metadata',
      name: 'metadata',
      component: () => import('../views/Metadata.vue'),
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
      path: '/garbage',
      name: 'garbage',
      component: () => import('../views/Garbage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/comments',
      name: 'comments',
      component: () => import('../views/Comments.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/telegram',
      name: 'telegram',
      component: () => import('../views/Telegram.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/series',
      name: 'series',
      component: () => import('../views/Series.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/series-management',
      name: 'series-management',
      component: () => import('../views/Series.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/series/:id',
      name: 'series-detail',
      component: () => import('../views/SeriesDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/series-garbage',
      name: 'series-garbage',
      component: () => import('../views/SeriesGarbage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/media-nodes',
      name: 'media-nodes',
      component: () => import('../views/MediaNodes.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/media-nodes/:id',
      name: 'media-node-detail',
      component: () => import('../views/MediaNodeDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/media-sessions',
      name: 'media-sessions',
      component: () => import('../views/MediaSessions.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/media-sessions/:id',
      name: 'media-session-detail',
      component: () => import('../views/MediaSessionDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/media-infrastructure',
      name: 'media-infrastructure',
      component: () => import('../views/MediaInfrastructure.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/security',
      name: 'security-center',
      component: () => import('../views/SecurityCenter.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/system',
      name: 'system',
      component: () => import('../views/System.vue'),
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
