/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import MovieCard from '@/components/MovieCard.vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
const props = withDefaults(defineProps(), {
    eager: false
});
const railContainer = ref(null);
function scrollLeft() {
    if (railContainer.value) {
        railContainer.value.scrollBy({ left: -400, behavior: 'smooth' });
    }
}
function scrollRight() {
    if (railContainer.value) {
        railContainer.value.scrollBy({ left: 400, behavior: 'smooth' });
    }
}
function handleWheel(event) {
    // Let native horizontal scroll work (e.g. trackpads)
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
    if (railContainer.value) {
        const track = railContainer.value;
        // Check if we are at the edges to allow page scroll when slider is at the end
        const atLeft = track.scrollLeft <= 0 && event.deltaY < 0;
        const atRight = track.scrollWidth - track.clientWidth - track.scrollLeft <= 1 && event.deltaY > 0;
        if (!atLeft && !atRight) {
            event.preventDefault();
            // Use auto behavior for mouse wheel to prevent jank
            track.scrollBy({ left: event.deltaY, behavior: 'auto' });
        }
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    eager: false
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['scroll-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-track']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.movies && __VLS_ctx.movies.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "movie-rail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rail-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "rail-title" },
    });
    (__VLS_ctx.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rail-header-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scroll-buttons" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.scrollLeft) },
        ...{ class: "scroll-btn" },
        title: "Scroll Left",
    });
    const __VLS_0 = {}.ChevronLeft;
    /** @type {[typeof __VLS_components.ChevronLeft, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: (20),
    }));
    const __VLS_2 = __VLS_1({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.scrollRight) },
        ...{ class: "scroll-btn" },
        title: "Scroll Right",
    });
    const __VLS_4 = {}.ChevronRight;
    /** @type {[typeof __VLS_components.ChevronRight, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        size: (20),
    }));
    const __VLS_6 = __VLS_5({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onWheel: (__VLS_ctx.handleWheel) },
        ref: "railContainer",
        ...{ class: "rail-track" },
    });
    /** @type {typeof __VLS_ctx.railContainer} */ ;
    for (const [movie, index] of __VLS_getVForSourceType((__VLS_ctx.movies))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (movie.id),
            ...{ class: "rail-item" },
        });
        /** @type {[typeof MovieCard, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(MovieCard, new MovieCard({
            movie: (movie),
            eager: (__VLS_ctx.eager && index < 5),
        }));
        const __VLS_9 = __VLS_8({
            movie: (movie),
            eager: (__VLS_ctx.eager && index < 5),
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    }
}
/** @type {__VLS_StyleScopedClasses['movie-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-header']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-title']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['scroll-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['scroll-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['scroll-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-track']} */ ;
/** @type {__VLS_StyleScopedClasses['rail-item']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MovieCard: MovieCard,
            ChevronLeft: ChevronLeft,
            ChevronRight: ChevronRight,
            railContainer: railContainer,
            scrollLeft: scrollLeft,
            scrollRight: scrollRight,
            handleWheel: handleWheel,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
