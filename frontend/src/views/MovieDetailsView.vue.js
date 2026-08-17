/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import AudioTracksList from '@/components/AudioTracksList.vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import { Trash2, Play, Edit2, Check, X } from 'lucide-vue-next';
const route = useRoute();
const router = useRouter();
const { user: currentUser, isAuthenticated, token, fetchCurrentUser } = useAuthStore();
const movieId = computed(() => route.params.id);
const movie = ref(null);
const audioTracks = ref(null);
const comments = ref([]);
const reactions = ref([]);
const newComment = ref('');
const editingCommentId = ref(null);
const editCommentText = ref('');
const streamUrl = ref(null);
const shouldPlay = ref(false);
const loading = ref(true);
const error = ref(null);
const isNotFound = ref(false);
const descriptionExpanded = ref(false);
const formattedFileSize = computed(() => {
    if (!movie.value?.file_size)
        return null;
    const bytes = movie.value.file_size;
    if (bytes >= 1073741824) {
        return `${(bytes / 1073741824).toFixed(2)} GB`;
    }
    if (bytes >= 1048576) {
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
});
const formattedRuntime = computed(() => {
    if (!movie.value?.runtime)
        return null;
    const hrs = Math.floor(movie.value.runtime / 60);
    const mins = movie.value.runtime % 60;
    if (hrs > 0) {
        return `${hrs}h ${mins}m`;
    }
    return `${mins} min`;
});
async function fetchData() {
    loading.value = true;
    error.value = null;
    isNotFound.value = false;
    try {
        const movieData = await apiClient.getMovie(movieId.value);
        movie.value = movieData;
        // Fetch parallel data
        const [audioData, commentsData, reactionsData] = await Promise.allSettled([
            apiClient.getAudioTracks(movieId.value),
            apiClient.getComments(movieId.value),
            apiClient.getReactions(movieId.value)
        ]);
        audioTracks.value = audioData.status === 'fulfilled' ? (audioData.value || []) : [];
        comments.value = commentsData.status === 'fulfilled' ? (commentsData.value || []) : [];
        // Sort reactions nicely
        const defaultOrder = ["🔥", "👍", "💩", "❤️", "😂"];
        let rData = reactionsData.status === 'fulfilled' ? reactionsData.value : [];
        if (!rData)
            rData = [];
        rData.sort((a, b) => defaultOrder.indexOf(a.reaction_type) - defaultOrder.indexOf(b.reaction_type));
        reactions.value = rData;
        // Pre-fetch playback token in the background so it's ready instantly when user clicks Play
        if (isAuthenticated.value) {
            apiClient.startPlayback(movieId.value).then(res => {
                streamUrl.value = `http://localhost:8000/api/v1/playback/stream/${movieId.value}?token=${res.playback_token}`;
            }).catch(err => console.error("Prefetch playback failed", err));
        }
    }
    catch (err) {
        if (err instanceof ApiError && err.status === 404) {
            isNotFound.value = true;
        }
        else {
            error.value = err?.message || 'Failed to load movie details';
        }
    }
    finally {
        loading.value = false;
    }
}
async function handlePlay() {
    if (!isAuthenticated.value) {
        router.push('/login');
        return;
    }
    shouldPlay.value = true;
    if (!streamUrl.value) {
        try {
            const res = await apiClient.startPlayback(movieId.value);
            streamUrl.value = `http://localhost:8000/api/v1/playback/stream/${movieId.value}?token=${res.playback_token}`;
        }
        catch (err) {
            alert(err.message || 'Failed to start playback');
            shouldPlay.value = false;
        }
    }
}
async function postComment() {
    if (!newComment.value.trim())
        return;
    try {
        const comment = await apiClient.postComment(movieId.value, newComment.value);
        comments.value.unshift(comment);
        newComment.value = '';
    }
    catch (err) {
        alert(err.message || 'Failed to post comment');
    }
}
async function deleteComment(id) {
    if (!confirm('Are you sure you want to delete this comment?'))
        return;
    try {
        await apiClient.deleteComment(id);
        comments.value = comments.value.filter(c => c.id !== id);
    }
    catch (err) {
        alert(err.message || 'Failed to delete comment');
    }
}
function startEditComment(comment) {
    editingCommentId.value = comment.id;
    editCommentText.value = comment.text;
}
function cancelEditComment() {
    editingCommentId.value = null;
    editCommentText.value = '';
}
async function saveEditComment(id) {
    if (!editCommentText.value.trim())
        return;
    try {
        const updated = await apiClient.updateComment(id, editCommentText.value);
        const idx = comments.value.findIndex(c => c.id === id);
        if (idx !== -1) {
            comments.value[idx] = updated;
        }
        editingCommentId.value = null;
    }
    catch (err) {
        alert(err.message || 'Failed to update comment');
    }
}
async function toggleReaction(reaction_type) {
    if (!isAuthenticated.value) {
        router.push('/login');
        return;
    }
    try {
        const res = await apiClient.toggleReaction(movieId.value, reaction_type);
        const r = reactions.value.find(x => x.reaction_type === reaction_type);
        if (r) {
            if (res.action === 'added') {
                r.count++;
                r.user_reacted = true;
            }
            else {
                r.count--;
                r.user_reacted = false;
            }
        }
    }
    catch (err) {
        console.error('Failed to toggle reaction', err);
    }
}
onMounted(() => {
    if (!currentUser.value && token.value) {
        fetchCurrentUser();
    }
    fetchData();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['player-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['player-splash']} */ ;
/** @type {__VLS_StyleScopedClasses['player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['play-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['reaction-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['reaction-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['description-box']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-text']} */ ;
/** @type {__VLS_StyleScopedClasses['description-box']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-text']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-input']} */ ;
/** @type {__VLS_StyleScopedClasses['post-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-admin']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-cancel-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-cancel-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "movie-details-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "details-nav" },
});
const __VLS_0 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "/",
    ...{ class: "back-link" },
}));
const __VLS_2 = __VLS_1({
    to: "/",
    ...{ class: "back-link" },
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m15 18-6-6 6-6",
});
var __VLS_3;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "yt-layout skeleton-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "player-container player-skeleton" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "main-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "title-skeleton" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reactions-skeleton" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "desc-skeleton" },
    });
}
else if (__VLS_ctx.isNotFound) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "details-state not-found-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon text-amber" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m15 9-6 6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m9 9 6 6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    const __VLS_4 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        to: "/",
        ...{ class: "nav-btn" },
    }));
    const __VLS_6 = __VLS_5({
        to: "/",
        ...{ class: "nav-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    var __VLS_7;
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "details-state error-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-icon text-red" },
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
    (__VLS_ctx.error);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.fetchData) },
        ...{ class: "nav-btn" },
    });
}
else if (__VLS_ctx.movie) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "yt-layout" },
    });
    if (!__VLS_ctx.shouldPlay) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (__VLS_ctx.handlePlay) },
            ...{ class: "player-container" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "player-splash" },
            ...{ style: ({ backgroundImage: `url(${__VLS_ctx.movie.backdrop || __VLS_ctx.movie.poster})` }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "player-overlay" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "play-circle" },
        });
        const __VLS_8 = {}.Play;
        /** @type {[typeof __VLS_components.Play, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            size: (48),
            fill: "currentColor",
            ...{ class: "play-icon" },
        }));
        const __VLS_10 = __VLS_9({
            size: (48),
            fill: "currentColor",
            ...{ class: "play-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
    else if (__VLS_ctx.streamUrl) {
        /** @type {[typeof VideoPlayer, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(VideoPlayer, new VideoPlayer({
            src: (__VLS_ctx.streamUrl),
            poster: (__VLS_ctx.movie.backdrop || __VLS_ctx.movie.poster || undefined),
            title: (__VLS_ctx.movie.title),
        }));
        const __VLS_13 = __VLS_12({
            src: (__VLS_ctx.streamUrl),
            poster: (__VLS_ctx.movie.backdrop || __VLS_ctx.movie.poster || undefined),
            title: (__VLS_ctx.movie.title),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "main-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "movie-title" },
    });
    (__VLS_ctx.movie.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "actions-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reactions-bar" },
    });
    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.reactions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.isNotFound))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!(__VLS_ctx.movie))
                        return;
                    __VLS_ctx.toggleReaction(r.reaction_type);
                } },
            key: (r.reaction_type),
            ...{ class: "reaction-btn" },
            ...{ class: ({ active: r.user_reacted }) },
            title: (!__VLS_ctx.isAuthenticated ? 'Log in to react' : ''),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "reaction-emoji" },
        });
        (r.reaction_type);
        if (r.count > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "reaction-count" },
            });
            (r.count);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.isNotFound))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!(__VLS_ctx.movie))
                    return;
                __VLS_ctx.descriptionExpanded = !__VLS_ctx.descriptionExpanded;
            } },
        ...{ class: "description-box" },
        ...{ class: ({ expanded: __VLS_ctx.descriptionExpanded }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "desc-stats" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-badge" },
    });
    (__VLS_ctx.movie.rating?.toFixed(1) || 'N/A');
    if (__VLS_ctx.movie.year) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-text" },
        });
        (__VLS_ctx.movie.year);
    }
    if (__VLS_ctx.formattedRuntime) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-text" },
        });
        (__VLS_ctx.formattedRuntime);
    }
    if (__VLS_ctx.formattedFileSize) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-text" },
        });
        (__VLS_ctx.formattedFileSize);
    }
    if (__VLS_ctx.movie.quality) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-text quality" },
        });
        (__VLS_ctx.movie.quality);
    }
    if (__VLS_ctx.movie.genres?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "desc-genres" },
        });
        for (const [g] of __VLS_getVForSourceType((__VLS_ctx.movie.genres))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (g.id),
                ...{ class: "desc-genre" },
            });
            (g.slug);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "desc-text" },
    });
    (__VLS_ctx.movie.overview || 'No description provided.');
    if (__VLS_ctx.descriptionExpanded && __VLS_ctx.audioTracks?.length) {
        /** @type {[typeof AudioTracksList, ]} */ ;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent(AudioTracksList, new AudioTracksList({
            tracks: (__VLS_ctx.audioTracks),
            ...{ class: "audio-tracks-mt" },
        }));
        const __VLS_16 = __VLS_15({
            tracks: (__VLS_ctx.audioTracks),
            ...{ class: "audio-tracks-mt" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.isNotFound))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!(__VLS_ctx.movie))
                    return;
                __VLS_ctx.descriptionExpanded = !__VLS_ctx.descriptionExpanded;
            } },
        ...{ class: "expand-btn" },
    });
    (__VLS_ctx.descriptionExpanded ? 'Show less' : 'Show more');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "comments-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "comments-title" },
    });
    (__VLS_ctx.comments?.length || 0);
    if (__VLS_ctx.isAuthenticated) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-input-area" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-avatar me" },
        });
        (__VLS_ctx.currentUser?.username[0].toUpperCase());
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onKeyup: (__VLS_ctx.postComment) },
            type: "text",
            value: (__VLS_ctx.newComment),
            placeholder: "Add a comment... (emojis supported 😊)",
            ...{ class: "comment-input" },
        });
        if (__VLS_ctx.newComment.trim()) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.postComment) },
                ...{ class: "post-btn" },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "login-prompt" },
        });
        const __VLS_18 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
            to: "/login",
            ...{ class: "login-link" },
        }));
        const __VLS_20 = __VLS_19({
            to: "/login",
            ...{ class: "login-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        __VLS_21.slots.default;
        var __VLS_21;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "comments-list" },
    });
    for (const [comment] of __VLS_getVForSourceType((__VLS_ctx.comments))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (comment.id),
            ...{ class: "comment-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-avatar" },
        });
        (comment.user.username[0].toUpperCase());
        if (__VLS_ctx.editingCommentId !== comment.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "comment-author" },
            });
            (comment.user.username);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "comment-date" },
            });
            (new Date(comment.created_at).toLocaleDateString());
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-text" },
            });
            (comment.text);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-body edit-mode" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.isNotFound))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.movie))
                            return;
                        if (!!(__VLS_ctx.editingCommentId !== comment.id))
                            return;
                        __VLS_ctx.saveEditComment(comment.id);
                    } },
                type: "text",
                value: (__VLS_ctx.editCommentText),
                ...{ class: "comment-input edit-input" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "edit-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.isNotFound))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.movie))
                            return;
                        if (!!(__VLS_ctx.editingCommentId !== comment.id))
                            return;
                        __VLS_ctx.saveEditComment(comment.id);
                    } },
                ...{ class: "edit-save-btn" },
            });
            const __VLS_22 = {}.Check;
            /** @type {[typeof __VLS_components.Check, ]} */ ;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
                size: (14),
            }));
            const __VLS_24 = __VLS_23({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.cancelEditComment) },
                ...{ class: "edit-cancel-btn" },
            });
            const __VLS_26 = {}.X;
            /** @type {[typeof __VLS_components.X, ]} */ ;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
                size: (14),
            }));
            const __VLS_28 = __VLS_27({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        }
        if (__VLS_ctx.currentUser?.role === 'admin' || __VLS_ctx.currentUser?.id === comment.user.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-admin" },
            });
            if (__VLS_ctx.editingCommentId !== comment.id) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.isNotFound))
                                return;
                            if (!!(__VLS_ctx.error))
                                return;
                            if (!(__VLS_ctx.movie))
                                return;
                            if (!(__VLS_ctx.currentUser?.role === 'admin' || __VLS_ctx.currentUser?.id === comment.user.id))
                                return;
                            if (!(__VLS_ctx.editingCommentId !== comment.id))
                                return;
                            __VLS_ctx.startEditComment(comment);
                        } },
                    ...{ class: "edit-btn" },
                    title: "Edit comment",
                });
                const __VLS_30 = {}.Edit2;
                /** @type {[typeof __VLS_components.Edit2, ]} */ ;
                // @ts-ignore
                const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
                    size: (16),
                }));
                const __VLS_32 = __VLS_31({
                    size: (16),
                }, ...__VLS_functionalComponentArgsRest(__VLS_31));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.isNotFound))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.movie))
                            return;
                        if (!(__VLS_ctx.currentUser?.role === 'admin' || __VLS_ctx.currentUser?.id === comment.user.id))
                            return;
                        __VLS_ctx.deleteComment(comment.id);
                    } },
                ...{ class: "delete-btn" },
                title: "Delete comment",
            });
            const __VLS_34 = {}.Trash2;
            /** @type {[typeof __VLS_components.Trash2, ]} */ ;
            // @ts-ignore
            const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
                size: (16),
            }));
            const __VLS_36 = __VLS_35({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_35));
        }
    }
    if (!__VLS_ctx.comments?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "no-comments" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['movie-details-page']} */ ;
