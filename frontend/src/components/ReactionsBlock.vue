<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { apiClient } from '@/api/client'
import type { MovieReaction } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  targetId: string
  targetType: 'movie' | 'series'
}>()

const emit = defineEmits<{
  (e: 'update:reactions', reactions: MovieReaction[]): void
}>()

const authStore = useAuthStore()
const { isAuthenticated } = authStore

const reactions = ref<MovieReaction[]>([])
const isLoading = ref(true)

async function fetchReactions() {
  try {
    const data = await apiClient.getReactions(props.targetId, props.targetType)
    // Sort reactions nicely
    const rData = [...data].sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count
      return a.reaction_type.localeCompare(b.reaction_type)
    })
    reactions.value = rData
    emit('update:reactions', rData)
  } catch (error) {
    console.error('Failed to fetch reactions:', error)
  } finally {
    isLoading.value = false
  }
}

async function toggleReaction(reaction_type: string) {
  if (!isAuthenticated.value) return // Handled by App/router globally usually, but we keep it safe
  
  // Optimistic update
  const r = reactions.value.find(x => x.reaction_type === reaction_type)
  if (r) {
    if (r.user_reacted) {
      r.count = Math.max(0, r.count - 1)
      r.user_reacted = false
    } else {
      r.count++
      r.user_reacted = true
    }
  } else {
    reactions.value.push({
      reaction_type,
      count: 1,
      user_reacted: true
    })
  }
  
  try {
    await apiClient.toggleReaction(props.targetId, props.targetType, reaction_type)
  } catch (err) {
    console.error("Failed to toggle reaction", err)
    // Revert optimistic if needed... (skipped for brevity)
    await fetchReactions()
  }
}

onMounted(() => {
  fetchReactions()
})

watch(() => props.targetId, () => {
  isLoading.value = true
  fetchReactions()
})
</script>

<template>
  <div class="reactions-bar">
    <template v-if="isLoading">
      <div v-for="i in 5" :key="i" class="reaction-btn skeleton-btn">
        <div class="reactions-skeleton"></div>
      </div>
    </template>
    <template v-else>
      <button 
        v-for="r in reactions" 
        :key="r.reaction_type"
        class="reaction-btn" 
        :class="{ 'active': r.user_reacted }"
        :disabled="!isAuthenticated"
        @click="toggleReaction(r.reaction_type)"
      >
        <span class="reaction-emoji">{{ r.reaction_type }}</span>
        <span class="reaction-count">{{ r.count > 0 ? r.count : '' }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.reactions-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-panel);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--ui-secondary);
  font-size: 0.95rem;
  min-width: 48px;
  justify-content: center;
}

.reaction-btn:hover:not(:disabled) {
  background: var(--ui-raised);
  border-color: var(--ui-border);
  transform: translateY(-1px);
}

.reaction-btn.active {
  background: var(--ui-raised);
  border-color: var(--ui-border);
  color: var(--ui-text);
}

.reaction-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.skeleton-btn {
  border-color: transparent;
  background: transparent;
  padding: 0;
}

.reactions-skeleton {
  width: 54px;
  height: 34px;
  border-radius: var(--ui-radius-panel);
  background: var(--ui-surface);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
