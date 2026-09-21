import { createRouter, createWebHistory } from 'vue-router';
import MainCatalogView from '@/views/MainCatalogView.vue';
import HomeView from '@/views/HomeView.vue';
import CatalogView from '@/views/CatalogView.vue';
import GenresView from '@/views/GenresView.vue';
import MovieDetailsView from '@/views/MovieDetailsView.vue';
import LoginView from '@/views/LoginView.vue';
import RegisterView from '@/views/RegisterView.vue';
import ProfileView from '@/views/ProfileView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
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
            component: () => import('@/views/SeriesCatalogView.vue'),
        },
        {
            path: '/series/:id',
            name: 'series-details',
            component: () => import('@/views/SeriesDetailsView.vue'),
        },
        {
            path: '/genres',
            name: 'genres',
            component: GenresView
        },
        {
            path: '/movies/:id',
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
});
router.beforeEach((to, _from, next) => {
    const token = localStorage.getItem('tg_stream_access_token');
    if (to.meta.requiresAuth && !token) {
        next({ path: '/login', query: { redirect: to.fullPath } });
    }
    else {
        next();
    }
});
export default router;
