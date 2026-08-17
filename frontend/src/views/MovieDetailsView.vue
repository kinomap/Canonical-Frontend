<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient, ApiError } from '@/api/client'
import type { AudioTrack, MovieDetail } from '@/types/movie'
import type { Comment, MovieReaction } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import AudioTracksList from '@/components/AudioTracksList.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import { Trash2, Play, Edit2, Check, X } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { user: currentUser, isAuthenticated, token, fetchCurrentUser } = useAuthStore()

const movieId = computed(() => route.params.id as string)

const movie = ref<MovieDetail | null>(null)
const audioTracks = ref<AudioTrack[] | null>(null)
const comments = ref<Comment[]>([])
const reactions = ref<MovieReaction[]>([])
const newComment = ref('')
const editingCommentId = ref<string | null>(null)
const editCommentText = ref('')
const streamUrl = ref<string | null>(null)
const shouldPlay = ref(false)

const loading = ref(true)
const error = ref<string | null>(null)
const isNotFound = ref(false)
const descriptionExpanded = ref(false)


const formattedFileSize = computed(() => {
  if (!movie.value?.file_size) return null
  const bytes = movie.value.file_size
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(0)} KB`
})

const formattedRuntime = computed(() => {
  if (!movie.value?.runtime) return null
  const hrs = Math.floor(movie.value.runtime / 60)
  const mins = movie.value.runtime % 60
  if (hrs > 0) {
    return `${hrs}h ${mins}m`
  }
  return `${mins} min`
})

async function fetchData() {
  loading.value = true
  error.value = null
  isNotFound.value = false

  try {
    const movieData = await apiClient.getMovie(movieId.value)
    movie.value = movieData

    // Fetch parallel data
    const [audioData, commentsData, reactionsData] = await Promise.allSettled([
      apiClient.getAudioTracks(movieId.value),
      apiClient.getComments(movieId.value),
      apiClient.getReactions(movieId.value)
    ])

    audioTracks.value = audioData.status === 'fulfilled' ? (audioData.value || []) : []
    comments.value = commentsData.status === 'fulfilled' ? (commentsData.value || []) : []
    
    // Sort reactions nicely
    const defaultOrder = ["🔥", "👍", "💩", "❤️", "😂"]
    let rData = (reactionsData as any).status === 'fulfilled' ? (reactionsData as any).value : []
    if (!rData) rData = []
    rData.sort((a: MovieReaction, b: MovieReaction) => defaultOrder.indexOf(a.reaction_type) - defaultOrder.indexOf(b.reaction_type))
    reactions.value = rData

    // Pre-fetch playback token in the background so it's ready instantly when user clicks Play
    if (isAuthenticated.value) {
      apiClient.startPlayback(movieId.value).then(res => {
         streamUrl.value = `http://localhost:8000/api/v1/playback/stream/${movieId.value}?token=${res.playback_token}`
      }).catch(err => console.error("Prefetch playback failed", err))
    }

  } catch (err: any) {
    if (err instanceof ApiError && err.status === 404) {
      isNotFound.value = true
    } else {
      error.value = err?.message || 'Failed to load movie details'
    }
  } finally {
    loading.value = false
  }
}

async function handlePlay() {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  shouldPlay.value = true
  if (!streamUrl.value) {
    try {
      const res = await apiClient.startPlayback(movieId.value)
      streamUrl.value = `http://localhost:8000/api/v1/playback/stream/${movieId.value}?token=${res.playback_token}`
    } catch (err: any) {
      alert(err.message || 'Failed to start playback')
      shouldPlay.value = false
    }
  }
}

async function postComment() {
  if (!newComment.value.trim()) return
  try {
    const comment = await apiClient.postComment(movieId.value, newComment.value)
    comments.value.unshift(comment)
    newComment.value = ''
  } catch (err: any) {
    alert(err.message || 'Failed to post comment')
  }
}

