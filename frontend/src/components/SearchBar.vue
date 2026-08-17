<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, X, Loader2 } from 'lucide-vue-next'
import { apiClient } from '@/api/client'
import type { MovieSummary } from '@/types/movie'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  debounceMs?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
  (e: 'search', val: string): void
}>()

const router = useRouter()
const query = ref(props.modelValue || '')
const suggestions = ref<MovieSummary[]>([])
const loading = ref(false)
const showDropdown = ref(false)
const searchBarRef = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setTimeout> | null = null

// Watch external value updates
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal !== undefined && newVal !== query.value) {
      query.value = newVal
    }
  }
)

async function fetchSuggestions(q: string) {
  if (!q.trim() || q.trim().length < 2) {
    suggestions.value = []
    showDropdown.value = false
    return
  }
  
  loading.value = true
  showDropdown.value = true
  try {
    const res = await apiClient.searchMoviesQuick(q.trim(), 5)
    suggestions.value = res.items
  } catch (err) {
    console.error('Failed to fetch suggestions:', err)
  } finally {
    loading.value = false
  }
}

function onInput() {
  emit('update:modelValue', query.value)
  
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    fetchSuggestions(query.value)
  }, props.debounceMs ?? 300)
}

function clear() {
  query.value = ''
  emit('update:modelValue', '')
  suggestions.value = []
  showDropdown.value = false
  if (timer) clearTimeout(timer)
  emit('search', '')
}

function onEnter() {
  if (timer) clearTimeout(timer)
  showDropdown.value = false
  emit('search', query.value)
}

function selectSuggestion(movie: MovieSummary) {
  showDropdown.value = false
  query.value = movie.title
  emit('update:modelValue', movie.title)
  router.push(`/movies/${movie.id}`)
}

// Handle click outside to close dropdown
function handleClickOutside(event: MouseEvent) {
  if (searchBarRef.value && !searchBarRef.value.contains(event.target as Node)) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div class="search-bar" ref="searchBarRef">
    <Search class="search-icon" :size="18" stroke-width="2" />

    <input
      v-model="query"
      type="text"
      :placeholder="placeholder || 'Search movies...'"
      class="search-input"
      @input="onInput"
      @keydown.enter="onEnter"
      @focus="query.trim().length >= 2 && (showDropdown = true)"
    />

    <button v-if="query" class="clear-btn" title="Clear search" @click="clear">
      <X :size="16" stroke-width="2" />
    </button>

    <!-- Autocomplete Dropdown -->
    <div v-if="showDropdown && (loading || suggestions.length > 0 || query.trim().length >= 2)" class="search-dropdown">
      <div v-if="loading" class="dropdown-state">
        <Loader2 class="spinner" :size="20" stroke-width="2" />
        <span>Searching...</span>
      </div>
      
      <div v-else-if="suggestions.length === 0" class="dropdown-state">
        <span>No results found</span>
      </div>

      <ul v-else class="suggestions-list">
        <li 
          v-for="movie in suggestions" 
          :key="movie.id" 
          class="suggestion-item"
          @click="selectSuggestion(movie)"
        >
          <img :src="movie.poster" alt="" class="suggestion-poster" v-if="movie.poster" />
          <div class="suggestion-info">
            <h4 class="suggestion-title">{{ movie.title }}</h4>
            <span class="suggestion-meta" v-if="movie.year">{{ movie.year }} <span v-if="movie.rating">★ {{ movie.rating.toFixed(1) }}</span></span>
          </div>
        </li>
      </ul>
      
      <!-- See all results link -->
      <div class="dropdown-footer" v-if="!loading && suggestions.length > 0" @click="onEnter">
        <span>See all results for "{{ query }}"</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 480px;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: #6b7280;
  pointer-events: none;
  z-index: 2;
}

.search-input {
  width: 100%;
  padding: 10px 38px 10px 42px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #f3f4f6;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  z-index: 1;
}

.search-input:focus {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.08);
}

.clear-btn {
  position: absolute;
  right: 10px;
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  z-index: 2;
}

.clear-btn:hover {
  color: #f3f4f6;
  background: rgba(255, 255, 255, 0.1);
}

/* Dropdown */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  background: #1a1b23;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.dropdown-state {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9ca3af;
  font-size: 0.9rem;
}

.spinner {
  animation: spin 1s linear infinite;
  color: #3b82f6;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.suggestions-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  max-height: 360px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.suggestion-poster {
  width: 40px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  background: #2a2b36;
}

.suggestion-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.suggestion-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggestion-meta {
  font-size: 0.8rem;
  color: #9ca3af;
}

.dropdown-footer {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.9rem;
  color: #3b82f6;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s ease;
}

.dropdown-footer:hover {
  background: rgba(255, 255, 255, 0.05);
}
</style>
