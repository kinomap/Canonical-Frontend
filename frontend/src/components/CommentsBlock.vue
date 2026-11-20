<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { apiClient } from '@/api/client'
import type { Comment } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { Check, X, Edit2, Trash2 } from 'lucide-vue-next'
import UserAvatar from '@/components/UserAvatar.vue'

const props = defineProps<{
  targetId: string
  targetType: 'movie' | 'series'
}>()

const authStore = useAuthStore()
const { isAuthenticated, user: currentUser } = authStore

// Telegram-only accounts may intentionally have no public username.
function authorName(user?: { username?: string | null; display_name?: string | null } | null): string {
  const shown = user?.display_name?.trim()
  if (shown) return shown
  return user?.username ? `@${user.username}` : ''
}

const comments = ref<Comment[]>([])
const newComment = ref('')
const editingCommentId = ref<string | null>(null)
const editCommentText = ref('')
const commentError = ref<string | null>(null)
const isLoading = ref(true)

// Anti-spam: one comment per COMMENT_COOLDOWN_MS from this block. The state is
// per instance, so the film and series blocks never hold each other up.
const COMMENT_COOLDOWN_MS = 4000
const isPosting = ref(false)
const cooldownLeft = ref(0)
let cooldownUntil = 0
let cooldownTimer: ReturnType<typeof setInterval> | undefined

function tickCooldown() {
  const left = cooldownUntil - Date.now()
  cooldownLeft.value = left > 0 ? Math.ceil(left / 1000) : 0
  if (left <= 0 && cooldownTimer !== undefined) {
    clearInterval(cooldownTimer)
    cooldownTimer = undefined
  }
}

function startCooldown() {
  cooldownUntil = Date.now() + COMMENT_COOLDOWN_MS
  if (cooldownTimer === undefined) cooldownTimer = setInterval(tickCooldown, 250)
  tickCooldown()
}

async function fetchComments() {
  try {
    const data = await apiClient.getComments(props.targetId, props.targetType)
    comments.value = data || []
  } catch (error) {
    console.error('Failed to fetch comments:', error)
  } finally {
    isLoading.value = false
  }
}

async function postComment() {
  if (!newComment.value.trim() || isPosting.value || cooldownLeft.value > 0) return
  isPosting.value = true
  commentError.value = null
  try {
    const comment = await apiClient.postComment(props.targetId, props.targetType, newComment.value)
    comments.value.unshift(comment)
    newComment.value = ''
    startCooldown()
  } catch (err: any) {
    console.error('Failed to post comment:', err)
    commentError.value = err?.message || 'Failed to post comment'
  } finally {
    isPosting.value = false
  }
}

async function deleteComment(id: string) {
  if (!confirm('Are you sure you want to delete this comment?')) return
  try {
    await apiClient.deleteComment(id) // Assuming delete works the same for both since ID is generic
    comments.value = comments.value.filter(c => c.id !== id)
  } catch (err: any) {
    console.error('Failed to delete comment:', err)
    commentError.value = err?.message || 'Failed to delete comment'
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
    const updated = await apiClient.updateComment(id, editCommentText.value) // Assuming update works the same
    const idx = comments.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      comments.value[idx] = updated
    }
    editingCommentId.value = null
  } catch (err: any) {
    console.error('Failed to update comment:', err)
    commentError.value = err?.message || 'Failed to update comment'
  }
}

onMounted(() => {
  fetchComments()
})

watch(() => props.targetId, () => {
  isLoading.value = true
  fetchComments()
})