/** @type {__VLS_StyleScopedClasses['details-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['yt-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['player-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
/** @type {__VLS_StyleScopedClasses['title-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['reactions-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['details-state']} */ ;
/** @type {__VLS_StyleScopedClasses['not-found-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['details-state']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['text-red']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['yt-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['player-container']} */ ;
/** @type {__VLS_StyleScopedClasses['player-splash']} */ ;
/** @type {__VLS_StyleScopedClasses['player-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['play-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['play-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
/** @type {__VLS_StyleScopedClasses['movie-title']} */ ;
/** @type {__VLS_StyleScopedClasses['actions-row']} */ ;
/** @type {__VLS_StyleScopedClasses['reactions-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['reaction-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['reaction-emoji']} */ ;
/** @type {__VLS_StyleScopedClasses['reaction-count']} */ ;
/** @type {__VLS_StyleScopedClasses['description-box']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-text']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-text']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-text']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-text']} */ ;
/** @type {__VLS_StyleScopedClasses['quality']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-genres']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-genre']} */ ;
/** @type {__VLS_StyleScopedClasses['desc-text']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-tracks-mt']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['comments-section']} */ ;
/** @type {__VLS_StyleScopedClasses['comments-title']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-input-area']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['me']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-form']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-input']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['post-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['login-prompt']} */ ;
/** @type {__VLS_StyleScopedClasses['login-link']} */ ;
/** @type {__VLS_StyleScopedClasses['comments-list']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-body']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-header']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-author']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-date']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-text']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-body']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-input']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-input']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-cancel-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-admin']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['no-comments']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AudioTracksList: AudioTracksList,
            VideoPlayer: VideoPlayer,
            Trash2: Trash2,
            Play: Play,
            Edit2: Edit2,
            Check: Check,
            X: X,
            currentUser: currentUser,
            isAuthenticated: isAuthenticated,
            movie: movie,
            audioTracks: audioTracks,
            comments: comments,
            reactions: reactions,
            newComment: newComment,
            editingCommentId: editingCommentId,
            editCommentText: editCommentText,
            streamUrl: streamUrl,
            shouldPlay: shouldPlay,
            loading: loading,
            error: error,
            isNotFound: isNotFound,
            descriptionExpanded: descriptionExpanded,
            formattedFileSize: formattedFileSize,
            formattedRuntime: formattedRuntime,
            fetchData: fetchData,
            handlePlay: handlePlay,
            postComment: postComment,
            deleteComment: deleteComment,
            startEditComment: startEditComment,
            cancelEditComment: cancelEditComment,
            saveEditComment: saveEditComment,
            toggleReaction: toggleReaction,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
