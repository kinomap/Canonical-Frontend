import { catalogViews } from './catalogViews'
import { createRouter, createWebHistory } from 'vue-router'
import MainCatalogView from '@/views/MainCatalogView.vue'
const HomeView = () => import('@/views/HomeView.vue')
const CatalogView = catalogViews['/movies']
const GenresView = catalogViews['/genres']
const MovieDetailsView = () => import('@/views/MovieDetailsView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const RegisterView = () => import('@/views/RegisterView.vue')
const ProfileView = () => import('@/views/ProfileView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
import { createCatalogScrollBehavior } from './catalogNavigation'
import { handleChunkLoadError } from './chunkReload'
import { updateRouteSeo } from '@/utils/routeSeo'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: createCatalogScrollBehavior(),
  routes: [
    {path:'/torrents', name:'torrent-catalog', component:()=>import('@/views/TorrentCatalogView.vue')},
    {path:'/torrents/library',name:'torrent-library',component:()=>import('@/views/LibraryView.vue'),meta:{requiresAuth:true}},
    {path:'/torrents/:kind/:id', name:'torrent-detail', component:()=>import('@/views/TorrentCatalogView.vue')},
    {
      path: '/',
      name: 'home',
      component: MainCatalogView,
    },
    {
      path: '/discover',
      name: 'discover',
      component: HomeView,
    },
    {
      path: '/movies',
      name: 'catalog',
      component: CatalogView,
    },
    {
      path: '/series',
      name: 'series-catalog',
      component: catalogViews['/series'],
    },
    {
      path: '/series/:id/:slug?',
      name: 'series-details',
      component: () => import('@/views/SeriesDetailsView.vue'),
    },
    {
      path: '/genres',
      name: 'genres',
      component: GenresView
    },
    {
      path: '/movies/:id/:slug?',
      name: 'movie-details',
      component: MovieDetailsView
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView
    },
    { path: '/player', name: 'desktop-player', component: () => import('@/views/DesktopPlayerView.vue') },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true }
    },
    {
      path: '/404',
      name: 'not-found-direct',
      component: NotFoundView
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('tg_stream_access_token')
  if (to.meta.requiresAuth && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

// A lazy route chunk from a previous deploy cannot be loaded: reload the target URL
// once instead of silently aborting the navigation (see chunkReload.ts).
let pendingNavigation: string | null = null

/** Target of the navigation currently resolving lazy route components, if any. */
export function getPendingNavigation(): string | null {
  return pendingNavigation
}

router.beforeEach((to) => {
  pendingNavigation = to.fullPath
})
router.afterEach((to) => {
  pendingNavigation = null
  void updateRouteSeo(to.fullPath)
})
router.onError((err, to) => {
  const target = to?.fullPath ?? pendingNavigation ?? window.location.pathname + window.location.search
  pendingNavigation = null
  if (!handleChunkLoadError(err, target)) {
    console.error('Router navigation error:', err)
  }
})

export default router
