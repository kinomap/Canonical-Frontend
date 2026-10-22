import axios from 'axios'
import '../httpClient'
import { safeReturnPath } from '../sessionNavigation'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {path:'/ad-studio',name:'ad-studio',component:()=>import('../views/AdStudio.vue'),meta:{requiresAuth:true}},
    {path:'/account-security',name:'account-security',component:()=>import('../views/AccountSecurity.vue'),meta:{requiresAuth:true}},
    {path:'/audience',name:'audience',component:()=>import('../views/Audience.vue'),meta:{requiresAuth:true}},
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
      path: '/domains',
      name: 'domains',
      component: () => import('../views/Domains.vue'),
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

router.beforeEach(async to => {
  if (!to.meta.requiresAuth) return true
  // localStorage is only a UI marker. The server decides whether a session exists.
  try {
    const {data} = await axios.get('/api/v1/auth/me', {timeout:10000})
    if (data.role !== 'admin') {
      localStorage.removeItem('admin_token')
      return {name:'login',query:{reason:'forbidden'}}
    }
    localStorage.setItem('admin_token','cookie-session')
    return true
  } catch (error: any) {
    if (error.response?.status === 401) localStorage.removeItem('admin_token')
    return {name:'login',query:{reason:error.response?.status === 401?'expired':'unavailable',redirect:safeReturnPath(to.fullPath)}}
  }
})

export default router