async function deleteComment(id: string) {
  if (!confirm('Are you sure you want to delete this comment?')) return
  try {
    await apiClient.deleteComment(id)
    comments.value = comments.value.filter(c => c.id !== id)
  } catch (err: any) {
    alert(err.message || 'Failed to delete comment')
  }
}

function startEditComment(comment: Comment) {
  editingCommentId.value = comment.id
  editCommentText.value = comment.text
}

function cancelEditComment() {
  editingCommentId.value = null
  editCommentText.value = ''
}

async function saveEditComment(id: string) {
  if (!editCommentText.value.trim()) return
  try {
    const updated = await apiClient.updateComment(id, editCommentText.value)
    const idx = comments.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      comments.value[idx] = updated
    }
    editingCommentId.value = null
  } catch (err: any) {
    alert(err.message || 'Failed to update comment')
  }
}

async function toggleReaction(reaction_type: string) {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  try {
    const res = await apiClient.toggleReaction(movieId.value, reaction_type)
    const r = reactions.value.find(x => x.reaction_type === reaction_type)
    if (r) {
      if (res.action === 'added') {
        r.count++
        r.user_reacted = true
      } else {
        r.count--
        r.user_reacted = false
      }
    }
  } catch (err: any) {
    console.error('Failed to toggle reaction', err)
  }
}

onMounted(() => {
  if (!currentUser.value && token.value) {
    fetchCurrentUser()
  }
  fetchData()
})
</script>

