/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import MovieCard from '@/components/MovieCard.vue';
import PlayNoticeModal from '@/components/PlayNoticeModal.vue';
import { ArrowRight, ArrowLeft, AlertCircle, SearchX } from 'lucide-vue-next';
const route = useRoute();
const router = useRouter();
const genres = ref([]);
const loading = ref(false);
const error = ref(null);
// Genre content state
const selectedGenreSlug = ref(route.query.genre || '');
const genreItems = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const contentLoading = ref(false);
const contentError = ref(null);
const showPlayNotice = ref(false);
const totalPages = computed(() => {
    return Math.ceil(total.value / pageSize.value) || 1;
});
const activeGenreName = computed(() => {
    if (!selectedGenreSlug.value)
        return '';
    const g = genres.value.find(item => item.slug === selectedGenreSlug.value);
    if (g)
        return g.name;
    return selectedGenreSlug.value.charAt(0).toUpperCase() + selectedGenreSlug.value.slice(1);
});
async function loadGenres() {
    error.value = null;
    loading.value = true;
    try {
        genres.value = await apiClient.listGenres();
    }
    catch (err) {
        error.value = err?.message || 'Failed to load genres';
    }
    finally {
        loading.value = false;
    }
}
async function loadGenreContent() {
    if (!selectedGenreSlug.value)
        return;
    contentLoading.value = true;
    contentError.value = null;
    try {
        const res = await apiClient.getGenreContent(selectedGenreSlug.value, page.value, pageSize.value);
        genreItems.value = res.items;
        total.value = res.total;
    }
    catch (err) {
        console.error('Genre Content API Error:', err);
        contentError.value = 'Не удалось загрузить контент жанра';
    }
    finally {
        contentLoading.value = false;
    }
}
function selectGenre(slug) {
    selectedGenreSlug.value = slug;
    page.value = 1;
    router.push({ query: { genre: slug } });
    loadGenreContent();
}
function clearGenreSelection() {
    selectedGenreSlug.value = '';
    genreItems.value = [];
    page.value = 1;
    router.push({ query: {} });
}
function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages.value) {
        page.value = newPage;
        router.push({ query: { genre: selectedGenreSlug.value, page: newPage.toString() } });
        loadGenreContent();
        try {
            if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        catch { }
    }
}
function onImageError(e) {
    const target = e.target;
    target.style.backgroundImage = 'linear-gradient(135deg, #1f2028 0%, #26293a 100%)';
}
watch(() => route.query, (newQuery) => {
    selectedGenreSlug.value = newQuery.genre || '';
    if (newQuery.page)
        page.value = parseInt(newQuery.page, 10) || 1;
    if (selectedGenreSlug.value) {
        loadGenreContent();
    }
});
onMounted(async () => {
    await loadGenres();
    if (selectedGenreSlug.value) {
        loadGenreContent();
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-action']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-action']} */ ;
/** @type {__VLS_StyleScopedClasses['page-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "genres-page" },
});
if (__VLS_ctx.selectedGenreSlug) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "genre-detail-mode" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-header detail-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearGenreSelection) },
        ...{ class: "back-btn" },
    });
    const __VLS_0 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: (20),
    }));
    const __VLS_2 = __VLS_1({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "title-with-count" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "page-title" },
    });
    (__VLS_ctx.activeGenreName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "genre-count" },
    });
    (__VLS_ctx.total);
    if (__VLS_ctx.contentLoading) {
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
    else if (__VLS_ctx.contentError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "state-container error-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "state-icon text-red" },
        });
        const __VLS_4 = {}.AlertCircle;
        /** @type {[typeof __VLS_components.AlertCircle, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            size: (48),
            strokeWidth: "2",
        }));
        const __VLS_6 = __VLS_5({
            size: (48),
            strokeWidth: "2",
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.contentError);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.loadGenreContent) },
            ...{ class: "retry-btn" },
        });
    }
    else if (__VLS_ctx.genreItems.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "state-container empty-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "state-icon" },
        });
        const __VLS_8 = {}.SearchX;
        /** @type {[typeof __VLS_components.SearchX, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            size: (48),
            strokeWidth: "1.5",
        }));
        const __VLS_10 = __VLS_9({
            size: (48),
            strokeWidth: "1.5",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        (__VLS_ctx.activeGenreName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearGenreSelection) },
            ...{ class: "retry-btn" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "movie-grid" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.genreItems))) {
            /** @type {[typeof MovieCard, ]} */ ;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent(MovieCard, new MovieCard({
                ...{ 'onPlay': {} },
                key: (item.id),
                movie: (item),
            }));
            const __VLS_13 = __VLS_12({
                ...{ 'onPlay': {} },
                key: (item.id),
                movie: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            let __VLS_15;
            let __VLS_16;
            let __VLS_17;
            const __VLS_18 = {
                onPlay: (...[$event]) => {
                    if (!(__VLS_ctx.selectedGenreSlug))
                        return;
                    if (!!(__VLS_ctx.contentLoading))
                        return;
                    if (!!(__VLS_ctx.contentError))
                        return;
                    if (!!(__VLS_ctx.genreItems.length === 0))
                        return;
                    __VLS_ctx.showPlayNotice = true;
                }
            };
            var __VLS_14;
        }
    }
    if (!__VLS_ctx.contentLoading && !__VLS_ctx.contentError && __VLS_ctx.genreItems.length > 0 && __VLS_ctx.totalPages > 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "pagination" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedGenreSlug))
                        return;
                    if (!(!__VLS_ctx.contentLoading && !__VLS_ctx.contentError && __VLS_ctx.genreItems.length > 0 && __VLS_ctx.totalPages > 1))
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
                    if (!(__VLS_ctx.selectedGenreSlug))
                        return;
                    if (!(!__VLS_ctx.contentLoading && !__VLS_ctx.contentError && __VLS_ctx.genreItems.length > 0 && __VLS_ctx.totalPages > 1))
                        return;
                    __VLS_ctx.changePage(__VLS_ctx.page + 1);
                } },
            ...{ class: "page-btn" },
            disabled: (__VLS_ctx.page >= __VLS_ctx.totalPages),
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "genres-overview-mode" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "page-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "page-subtitle" },
    });
    if (__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "genres-loading" },
        });
        for (const [i] of __VLS_getVForSourceType((12))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ class: "genre-card-skeleton" },
            });
        }
    }
    else if (__VLS_ctx.error) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "genres-error" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.error);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.loadGenres) },
            ...{ class: "retry-btn" },
        });
    }
    else if (__VLS_ctx.genres.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "genres-grid" },
        });
        for (const [genre] of __VLS_getVForSourceType((__VLS_ctx.genres))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.selectedGenreSlug))
                            return;
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.genres.length > 0))
                            return;
                        __VLS_ctx.selectGenre(genre.slug);
                    } },
                ...{ onKeyup: (...[$event]) => {
                        if (!!(__VLS_ctx.selectedGenreSlug))
                            return;
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.genres.length > 0))
                            return;
                        __VLS_ctx.selectGenre(genre.slug);
                    } },
                key: (genre.id),
                ...{ class: "genre-card" },
                tabindex: "0",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onError: (__VLS_ctx.onImageError) },
                ...{ class: "genre-card-bg" },
                ...{ style: ({ backgroundImage: `url('/genres/${genre.slug}.jpg')` }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "genre-card-overlay" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "genre-card-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "genre-name" },
            });
            (genre.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "genre-action" },
            });
            const __VLS_19 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
                size: (16),
                strokeWidth: "2.5",
            }));
            const __VLS_21 = __VLS_20({
                size: (16),
                strokeWidth: "2.5",
            }, ...__VLS_functionalComponentArgsRest(__VLS_20));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "genres-empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
}
/** @type {[typeof PlayNoticeModal, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(PlayNoticeModal, new PlayNoticeModal({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}));
const __VLS_24 = __VLS_23({
    ...{ 'onClose': {} },
    show: (__VLS_ctx.showPlayNotice),
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
let __VLS_26;
let __VLS_27;
let __VLS_28;
const __VLS_29 = {
    onClose: (...[$event]) => {
        __VLS_ctx.showPlayNotice = false;
    }
};
var __VLS_25;
/** @type {__VLS_StyleScopedClasses['genres-page']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-detail-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-header']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['title-with-count']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-count']} */ ;
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
/** @type {__VLS_StyleScopedClasses['genres-overview-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['genres-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['genres-error']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['genres-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-content']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-name']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-action']} */ ;
/** @type {__VLS_StyleScopedClasses['genres-empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MovieCard: MovieCard,
            PlayNoticeModal: PlayNoticeModal,
            ArrowRight: ArrowRight,
            ArrowLeft: ArrowLeft,
            AlertCircle: AlertCircle,
            SearchX: SearchX,
            genres: genres,
            loading: loading,
            error: error,
            selectedGenreSlug: selectedGenreSlug,
            genreItems: genreItems,
            total: total,
            page: page,
            contentLoading: contentLoading,
            contentError: contentError,
            showPlayNotice: showPlayNotice,
            totalPages: totalPages,
            activeGenreName: activeGenreName,
            loadGenres: loadGenres,
            loadGenreContent: loadGenreContent,
            selectGenre: selectGenre,
            clearGenreSelection: clearGenreSelection,
            changePage: changePage,
            onImageError: onImageError,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