onBeforeUnmount(() => {
  if (cooldownTimer !== undefined) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="comments-section">
    <h3 class="comments-title">{{ comments?.length || 0 }} {{ t("Comments") }}</h3>

    <!-- Add Comment Box -->
    <div class="comment-input-area" v-if="isAuthenticated">
      <UserAvatar class="comment-avatar me" :user="currentUser" :size="36" />
      <div class="comment-form">
        <input
          type="text"
          v-model="newComment"
          :placeholder="t('Add a comment... (emojis supported 😊)')"
          class="comment-input"
          maxlength="1000"
          @keyup.enter="postComment"
        />
        <div class="comment-actions" v-if="newComment.trim()">
          <button class="post-btn" :disabled="isPosting || cooldownLeft > 0" :aria-busy="isPosting" @click="postComment">{{ t("Comment") }}<span v-if="cooldownLeft > 0" class="post-cooldown" aria-hidden="true"> · {{ cooldownLeft }}</span></button>
        </div>
      </div>
    </div>

    <!-- Inline comment error (non-auth failures only) -->
    <div v-if="commentError" class="inline-error" role="alert">
      <span>{{ commentError }}</span>
      <button class="close-error-btn" @click="commentError = null" :aria-label="t('Close error')">×</button>
    </div>

    <!-- Comments List -->
    <div class="comments-list">
      <template v-if="isLoading">
        <div v-for="i in 3" :key="i" class="comment-item skeleton-layout">
           <div class="comment-avatar player-skeleton"></div>
           <div class="comment-body">
             <div class="title-skeleton" style="width: 100px; height: 16px; margin-bottom: 8px;"></div>
             <div class="title-skeleton" style="width: 100%; height: 14px;"></div>
           </div>
        </div>
      </template>
      <template v-else>
        <div v-for="comment in comments" :key="comment.id" class="comment-item">
          <UserAvatar class="comment-avatar" :user="comment.user" :size="36" />
          <div class="comment-body" v-if="editingCommentId !== comment.id">
            <div class="comment-header">
              <span v-if="authorName(comment.user)" class="comment-author">{{ authorName(comment.user) }}</span>
              <span class="comment-date">{{ new Date(comment.created_at).toLocaleDateString() }}</span>
            </div>
            <div class="comment-text">{{ comment.text }}</div>
          </div>
          <div class="comment-body edit-mode" v-else>
            <input type="text" v-model="editCommentText" class="comment-input edit-input" @keyup.enter="saveEditComment(comment.id)" />
            <div class="edit-actions">
              <button class="edit-save-btn" @click="saveEditComment(comment.id)"><Check :size="14" /> {{ t("Save") }}</button>
              <button class="edit-cancel-btn" @click="cancelEditComment"><X :size="14" /> {{ t("Cancel") }}</button>
            </div>
          </div>
          <div class="comment-admin" v-if="currentUser?.role === 'admin' || currentUser?.id === comment.user.id">
            <button v-if="editingCommentId !== comment.id" class="edit-btn" @click="startEditComment(comment)" :title="t('Edit comment')">
              <Edit2 :size="16" />
            </button>
            <button class="delete-btn" @click="deleteComment(comment.id)" :title="t('Delete comment')">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <div v-if="!comments?.length" class="no-comments"> {{ t("No comments yet. Be the first to share your thoughts!") }} </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.comments-section {
  width: 100%;
}

.comments-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--ui-text);
}

.comment-input-area {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
}

/* Layout box only: <UserAvatar> draws the picture or the initial itself. */
.comment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
}

.comment-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-control);
  border-radius: 0;
  box-shadow: none;
  padding: 8px 0;
  color: var(--ui-text);
  font-size: 1.1rem;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

/* Calm states: no glow on hover, a thin accent underline on focus. */
.comment-input:hover {
  border-bottom-color: var(--ui-muted);
  box-shadow: none;
}

.comment-input:focus,
.comment-input:focus-visible {
  outline: none !important;
  outline-offset: 0 !important;
  border-bottom-color: var(--ui-primary);
  box-shadow: none;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
}

.post-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  border: none;
  padding: 8px 16px;
  border-radius: var(--ui-radius-panel);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.post-btn:hover {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.post-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.post-cooldown {
  font-variant-numeric: tabular-nums;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.comment-item {
  display: flex;
  gap: 16px;
  group: true;
}

.comment-body {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
}

.comment-author {
  font-weight: 600;
  color: var(--ui-text);
  font-size: 0.95rem;
}

.comment-date {
  color: var(--ui-muted);
  font-size: 0.8rem;
}

.comment-text {
  color: var(--ui-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}

.no-comments {
  color: var(--ui-muted);
  text-align: center;
  padding: 32px 0;
  font-size: 0.95rem;
}

.comment-admin {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.comment-item:hover .comment-admin {
  opacity: 1;
}

.delete-btn, .edit-btn {
  background: none;
  border: none;
  color: var(--ui-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.delete-btn:hover {
  color: var(--ui-danger);
  background: rgba(239, 68, 68, 0.1);
}

.edit-btn:hover {
  color: var(--ui-link);
  background: var(--ui-raised);
}

.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-input {
  font-size: 0.95rem;
  padding: 4px 0;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-save-btn, .edit-cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--ui-radius-panel);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.2s;
}

.edit-save-btn {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.edit-save-btn:hover {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}

.edit-cancel-btn {
  background: transparent;
  color: var(--ui-secondary);
}

.edit-cancel-btn:hover {
  background: var(--ui-raised);
  color: var(--ui-text);
}

.inline-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--ui-danger);
  padding: 12px 16px;
  border-radius: var(--ui-radius);
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.close-error-btn {
  background: transparent;
  border: none;
  color: var(--ui-danger);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.player-skeleton {
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

.title-skeleton {
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