<template>
  <div class="movie-details-page">
    <nav class="details-nav">
      <router-link to="/" class="back-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        Back to Catalog
      </router-link>
    </nav>

    <!-- Loading Skeleton (matches exact YouTube layout to avoid UI flash) -->
    <div v-if="loading" class="yt-layout skeleton-layout">
      <div class="player-container player-skeleton"></div>
      <div class="main-content">
        <div class="title-skeleton"></div>
        <div class="reactions-skeleton"></div>
        <div class="desc-skeleton"></div>
      </div>
    </div>

    <!-- 404 Not Found State -->
    <div v-else-if="isNotFound" class="details-state not-found-state">
      <div class="state-icon text-amber">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m15 9-6 6"/>
          <path d="m9 9 6 6"/>
        </svg>
      </div>
      <h2>Movie Not Found</h2>
      <p>The requested movie does not exist or has been removed.</p>
      <router-link to="/" class="nav-btn">Return to Catalog</router-link>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="details-state error-state">
      <div class="state-icon text-red">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2>Error Loading Details</h2>
      <p>{{ error }}</p>
      <button class="nav-btn" @click="fetchData">Retry</button>
    </div>

    <!-- Details View (YouTube-style) -->
    <div v-else-if="movie" class="yt-layout">
      <!-- Player Area -->
      <div v-if="!shouldPlay" class="player-container" @click="handlePlay">
        <div class="player-splash" :style="{ backgroundImage: `url(${movie.backdrop || movie.poster})` }">
          <div class="player-overlay">
            <div class="play-circle">
              <Play :size="48" fill="currentColor" class="play-icon" />
            </div>
          </div>
        </div>
      </div>
      <VideoPlayer v-else-if="streamUrl" :src="streamUrl" :poster="movie.backdrop || movie.poster || undefined" :title="movie.title" />

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Title & Reactions -->
        <h1 class="movie-title">{{ movie.title }}</h1>
        <div class="actions-row">
          <div class="reactions-bar">
            <button 
              v-for="r in reactions" 
              :key="r.reaction_type" 
              class="reaction-btn" 
              :class="{ active: r.user_reacted }"
              @click="toggleReaction(r.reaction_type)"
              :title="!isAuthenticated ? 'Log in to react' : ''"
            >
              <span class="reaction-emoji">{{ r.reaction_type }}</span>
              <span class="reaction-count" v-if="r.count > 0">{{ r.count }}</span>
            </button>
          </div>
        </div>

        <!-- Collapsible Description -->
        <div class="description-box" :class="{ expanded: descriptionExpanded }" @click="descriptionExpanded = !descriptionExpanded">
          <div class="desc-stats">
            <span class="stat-badge">{{ movie.rating?.toFixed(1) || 'N/A' }} ⭐</span>
            <span class="stat-text" v-if="movie.year">{{ movie.year }}</span>
            <span class="stat-text" v-if="formattedRuntime">{{ formattedRuntime }}</span>
            <span class="stat-text" v-if="formattedFileSize">{{ formattedFileSize }}</span>
            <span class="stat-text quality" v-if="movie.quality">{{ movie.quality }}</span>
          </div>
          
          <div class="desc-genres" v-if="movie.genres?.length">
            <span v-for="g in movie.genres" :key="g.id" class="desc-genre">#{{ g.slug }}</span>
          </div>

          <div class="desc-text">
            {{ movie.overview || 'No description provided.' }}
          </div>
          
          <AudioTracksList v-if="descriptionExpanded && audioTracks?.length" :tracks="audioTracks" class="audio-tracks-mt" />

          <button class="expand-btn" @click.stop="descriptionExpanded = !descriptionExpanded">
            {{ descriptionExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Comments Section -->
        <div class="comments-section">
          <h3 class="comments-title">{{ comments?.length || 0 }} Comments</h3>
          
          <!-- Add Comment Box -->
          <div class="comment-input-area" v-if="isAuthenticated">
            <div class="comment-avatar me">{{ currentUser?.username[0].toUpperCase() }}</div>
            <div class="comment-form">
              <input 
                type="text" 
                v-model="newComment" 
                placeholder="Add a comment... (emojis supported 😊)" 
                class="comment-input"
                @keyup.enter="postComment"
              />
              <div class="comment-actions" v-if="newComment.trim()">
                <button class="post-btn" @click="postComment">Comment</button>
              </div>
            </div>
          </div>
          <div v-else class="login-prompt">
            <router-link to="/login" class="login-link">Log in</router-link> to add a comment.
          </div>

          <!-- Comments List -->
          <div class="comments-list">
            <div v-for="comment in comments" :key="comment.id" class="comment-item">
              <div class="comment-avatar">{{ comment.user.username[0].toUpperCase() }}</div>
              <div class="comment-body" v-if="editingCommentId !== comment.id">
                <div class="comment-header">
                  <span class="comment-author">@{{ comment.user.username }}</span>
                  <span class="comment-date">{{ new Date(comment.created_at).toLocaleDateString() }}</span>
                </div>
                <div class="comment-text">{{ comment.text }}</div>
              </div>
              <div class="comment-body edit-mode" v-else>
                <input type="text" v-model="editCommentText" class="comment-input edit-input" @keyup.enter="saveEditComment(comment.id)" />
                <div class="edit-actions">
                  <button class="edit-save-btn" @click="saveEditComment(comment.id)"><Check :size="14" /> Save</button>
                  <button class="edit-cancel-btn" @click="cancelEditComment"><X :size="14" /> Cancel</button>
                </div>
              </div>
              <div class="comment-admin" v-if="currentUser?.role === 'admin' || currentUser?.id === comment.user.id">
                <button v-if="editingCommentId !== comment.id" class="edit-btn" @click="startEditComment(comment)" title="Edit comment">
                  <Edit2 :size="16" />
                </button>
                <button class="delete-btn" @click="deleteComment(comment.id)" title="Delete comment">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <div v-if="!comments?.length" class="no-comments">
              No comments yet. Be the first to share your thoughts!
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.movie-details-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 64px 16px;
  box-sizing: border-box;
}

.details-nav {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9ca3af;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: color 0.15s ease;
}

.back-link:hover {
  color: #f3f4f6;
}

/* Common states */
.details-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #9ca3af;
}

/* Skeleton layout for seamless zero-flicker loading */
.skeleton-layout {
  opacity: 0.85;
}

