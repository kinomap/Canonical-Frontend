/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import MovieCard from '@/components/MovieCard.vue';
import PlayNoticeModal from '@/components/PlayNoticeModal.vue';
import { AlertCircle, SearchX } from 'lucide-vue-next';
const route = useRoute();
const router = useRouter();
const movies = ref([]);
const genres = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const selectedGenre = ref(route.query.genre || '');
const selectedYear = ref(route.query.year || '');
const selectedQuality = ref(route.query.quality || '');
const selectedMinRating = ref(route.query.min_rating || '');
const selectedSort = ref(route.query.sort || 'popular');
const searchQuery = ref(route.query.q || '');
const loading = ref(true);
const error = ref(null);
const showPlayNotice = ref(false);
const totalPages = computed(() => {
    return Math.ceil(total.value / pageSize.value) || 1;
});
async function fetchGenres() {
    try {
        genres.value = await apiClient.listGenres();
    }
    catch (err) {
        console.error('Failed to load genres', err);
    }
}
let abortController = null;
async function loadMovies() {
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;
    loading.value = true;
    error.value = null;
    try {
        if (searchQuery.value.trim().length > 0) {
            const res = await apiClient.searchMovies(searchQuery.value.trim(), page.value, pageSize.value, signal);
            movies.value = res.items;
            total.value = res.total;
        }
        else {
            const filters = {
                page: page.value,
                page_size: pageSize.value,
                genre: selectedGenre.value || undefined,
                year: selectedYear.value ? parseInt(selectedYear.value, 10) : undefined,
                quality: selectedQuality.value || undefined,
                min_rating: selectedMinRating.value ? parseFloat(selectedMinRating.value) : undefined,
                sort: selectedSort.value || undefined,
            };
            const res = await apiClient.listMovies(filters, signal);
            movies.value = res.items;
            total.value = res.total;
        }
    }
    catch (err) {
        if (err.name === 'AbortError')
            return;
        console.error('Catalog API Error:', err);
        error.value = 'Не удалось загрузить каталог';
    }
    finally {
        if (!abortController?.signal.aborted) {
            loading.value = false;
        }
    }
}
function updateQueryParams() {
    const query = {};
    if (searchQuery.value)
        query.q = searchQuery.value;
    if (selectedGenre.value)
        query.genre = selectedGenre.value;
    if (selectedYear.value)
        query.year = selectedYear.value;
    if (selectedQuality.value)
        query.quality = selectedQuality.value;
    if (selectedMinRating.value)
        query.min_rating = selectedMinRating.value;
    if (selectedSort.value && selectedSort.value !== 'popular')
        query.sort = selectedSort.value;
    if (page.value > 1)
        query.page = page.value.toString();
    router.replace({ query });
}
function onFilterChange() {
    page.value = 1;
    updateQueryParams();
    loadMovies();
}
function clearAllFilters() {
    selectedGenre.value = '';
    selectedYear.value = '';
    selectedQuality.value = '';
    selectedMinRating.value = '';
    selectedSort.value = 'popular';
    searchQuery.value = '';
    page.value = 1;
    router.replace({ query: {} });
    loadMovies();
}
function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages.value) {
        page.value = newPage;
        updateQueryParams();
        loadMovies();
        try {
            if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        catch { }
    }
}
function handlePlayNotice() {
    showPlayNotice.value = true;
}
watch(() => route.query, (newQuery) => {
    selectedGenre.value = newQuery.genre || '';
    selectedYear.value = newQuery.year || '';
    selectedQuality.value = newQuery.quality || '';
    selectedMinRating.value = newQuery.min_rating || '';
    selectedSort.value = newQuery.sort || 'popular';
    searchQuery.value = newQuery.q || '';
    if (newQuery.page)
        page.value = parseInt(newQuery.page, 10) || 1;
    loadMovies();
});
onMounted(() => {
    fetchGenres();
    loadMovies();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['state-container']} */ ;
/** @type {__VLS_StyleScopedClasses['state-container']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-text']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-text']} */ ;
/** @type {__VLS_StyleScopedClasses['page-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "catalog-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "catalog-title-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "page-title" },
});
if (__VLS_ctx.searchQuery) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.searchQuery);
}
else if (__VLS_ctx.selectedGenre) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedGenre);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "catalog-count" },
});
(__VLS_ctx.total);
(__VLS_ctx.total === 1 ? 'movie' : 'movies');
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "catalog-content" },
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "movie-grid skeleton-grid" },
    });
    for (const [i] of __VLS_getVForSourceType((8))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (i),
            ...{ class: "skeleton-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "skeleton-poster" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "skeleton-text line-1" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "skeleton-text line-2" },
        });
    }
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-container error-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon text-red" },
    });
    const __VLS_0 = {}.AlertCircle;
    /** @type {[typeof __VLS_components.AlertCircle, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: (48),
        strokeWidth: "2",
    }));
    const __VLS_2 = __VLS_1({
        size: (48),
        strokeWidth: "2",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadMovies) },
        ...{ class: "retry-btn" },
    });
}
else if (__VLS_ctx.movies.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-container empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon" },
    });
    const __VLS_4 = {}.SearchX;
    /** @type {[typeof __VLS_components.SearchX, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        size: (48),
        strokeWidth: "1.5",
    }));
    const __VLS_6 = __VLS_5({
        size: (48),
        strokeWidth: "1.5",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    if (__VLS_ctx.searchQuery) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.searchQuery);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearAllFilters) },
        ...{ class: "retry-btn" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "movie-grid" },
    });
    for (const [movie] of __VLS_getVForSourceType((__VLS_ctx.movies))) {
        /** @type {[typeof MovieCard, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(MovieCard, new MovieCard({
            ...{ 'onPlay': {} },
            key: (movie.id),
            movie: (movie),
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onPlay': {} },
            key: (movie.id),
            movie: (movie),
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_11;
        let __VLS_12;
        let __VLS_13;
        const __VLS_14 = {
            onPlay: (__VLS_ctx.handlePlayNotice)
        };
        var __VLS_10;
    }
}
if (!__VLS_ctx.loading && !__VLS_ctx.error && __VLS_ctx.movies.length > 0 && __VLS_ctx.totalPages > 1) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pagination" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && !__VLS_ctx.error && __VLS_ctx.movies.length > 0 && __VLS_ctx.totalPages > 1))
                    return;
                __VLS_ctx.changePage(__VLS_ctx.page - 1);
            } },
        ...{ class: "page-btn" },
        disabled: (__VLS_ctx.page <= 1),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "page-info" },
    });
    (__VLS_ctx.page);
    (__VLS_ctx.totalPages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && !__VLS_ctx.error && __VLS_ctx.movies.length > 0 && __VLS_ctx.totalPages > 1))
                    return;
                __VLS_ctx.changePage(__VLS_ctx.page + 1);
            } },
        ...{ class: "page-btn" },
        disabled: (__VLS_ctx.page >= __VLS_ctx.totalPages),
    });
}
/** @type {[typeof PlayNoticeModal, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(PlayNoticeModal, new PlayNoticeModal({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}));
const __VLS_16 = __VLS_15({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
let __VLS_18;
let __VLS_19;
let __VLS_20;
const __VLS_21 = {
    onClose: (...[$event]) => {
        __VLS_ctx.showPlayNotice = false;
    }
};
var __VLS_17;
/** @type {__VLS_StyleScopedClasses['catalog-page']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-title-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-count']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-content']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-poster']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-text']} */ ;
/** @type {__VLS_StyleScopedClasses['line-1']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-text']} */ ;
/** @type {__VLS_StyleScopedClasses['line-2']} */ ;
/** @type {__VLS_StyleScopedClasses['state-container']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['text-red']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['state-container']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['page-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['page-info']} */ ;
/** @type {__VLS_StyleScopedClasses['page-btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MovieCard: MovieCard,
            PlayNoticeModal: PlayNoticeModal,
            AlertCircle: AlertCircle,
            SearchX: SearchX,
            movies: movies,
            total: total,
            page: page,
            selectedGenre: selectedGenre,
            searchQuery: searchQuery,
            loading: loading,
            error: error,
            showPlayNotice: showPlayNotice,
            totalPages: totalPages,
            loadMovies: loadMovies,
            clearAllFilters: clearAllFilters,
            changePage: changePage,
            handlePlayNotice: handlePlayNotice,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
