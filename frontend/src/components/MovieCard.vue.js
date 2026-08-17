/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = withDefaults(defineProps(), {
    eager: false
});
// Clean display title — strip emoji prefixes and MSX/technical storage suffixes
const displayTitle = computed(() => {
    let t = props.movie.title;
    // Remove leading emoji clusters (U+1F000–U+1FFFF and U+2600–U+27FF)
    t = t.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+\s*/gu, '');
    // Remove " / YEAR / MSX storage" or " / MSX storage" suffix
    t = t.replace(/\s*\/\s*\d{4}\s*\/.*$/u, '');
    t = t.replace(/\s*\/\s*MSX\s+\w+.*/iu, '');
    return t.trim() || props.movie.title;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    eager: false
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['movie-card']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-card']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-card']} */ ;
/** @type {__VLS_StyleScopedClasses['poster-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-card']} */ ;
/** @type {__VLS_StyleScopedClasses['poster-img']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: (`/movies/${__VLS_ctx.movie.id}`),
    ...{ class: "movie-card" },
    dataId: (__VLS_ctx.movie.id),
    tabindex: "0",
}));
const __VLS_2 = __VLS_1({
    to: (`/movies/${__VLS_ctx.movie.id}`),
    ...{ class: "movie-card" },
    dataId: (__VLS_ctx.movie.id),
    tabindex: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "poster-wrapper" },
});
if (__VLS_ctx.movie.poster) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: (__VLS_ctx.movie.poster),
        alt: (__VLS_ctx.movie.title),
        ...{ class: "poster-img" },
        loading: (__VLS_ctx.eager ? 'eager' : 'lazy'),
        fetchpriority: (__VLS_ctx.eager ? 'high' : 'auto'),
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "poster-fallback" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "48",
        height: "48",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        width: "18",
        height: "18",
        x: "3",
        y: "3",
        rx: "2",
        ry: "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: "11 3 11 11 14 8 17 11 17 3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "8.5",
        cy: "8.5",
        r: "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M20.4 14.5 16 10 4 20",
    });
}
if (__VLS_ctx.movie.rating) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "badges-overlay" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge rating-badge" },
    });
    (__VLS_ctx.movie.rating.toFixed(1));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "movie-title" },
    title: (__VLS_ctx.displayTitle),
});
(__VLS_ctx.displayTitle);
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['movie-card']} */ ;
/** @type {__VLS_StyleScopedClasses['poster-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['poster-img']} */ ;
/** @type {__VLS_StyleScopedClasses['poster-fallback']} */ ;
/** @type {__VLS_StyleScopedClasses['badges-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['card-content']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            displayTitle: displayTitle,
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
