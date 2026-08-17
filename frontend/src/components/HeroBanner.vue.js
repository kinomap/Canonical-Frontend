import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const formattedRuntime = computed(() => {
    if (!props.movie.runtime)
        return null;
    const hrs = Math.floor(props.movie.runtime / 60);
    const mins = props.movie.runtime % 60;
    if (hrs > 0)
        return `${hrs}h ${mins}m`;
    return `${mins}m`;
});
function onPlay() {
    emit('play', props.movie);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-play-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-play-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-details-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-details-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-banner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "backdrop-wrapper" },
});
if (__VLS_ctx.movie.poster) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: (__VLS_ctx.movie.poster),
        alt: (__VLS_ctx.movie.title),
        ...{ class: "backdrop-image" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "backdrop-overlay" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-badges" },
});
if (__VLS_ctx.movie.quality) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hero-badge quality" },
    });
    (__VLS_ctx.movie.quality);
}
if (__VLS_ctx.movie.rating) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hero-badge rating" },
    });
    (__VLS_ctx.movie.rating.toFixed(1));
}
if (__VLS_ctx.movie.year) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hero-badge" },
    });
    (__VLS_ctx.movie.year);
}
if (__VLS_ctx.formattedRuntime) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hero-badge" },
    });
    (__VLS_ctx.formattedRuntime);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "hero-title" },
});
(__VLS_ctx.movie.title);
if (__VLS_ctx.movie.genres && __VLS_ctx.movie.genres.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-genres" },
    });
    for (const [g] of __VLS_getVForSourceType((__VLS_ctx.movie.genres))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (g.id),
            ...{ class: "hero-genre-tag" },
        });
        (g.name);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.onPlay) },
    ...{ class: "hero-play-btn" },
    tabindex: "0",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
    points: "5 3 19 12 5 21 5 3",
});
const __VLS_0 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: (`/movies/${__VLS_ctx.movie.id}`),
    ...{ class: "hero-details-btn" },
    tabindex: "0",
}));
const __VLS_2 = __VLS_1({
    to: (`/movies/${__VLS_ctx.movie.id}`),
    ...{ class: "hero-details-btn" },
    tabindex: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    width: "20",
    height: "20",
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 16v-4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 8h.01",
});
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['hero-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-image']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-content']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badges']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['quality']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['rating']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-genres']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-genre-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-play-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-details-btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formattedRuntime: formattedRuntime,
            onPlay: onPlay,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
