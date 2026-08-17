/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { apiClient } from '@/api/client';
import HeroBanner from '@/components/HeroBanner.vue';
import MovieRail from '@/components/MovieRail.vue';
import PlayNoticeModal from '@/components/PlayNoticeModal.vue';
const collections = ref(null);
const loading = ref(true);
const error = ref(null);
const showPlayNotice = ref(false);
async function loadHome() {
    loading.value = true;
    error.value = null;
    try {
        collections.value = await apiClient.getHomeCollections();
    }
    catch (err) {
        console.error('Home API Error:', err);
        error.value = 'Не удалось загрузить каталог';
    }
    finally {
        loading.value = false;
    }
}
function handlePlayNotice() {
    showPlayNotice.value = true;
}
onMounted(() => {
    loadHome();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['home-error']} */ ;
/** @type {__VLS_StyleScopedClasses['home-error']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-page" },
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-loading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-skeleton" },
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
            ...{ class: "card-skeleton" },
        });
    }
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-error" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "error-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "48",
        height: "48",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadHome) },
        ...{ class: "retry-btn" },
    });
}
else if (__VLS_ctx.collections) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-content" },
    });
    if (__VLS_ctx.collections.hero) {
        /** @type {[typeof HeroBanner, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(HeroBanner, new HeroBanner({
            ...{ 'onPlay': {} },
            movie: (__VLS_ctx.collections.hero),
        }));
        const __VLS_1 = __VLS_0({
            ...{ 'onPlay': {} },
            movie: (__VLS_ctx.collections.hero),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        let __VLS_3;
        let __VLS_4;
        let __VLS_5;
        const __VLS_6 = {
            onPlay: (__VLS_ctx.handlePlayNotice)
        };
        var __VLS_2;
    }
    /** @type {[typeof MovieRail, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
        ...{ 'onPlay': {} },
        title: "Популярное",
        movies: (__VLS_ctx.collections.popular),
        viewAllLink: "/movies?sort=popular",
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onPlay': {} },
        title: "Популярное",
        movies: (__VLS_ctx.collections.popular),
        viewAllLink: "/movies?sort=popular",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onPlay: (__VLS_ctx.handlePlayNotice)
    };
    var __VLS_9;
    /** @type {[typeof MovieRail, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
        ...{ 'onPlay': {} },
        title: "Новые фильмы",
        movies: (__VLS_ctx.collections.newest),
        viewAllLink: "/movies?sort=newest",
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onPlay': {} },
        title: "Новые фильмы",
        movies: (__VLS_ctx.collections.newest),
        viewAllLink: "/movies?sort=newest",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_17;
    let __VLS_18;
    let __VLS_19;
    const __VLS_20 = {
        onPlay: (__VLS_ctx.handlePlayNotice)
    };
    var __VLS_16;
    /** @type {[typeof MovieRail, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
        ...{ 'onPlay': {} },
        title: "Лучший рейтинг",
        movies: (__VLS_ctx.collections.top_rated),
        viewAllLink: "/movies?sort=rating_desc",
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onPlay': {} },
        title: "Лучший рейтинг",
        movies: (__VLS_ctx.collections.top_rated),
        viewAllLink: "/movies?sort=rating_desc",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onPlay: (__VLS_ctx.handlePlayNotice)
    };
    var __VLS_23;
    if (__VLS_ctx.collections.by_year && __VLS_ctx.collections.by_year.length) {
        for (const [yearItem] of __VLS_getVForSourceType((__VLS_ctx.collections.by_year))) {
            /** @type {[typeof MovieRail, ]} */ ;
            // @ts-ignore
            const __VLS_28 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
                ...{ 'onPlay': {} },
                key: (yearItem.year),
                title: (`Фильмы ${yearItem.year} года`),
                movies: (yearItem.movies),
                viewAllLink: (`/movies?year=${yearItem.year}`),
            }));
            const __VLS_29 = __VLS_28({
                ...{ 'onPlay': {} },
                key: (yearItem.year),
                title: (`Фильмы ${yearItem.year} года`),
                movies: (yearItem.movies),
                viewAllLink: (`/movies?year=${yearItem.year}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_28));
            let __VLS_31;
            let __VLS_32;
            let __VLS_33;
            const __VLS_34 = {
                onPlay: (__VLS_ctx.handlePlayNotice)
            };
            var __VLS_30;
        }
    }
    if (__VLS_ctx.collections.by_genre && __VLS_ctx.collections.by_genre.length) {
        for (const [genreItem] of __VLS_getVForSourceType((__VLS_ctx.collections.by_genre))) {
            /** @type {[typeof MovieRail, ]} */ ;
            // @ts-ignore
            const __VLS_35 = __VLS_asFunctionalComponent(MovieRail, new MovieRail({
                ...{ 'onPlay': {} },
                key: (genreItem.genre.id),
                title: (genreItem.genre.name),
                movies: (genreItem.movies),
                viewAllLink: (`/movies?genre=${genreItem.genre.slug}`),
            }));
            const __VLS_36 = __VLS_35({
                ...{ 'onPlay': {} },
                key: (genreItem.genre.id),
                title: (genreItem.genre.name),
                movies: (genreItem.movies),
                viewAllLink: (`/movies?genre=${genreItem.genre.slug}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_35));
            let __VLS_38;
            let __VLS_39;
            let __VLS_40;
            const __VLS_41 = {
                onPlay: (__VLS_ctx.handlePlayNotice)
            };
            var __VLS_37;
        }
    }
}
/** @type {[typeof PlayNoticeModal, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(PlayNoticeModal, new PlayNoticeModal({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}));
const __VLS_43 = __VLS_42({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
let __VLS_45;
let __VLS_46;
let __VLS_47;
const __VLS_48 = {
    onClose: (...[$event]) => {
        __VLS_ctx.showPlayNotice = false;
    }
};
var __VLS_44;
/** @type {__VLS_StyleScopedClasses['home-page']} */ ;
/** @type {__VLS_StyleScopedClasses['home-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-skeleton-title']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-skeleton-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['card-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['home-error']} */ ;
/** @type {__VLS_StyleScopedClasses['error-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['home-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HeroBanner: HeroBanner,
            MovieRail: MovieRail,
            PlayNoticeModal: PlayNoticeModal,
            collections: collections,
            loading: loading,
            error: error,
            showPlayNotice: showPlayNotice,
            loadHome: loadHome,
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