.player-skeleton {
  background: linear-gradient(90deg, #16171e 25%, #222430 50%, #16171e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  cursor: default;
}

.title-skeleton {
  height: 32px;
  width: 60%;
  max-width: 450px;
  border-radius: 8px;
  background: linear-gradient(90deg, #16171e 25%, #222430 50%, #16171e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  margin-bottom: 16px;
}

.reactions-skeleton {
  height: 36px;
  width: 240px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 20px;
}

.desc-skeleton {
  height: 100px;
  width: 100%;
  border-radius: 12px;
  background: linear-gradient(90deg, #16171e 25%, #222430 50%, #16171e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.nav-btn {
  display: inline-block;
  padding: 8px 20px;
  background: #3b82f6;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  margin-top: 16px;
}

/* YouTube Layout */
.yt-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
  margin: 0 auto;
}

/* Player */
.player-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.player-splash {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  transition: transform 0.3s ease;
}

.player-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s ease;
}

.player-container:hover .player-overlay {
  background: rgba(0, 0, 0, 0.1);
}

.player-container:hover .player-splash {
  transform: scale(1.02);
}

.play-circle {
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: transform 0.2s ease, background 0.2s ease;
}

.player-container:hover .play-circle {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.play-icon {
  margin-left: 6px;
}

/* Main Content */
.movie-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #f3f4f6;
  margin: 0 0 12px 0;
}

.actions-row {
  display: flex;
  margin-bottom: 20px;
}

.reactions-bar {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  padding: 4px;
  gap: 4px;
}

.reaction-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 8px 14px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  color: #9ca3af;
  font-weight: 500;
  font-size: 0.95rem;
}

.reaction-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.reaction-btn.active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.reaction-emoji {
  font-size: 1.1rem;
}

/* Description Box */
.description-box {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  margin-bottom: 24px;
}

.description-box:hover {
  background: rgba(255, 255, 255, 0.08);
}

.desc-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  color: #f3f4f6;
}

.stat-badge {
  color: #fbbf24;
}

.stat-text {
  color: #e5e7eb;
}

.stat-text.quality {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.desc-genres {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.desc-genre {
  color: #60a5fa;
  font-size: 0.9rem;
}

.desc-text {
  color: #d1d5db;
  line-height: 1.5;
  font-size: 0.95rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.description-box.expanded .desc-text {
  -webkit-line-clamp: unset;
}

.expand-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-weight: 600;
  padding: 0;
  margin-top: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

.expand-btn:hover {
  color: #f3f4f6;
}

.audio-tracks-mt {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Comments */
.comments-section {
  margin-top: 24px;
}

.comments-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #f3f4f6;
  margin-bottom: 20px;
}

.login-prompt {
  background: rgba(255, 255, 255, 0.02);
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  color: #9ca3af;
  margin-bottom: 24px;
}

.login-link {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 600;
}

.comment-input-area {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
}

.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.comment-avatar.me {
  background: #ef4444;
}

.comment-form {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.comment-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  color: #f3f4f6;
  font-size: 0.95rem;
  padding: 8px 0;
  outline: none;
  transition: border-color 0.2s ease;
}

.comment-input:focus {
  border-bottom-color: #f3f4f6;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.post-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 18px;
  font-weight: 600;
  cursor: pointer;
}

.post-btn:hover {
  background: #2563eb;
}

/* Comments List */
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.comment-item {
  display: flex;
  gap: 16px;
}

.comment-body {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-weight: 600;
  color: #f3f4f6;
  font-size: 0.9rem;
}

.comment-date {
  color: #9ca3af;
  font-size: 0.8rem;
}

.comment-text {
  color: #e5e7eb;
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.comment-admin {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.comment-item:hover .comment-admin {
  opacity: 1;
}

.delete-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

.no-comments {
  text-align: center;
  padding: 40px;
  color: #6b7280;
  font-style: italic;
}

.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px;
  color: #fff;
  font-size: 0.95rem;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.edit-save-btn, .edit-cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.edit-save-btn {
  color: #34d399;
}
.edit-save-btn:hover {
  background: rgba(52, 211, 153, 0.1);
}

.edit-cancel-btn {
  color: #f87171;
}
.edit-cancel-btn:hover {
  background: rgba(248, 113, 113, 0.1);
}

.edit-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
}
.edit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>
