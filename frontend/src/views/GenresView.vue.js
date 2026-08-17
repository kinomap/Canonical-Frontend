/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { apiClient } from '@/api/client';
import { ArrowRight } from 'lucide-vue-next';
const genres = ref([]);
const loading = ref(false);
const error = ref(null);
async function loadGenres() {
    error.value = null;
    const timer = setTimeout(() => {
        if (!genres.value.length)
            loading.value = true;
    }, 100);
    try {
        genres.value = await apiClient.listGenres();
    }
    catch (err) {
        error.value = err?.message || 'Failed to load genres';
    }
    finally {
        clearTimeout(timer);
        loading.value = false;
    }
}
// Fallback to a default background if image fails to load
function onImageError(e) {
    const target = e.target;
    target.style.backgroundImage = 'linear-gradient(135deg, #1f2028 0%, #26293a 100%)';
}
onMounted(() => {
    loadGenres();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-content']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card-content']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-action']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-card']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-action']} */ ;
/** @type {__VLS_StyleScopedClasses['retry-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "genres-page" },
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
        const __VLS_0 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            key: (genre.id),
            to: (`/movies?genre=${genre.slug}`),
            ...{ class: "genre-card" },
            tabindex: "0",
        }));
        const __VLS_2 = __VLS_1({
            key: (genre.id),
            to: (`/movies?genre=${genre.slug}`),
            ...{ class: "genre-card" },
            tabindex: "0",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
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
        const __VLS_4 = {}.ArrowRight;
        /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            size: (16),
            strokeWidth: "2.5",
        }));
        const __VLS_6 = __VLS_5({
            size: (16),
            strokeWidth: "2.5",
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        var __VLS_3;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "genres-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['genres-page']} */ ;
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
            ArrowRight: ArrowRight,
            genres: genres,
            loading: loading,
            error: error,
            loadGenres: loadGenres,
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
