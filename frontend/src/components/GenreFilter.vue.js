/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
const emit = defineEmits();
function select(slug) {
    emit('select', slug);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['genre-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-chip']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "genre-filter" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.select(null);
        } },
    ...{ class: "genre-chip" },
    ...{ class: ({ active: __VLS_ctx.selectedGenre === null || __VLS_ctx.selectedGenre === '' }) },
});
for (const [genre] of __VLS_getVForSourceType((__VLS_ctx.genres))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.select(genre.slug);
            } },
        key: (genre.id),
        ...{ class: "genre-chip" },
        ...{ class: ({ active: __VLS_ctx.selectedGenre === genre.slug }) },
    });
    (genre.name);
}
/** @type {__VLS_StyleScopedClasses['genre-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['genre-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            select: select,
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
