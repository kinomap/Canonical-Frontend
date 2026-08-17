/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch, onUnmounted, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, X, Loader2 } from 'lucide-vue-next';
import { apiClient } from '@/api/client';
const props = defineProps();
const emit = defineEmits();
const router = useRouter();
const query = ref(props.modelValue || '');
const suggestions = ref([]);
const loading = ref(false);
const showDropdown = ref(false);
const searchBarRef = ref(null);
let timer = null;
// Watch external value updates
watch(() => props.modelValue, (newVal) => {
    if (newVal !== undefined && newVal !== query.value) {
        query.value = newVal;
    }
});
async function fetchSuggestions(q) {
    if (!q.trim() || q.trim().length < 2) {
        suggestions.value = [];
        showDropdown.value = false;
        return;
    }
    loading.value = true;
    showDropdown.value = true;
    try {
        const res = await apiClient.searchMoviesQuick(q.trim(), 5);
        suggestions.value = res.items;
    }
    catch (err) {
        console.error('Failed to fetch suggestions:', err);
    }
    finally {
        loading.value = false;
    }
}
function onInput() {
    emit('update:modelValue', query.value);
    if (timer)
        clearTimeout(timer);
    timer = setTimeout(() => {
        fetchSuggestions(query.value);
    }, props.debounceMs ?? 300);
}
function clear() {
    query.value = '';
    emit('update:modelValue', '');
    suggestions.value = [];
    showDropdown.value = false;
    if (timer)
        clearTimeout(timer);
    emit('search', '');
}
function onEnter() {
    if (timer)
        clearTimeout(timer);
    showDropdown.value = false;
    emit('search', query.value);
}
function selectSuggestion(movie) {
    showDropdown.value = false;
    query.value = movie.title;
    emit('update:modelValue', movie.title);
    router.push(`/movies/${movie.id}`);
}
// Handle click outside to close dropdown
function handleClickOutside(event) {
    if (searchBarRef.value && !searchBarRef.value.contains(event.target)) {
        showDropdown.value = false;
    }
}
onMounted(() => {
    document.addEventListener('mousedown', handleClickOutside);
});
onUnmounted(() => {
    if (timer)
        clearTimeout(timer);
    document.removeEventListener('mousedown', handleClickOutside);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['clear-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dropdown-footer']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "search-bar" },
    ref: "searchBarRef",
});
/** @type {typeof __VLS_ctx.searchBarRef} */ ;
const __VLS_0 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "search-icon" },
    size: (18),
    strokeWidth: "2",
}));
const __VLS_2 = __VLS_1({
    ...{ class: "search-icon" },
    size: (18),
    strokeWidth: "2",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (__VLS_ctx.onInput) },
    ...{ onKeydown: (__VLS_ctx.onEnter) },
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.query.trim().length >= 2 && (__VLS_ctx.showDropdown = true);
        } },
    value: (__VLS_ctx.query),
    type: "text",
    placeholder: (__VLS_ctx.placeholder || 'Search movies...'),
    ...{ class: "search-input" },
});
if (__VLS_ctx.query) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clear) },
        ...{ class: "clear-btn" },
        title: "Clear search",
    });
    const __VLS_4 = {}.X;
    /** @type {[typeof __VLS_components.X, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        size: (16),
        strokeWidth: "2",
    }));
    const __VLS_6 = __VLS_5({
        size: (16),
        strokeWidth: "2",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
if (__VLS_ctx.showDropdown && (__VLS_ctx.loading || __VLS_ctx.suggestions.length > 0 || __VLS_ctx.query.trim().length >= 2)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-dropdown" },
    });
    if (__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dropdown-state" },
        });
        const __VLS_8 = {}.Loader2;
        /** @type {[typeof __VLS_components.Loader2, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            ...{ class: "spinner" },
            size: (20),
            strokeWidth: "2",
        }));
        const __VLS_10 = __VLS_9({
            ...{ class: "spinner" },
            size: (20),
            strokeWidth: "2",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else if (__VLS_ctx.suggestions.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dropdown-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ class: "suggestions-list" },
        });
        for (const [movie] of __VLS_getVForSourceType((__VLS_ctx.suggestions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.showDropdown && (__VLS_ctx.loading || __VLS_ctx.suggestions.length > 0 || __VLS_ctx.query.trim().length >= 2)))
                            return;
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.suggestions.length === 0))
                            return;
                        __VLS_ctx.selectSuggestion(movie);
                    } },
                key: (movie.id),
                ...{ class: "suggestion-item" },
            });
            if (movie.poster) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                    src: (movie.poster),
                    alt: "",
                    ...{ class: "suggestion-poster" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "suggestion-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "suggestion-title" },
            });
            (movie.title);
            if (movie.year) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "suggestion-meta" },
                });
                (movie.year);
                if (movie.rating) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (movie.rating.toFixed(1));
                }
            }
        }
    }
    if (!__VLS_ctx.loading && __VLS_ctx.suggestions.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (__VLS_ctx.onEnter) },
            ...{ class: "dropdown-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.query);
    }
}
/** @type {__VLS_StyleScopedClasses['search-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['clear-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['search-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['dropdown-state']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['dropdown-state']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestions-list']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-item']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-poster']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-info']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-title']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestion-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['dropdown-footer']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            X: X,
            Loader2: Loader2,
            query: query,
            suggestions: suggestions,
            loading: loading,
            showDropdown: showDropdown,
            searchBarRef: searchBarRef,
            onInput: onInput,
            clear: clear,
            onEnter: onEnter,
            selectSuggestion: selectSuggestion,
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
