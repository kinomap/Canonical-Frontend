/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { apiClient } from '@/api/client';
import MovieRail from '@/components/MovieRail.vue';
// ── State ─────────────────────────────────────────────────────────────────────
const collections = ref(null);
const loading = ref(true);
const error = ref(null);
// New-movie notification
const newMovieCount = ref(0);
const knownTotal = ref(null);
const knownLatest = ref(null);
const showNewBanner = ref(false);
const hasAnyMovies = computed(() => {
    if (!collections.value)
        return false;
    const c = collections.value;
    return ((c.newest && c.newest.length > 0) ||
        (c.popular && c.popular.length > 0) ||
        (c.top_rated && c.top_rated.length > 0) ||
        (c.by_year && c.by_year.some(y => y.movies.length > 0)) ||
        (c.by_genre && c.by_genre.some(g => g.movies.length > 0)) ||
        !!c.hero);
});
// ── Load movies ───────────────────────────────────────────────────────────────
async function loadHome(silent = false) {
    if (!silent && !collections.value) {
        loading.value = true;
        error.value = null;
    }
    try {
        const data = await apiClient.getHomeCollections();
        collections.value = data;
        // We update the baseline from the checkLatest response later, but let's initialize if empty
        if (knownTotal.value === null && data.newest) {
            // It's hard to get true "total" from home collections alone, so we'll rely on checkLatest
            checkForNewMovies(true); // init baseline silently
        }
    }
    catch (err) {
        if (!silent && !collections.value) {
            error.value = err?.message ?? 'Не удалось загрузить каталог';
        }
    }
    finally {
        loading.value = false;
    }
}
// ── Smart refresh (latest-check) ──────────────────────────────────────────────
async function checkForNewMovies(initOnly = false) {
    if (document.hidden && !initOnly)
        return;
    try {
        const check = await apiClient.checkLatest();
        if (initOnly) {
            knownTotal.value = check.total;
            knownLatest.value = check.latest_created_at;
            return;
        }
        if (knownTotal.value !== null) {
            const diff = check.total - knownTotal.value;
            if (diff > 0) {
                newMovieCount.value = diff;
                showNewBanner.value = true;
            }
        }
        else {
            knownTotal.value = check.total;
        }
        // Update latest timestamp
        knownLatest.value = check.latest_created_at;
    }
    catch {
        // Silent
    }
}
let refreshInterval = null;
function startRefresh() {
    if (refreshInterval)
        return;
    refreshInterval = setInterval(() => checkForNewMovies(), 60_000);
}
function stopRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}
function handleVisibilityChange() {
    if (!document.hidden) {
        checkForNewMovies();
        startRefresh();
    }
    else {
        stopRefresh();
    }
}
// ── Show new movies ───────────────────────────────────────────────────────────
async function showNewMovies() {
    showNewBanner.value = false;
    knownTotal.value = knownTotal.value + newMovieCount.value;
    newMovieCount.value = 0;
    await loadHome(true); // silently reload the page to get newest movies
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function dismissBanner() {
    showNewBanner.value = false;
    knownTotal.value = knownTotal.value + newMovieCount.value;
    newMovieCount.value = 0;
}
// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
    await loadHome();
    startRefresh();
    document.addEventListener('visibilitychange', handleVisibilityChange);
});
onUnmounted(() => {
    stopRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['banner-show-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "catalog-page" },
});
const __VLS_0 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    name: "slide-down",
}));
const __VLS_2 = __VLS_1({
    name: "slide-down",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.showNewBanner) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "new-movie-banner" },
        role: "alert",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "banner-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "banner-text" },
    });
    (__VLS_ctx.newMovieCount === 1 ? 'Добавлен новый фильм' : `Добавлено новых фильмов: ${__VLS_ctx.newMovieCount}`);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.showNewMovies) },
        ...{ class: "banner-show-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.dismissBanner) },
        ...{ class: "banner-close-btn" },
        'aria-label': "Закрыть",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "18",
        y1: "6",
        x2: "6",
        y2: "18",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "6",
        y1: "6",
        x2: "18",
        y2: "18",
    });
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "catalog-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "catalog-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    width: "28",
    height: "28",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "2",
    ...{ class: "title-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
    points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-loading" },
    });
    for (const [j] of __VLS_getVForSourceType((3))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (j),
            ...{ class: "skeleton-rail" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rail-skeleton-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rail-skeleton-cards" },
        });
        for (const [i] of __VLS_getVForSourceType((5))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ class: "skeleton-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "skeleton-poster" },
            });
        }
    }
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-panel error-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "56",
        height: "56",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "10",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "12",
        y1: "8",
        x2: "12",
        y2: "12",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "12",
        y1: "16",
        x2: "12.01",
        y2: "16",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "state-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "state-desc" },
    });
    (__VLS_ctx.error);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!(__VLS_ctx.error))
                    return;
                __VLS_ctx.loadHome(false);
            } },
        ...{ class: "retry-btn" },
    });
}
else if (__VLS_ctx.collections && !__VLS_ctx.hasAnyMovies) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-panel empty-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "56",
        height: "56",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "2",
        y: "2",
        width: "20",
        height: "20",
        rx: "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 8v8M8 12h8",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "state-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "state-desc" },
    });
}
else if (__VLS_ctx.collections) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-content" },
    });
    /** @type {[typeof MovieRail, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
        title: "Новинки",
        movies: (__VLS_ctx.collections.newest),
        viewAllLink: "/movies?sort=newest",
        eager: true,
    }));
    const __VLS_5 = __VLS_4({
        title: "Новинки",
        movies: (__VLS_ctx.collections.newest),
        viewAllLink: "/movies?sort=newest",
        eager: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    if (__VLS_ctx.collections.by_genre && __VLS_ctx.collections.by_genre.length) {
        for (const [genreItem] of __VLS_getVForSourceType((__VLS_ctx.collections.by_genre))) {
            /** @type {[typeof MovieRail, ]} */ ;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
                key: (genreItem.genre.id),
                title: (genreItem.genre.name),
                movies: (genreItem.movies),
                viewAllLink: (`/genres?genre=${genreItem.genre.slug}`),
            }));
            const __VLS_8 = __VLS_7({
                key: (genreItem.genre.id),
                title: (genreItem.genre.name),
                movies: (genreItem.movies),
                viewAllLink: (`/genres?genre=${genreItem.genre.slug}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        }
    }
}
/** @type {__VLS_StyleScopedClasses['catalog-page']} */ ;
/** @type {__VLS_StyleScopedClasses['new-movie-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-text']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-show-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-title']} */ ;
/** @type {__VLS_StyleScopedClasses['title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['home-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-skeleton-title']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-skeleton-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-poster']} */ ;
/** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['error-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['state-title']} */ ;
/** @type {__VLS_StyleScopedClasses['state-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['state-title']} */ ;
/** @type {__VLS_StyleScopedClasses['state-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['home-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MovieRail: MovieRail,
            collections: collections,
            loading: loading,
            error: error,
            newMovieCount: newMovieCount,
            showNewBanner: showNewBanner,
            hasAnyMovies: hasAnyMovies,
            loadHome: loadHome,
            showNewMovies: showNewMovies,
            dismissBanner: dismissBanner,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
