/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
function formatSampleRate(sr) {
    if (sr >= 1000) {
        return `${(sr / 1000).toFixed(1)} kHz`;
    }
    return `${sr} Hz`;
}
function formatChannels(ch) {
    if (ch === 1)
        return 'Mono (1.0)';
    if (ch === 2)
        return 'Stereo (2.0)';
    if (ch === 6)
        return '5.1 Surround';
    if (ch === 8)
        return '7.1 Surround';
    return `${ch} channels`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['track-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "audio-tracks-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "section-title" },
});
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 6v12",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M6 10v4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M18 10v4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 12h.01",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M21 12h.01",
});
if (!__VLS_ctx.tracks || __VLS_ctx.tracks.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "audio-empty" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "audio-tracks-grid" },
    });
    for (const [track] of __VLS_getVForSourceType((__VLS_ctx.tracks))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (track.id),
            ...{ class: "track-card" },
            ...{ class: ({ default: track.is_default }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "track-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "track-index" },
        });
        (track.track_index + 1);
        if (track.is_default) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "default-badge" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "track-details" },
        });
        if (track.title) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "track-title-text" },
            });
            (track.title);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "track-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-tag lang-tag" },
        });
        (track.language || 'und');
        if (track.codec) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-tag" },
            });
            (track.codec.toUpperCase());
        }
        if (track.channels) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-tag" },
            });
            (__VLS_ctx.formatChannels(track.channels));
        }
        if (track.sample_rate) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-tag" },
            });
            (__VLS_ctx.formatSampleRate(track.sample_rate));
        }
    }
}
/** @type {__VLS_StyleScopedClasses['audio-tracks-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-tracks-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['track-card']} */ ;
/** @type {__VLS_StyleScopedClasses['default']} */ ;
/** @type {__VLS_StyleScopedClasses['track-header']} */ ;
/** @type {__VLS_StyleScopedClasses['track-index']} */ ;
/** @type {__VLS_StyleScopedClasses['default-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['track-details']} */ ;
/** @type {__VLS_StyleScopedClasses['track-title-text']} */ ;
/** @type {__VLS_StyleScopedClasses['track-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['lang-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatSampleRate: formatSampleRate,
            formatChannels: formatChannels,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
