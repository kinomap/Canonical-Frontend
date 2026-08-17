/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
const props = defineProps();
const emit = defineEmits(['close']);
const videoRef = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);
const isMuted = ref(false);
const isFullscreen = ref(false);
const buffered = ref(0);
const isBuffering = ref(true);
const isDragging = ref(false);
const dragPosition = ref(0); // 0 to 1
// Controls auto-hide logic
const isControlsVisible = ref(true);
let hideControlsTimeout = null;
function showControls() {
    isControlsVisible.value = true;
    if (hideControlsTimeout) {
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = null;
    }
    if (isPlaying.value) {
        hideControlsTimeout = setTimeout(() => {
            isControlsVisible.value = false;
        }, 2500);
    }
}
function handleMouseLeave() {
    if (isPlaying.value) {
        isControlsVisible.value = false;
    }
}
watch(isPlaying, (playing) => {
    if (!playing) {
        isControlsVisible.value = true;
        if (hideControlsTimeout)
            clearTimeout(hideControlsTimeout);
    }
    else {
        showControls();
    }
});
function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0)
        return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function togglePlay() {
    if (!videoRef.value)
        return;
    if (videoRef.value.paused) {
        videoRef.value.play().catch(() => { });
    }
    else {
        videoRef.value.pause();
    }
}
function skip(amount) {
    if (!videoRef.value)
        return;
    videoRef.value.currentTime = Math.max(0, Math.min(videoRef.value.duration || Infinity, videoRef.value.currentTime + amount));
    showControls();
}
function handleTimeUpdate() {
    if (!videoRef.value || isDragging.value)
        return;
    currentTime.value = videoRef.value.currentTime;
    if (videoRef.value.buffered.length > 0) {
        const bufferedEnd = videoRef.value.buffered.end(videoRef.value.buffered.length - 1);
        buffered.value = (bufferedEnd / (videoRef.value.duration || 1)) * 100;
    }
}
function handleLoadedMetadata() {
    if (!videoRef.value)
        return;
    duration.value = videoRef.value.duration;
}
function handleWaiting() {
    isBuffering.value = true;
}
function handlePlaying() {
    isBuffering.value = false;
    isPlaying.value = true;
}
function handleCanPlay() {
    isBuffering.value = false;
}
function handlePause() {
    isPlaying.value = false;
}
function handleEnded() {
    isPlaying.value = false;
}
// Scrubbing
function getFraction(e) {
    const wrap = document.querySelector('.progress-wrap');
    if (!wrap)
        return 0;
    const rect = wrap.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pos = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, pos));
}
function onProgressMouseDown(e) {
    if (!videoRef.value || !duration.value)
        return;
    isDragging.value = true;
    dragPosition.value = getFraction(e);
    currentTime.value = dragPosition.value * duration.value;
    showControls();
}
function onDocumentMouseMove(e) {
    if (!isDragging.value || !duration.value)
        return;
    dragPosition.value = getFraction(e);
    currentTime.value = dragPosition.value * duration.value;
    showControls();
}
function onDocumentMouseUp(e) {
    if (!isDragging.value || !videoRef.value || !duration.value)
        return;
    isDragging.value = false;
    const frac = getFraction(e);
    videoRef.value.currentTime = frac * duration.value;
    currentTime.value = frac * duration.value;
}
function toggleMute() {
    if (!videoRef.value)
        return;
    isMuted.value = !isMuted.value;
    videoRef.value.muted = isMuted.value;
}
function handleVolumeChange(event) {
    if (!videoRef.value)
        return;
    const val = parseFloat(event.target.value);
    volume.value = val;
    videoRef.value.volume = val;
    if (val > 0) {
        isMuted.value = false;
        videoRef.value.muted = false;
    }
}
function toggleFullscreen() {
    const container = document.querySelector('.video-player-container');
    if (!document.fullscreenElement) {
        container?.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    }
    else {
        document.exitFullscreen().catch(() => { });
    }
}
function handleKeydown(e) {
    if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName))
        return;
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        showControls();
    }
    else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skip(-10);
    }
    else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skip(10);
    }
    else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
    }
    else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
    }
}
onMounted(() => {
    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!document.fullscreenElement;
    });
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('touchmove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);
    document.addEventListener('touchend', onDocumentMouseUp);
    document.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('touchmove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    document.removeEventListener('touchend', onDocumentMouseUp);
    document.removeEventListener('keydown', handleKeydown);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['video-player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['video-player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['video-player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['buf-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['big']} */ ;
/** @type {__VLS_StyleScopedClasses['time-display']} */ ;
/** @type {__VLS_StyleScopedClasses['vol-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['vol-slider']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousemove: (__VLS_ctx.showControls) },
    ...{ onMouseleave: (__VLS_ctx.handleMouseLeave) },
    ...{ onClick: (__VLS_ctx.showControls) },
    ...{ class: "video-player-container" },
    ...{ class: ({ 'fullscreen': __VLS_ctx.isFullscreen, 'hide-cursor': !__VLS_ctx.isControlsVisible && __VLS_ctx.isPlaying }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "video-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.video, __VLS_intrinsicElements.video)({
    ...{ onTimeupdate: (__VLS_ctx.handleTimeUpdate) },
    ...{ onLoadedmetadata: (__VLS_ctx.handleLoadedMetadata) },
    ...{ onWaiting: (__VLS_ctx.handleWaiting) },
    ...{ onPlaying: (__VLS_ctx.handlePlaying) },
    ...{ onCanplay: (__VLS_ctx.handleCanPlay) },
    ...{ onPause: (__VLS_ctx.handlePause) },
    ...{ onEnded: (__VLS_ctx.handleEnded) },
    ...{ onClick: (__VLS_ctx.togglePlay) },
    ref: "videoRef",
    src: (__VLS_ctx.src),
    poster: (__VLS_ctx.poster),
    preload: "auto",
    playsinline: true,
    autoplay: true,
});
/** @type {typeof __VLS_ctx.videoRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "buf-overlay" },
    ...{ class: ({ show: __VLS_ctx.isBuffering }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "spinner" },
});
const __VLS_0 = {}.transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.transition, typeof __VLS_components.Transition, typeof __VLS_components.transition, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    name: "fade-slide-down",
    persisted: true,
}));
const __VLS_2 = __VLS_1({
    name: "fade-slide-down",
    persisted: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "top-controls-overlay" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isControlsVisible || !__VLS_ctx.isPlaying) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "now-playing-title" },
});
(__VLS_ctx.title);
var __VLS_3;
const __VLS_4 = {}.transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.transition, typeof __VLS_components.Transition, typeof __VLS_components.transition, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "fade-slide-up",
    persisted: true,
}));
const __VLS_6 = __VLS_5({
    name: "fade-slide-up",
    persisted: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bottom-controls-overlay" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isControlsVisible || !__VLS_ctx.isPlaying) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousedown: (__VLS_ctx.onProgressMouseDown) },
    ...{ onTouchstart: (__VLS_ctx.onProgressMouseDown) },
    ...{ class: "progress-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "progress-buf" },
    ...{ style: ({ width: `${__VLS_ctx.buffered}%` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "progress-fill" },
    ...{ style: ({ width: `${__VLS_ctx.duration ? ((__VLS_ctx.isDragging ? __VLS_ctx.dragPosition * __VLS_ctx.duration : __VLS_ctx.currentTime) / __VLS_ctx.duration) * 100 : 0}%` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "progress-thumb" },
    ...{ style: ({ left: `${__VLS_ctx.duration ? ((__VLS_ctx.isDragging ? __VLS_ctx.dragPosition * __VLS_ctx.duration : __VLS_ctx.currentTime) / __VLS_ctx.duration) * 100 : 0}%` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "btn-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.skip(-10);
        } },
    ...{ class: "ctrl-btn" },
    title: "−10 с",
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
    d: "M11 17l-5-5 5-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M18 17l-5-5 5-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.togglePlay) },
    ...{ class: "ctrl-btn big" },
    title: "Play / Pause",
});
if (!__VLS_ctx.isPlaying) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "currentColor",
        stroke: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
        points: "5 3 19 12 5 21 5 3",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "currentColor",
        stroke: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "6",
        y: "4",
        width: "4",
        height: "16",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "14",
        y: "4",
        width: "4",
        height: "16",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.skip(10);
        } },
    ...{ class: "ctrl-btn" },
    title: "+10 с",
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
    d: "M13 17l5-5-5-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M6 17l5-5-5-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "time-display" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.formatTime(__VLS_ctx.currentTime));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sep" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.formatTime(__VLS_ctx.duration));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vol-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ onClick: (__VLS_ctx.toggleMute) },
    ...{ class: "vol-icon" },
    title: "Mute",
});
if (__VLS_ctx.isMuted || __VLS_ctx.volume === 0) {
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
        points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "23",
        y1: "9",
        x2: "17",
        y2: "15",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "17",
        y1: "9",
        x2: "23",
        y2: "15",
    });
}
else {
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
        points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (__VLS_ctx.handleVolumeChange) },
    type: "range",
    ...{ class: "vol-slider" },
    min: "0",
    max: "1",
    step: "0.02",
    value: (__VLS_ctx.isMuted ? 0 : __VLS_ctx.volume),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleFullscreen) },
    ...{ class: "ctrl-btn fullscreen-btn" },
    title: "Во весь экран",
});
if (!__VLS_ctx.isFullscreen) {
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
        d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
    });
}
else {
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
        d: "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3",
    });
}
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['video-player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['fullscreen']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['video-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['buf-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['show']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['top-controls-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['now-playing-title']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-controls-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-buf']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['big']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['time-display']} */ ;
/** @type {__VLS_StyleScopedClasses['sep']} */ ;
/** @type {__VLS_StyleScopedClasses['vol-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['vol-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['vol-slider']} */ ;
/** @type {__VLS_StyleScopedClasses['ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['fullscreen-btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            videoRef: videoRef,
            isPlaying: isPlaying,
            currentTime: currentTime,
            duration: duration,
            volume: volume,
            isMuted: isMuted,
            isFullscreen: isFullscreen,
            buffered: buffered,
            isBuffering: isBuffering,
            isDragging: isDragging,
            dragPosition: dragPosition,
            isControlsVisible: isControlsVisible,
            showControls: showControls,
            handleMouseLeave: handleMouseLeave,
            formatTime: formatTime,
            togglePlay: togglePlay,
            skip: skip,
            handleTimeUpdate: handleTimeUpdate,
            handleLoadedMetadata: handleLoadedMetadata,
            handleWaiting: handleWaiting,
            handlePlaying: handlePlaying,
            handleCanPlay: handleCanPlay,
            handlePause: handlePause,
            handleEnded: handleEnded,
            onProgressMouseDown: onProgressMouseDown,
            toggleMute: toggleMute,
            handleVolumeChange: handleVolumeChange,
            toggleFullscreen: toggleFullscreen,
        };
    },
    emits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    emits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
