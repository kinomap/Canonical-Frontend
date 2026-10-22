<script setup lang="ts">
import { t } from '@/i18n'
import AdPlaybackContainer from './AdPlaybackContainer.vue'
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{
  src: string;
  requested?: boolean;
  targetId?: string;
  targetType?: 'movie' | 'episode';
  poster?: string;
  title?: string;
}>(), { requested: true })

const emit = defineEmits(['close', 'ended'])

const videoRef = ref<HTMLVideoElement | null>(null)
const adsRef=ref<InstanceType<typeof AdPlaybackContainer>|null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const isFullscreen = ref(false)
const buffered = ref(0)
const isBuffering = ref(true)
const isDragging = ref(false)
const dragPosition = ref(0) // 0 to 1

// Controls auto-hide logic
const isControlsVisible = ref(true)
let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null

function showControls() {
  isControlsVisible.value = true
  if (hideControlsTimeout) {
    clearTimeout(hideControlsTimeout)
    hideControlsTimeout = null
  }
  if (isPlaying.value) {
    hideControlsTimeout = setTimeout(() => {
      isControlsVisible.value = false
    }, 2500)
  }
}

function handleMouseLeave() {
  if (isPlaying.value) {
    isControlsVisible.value = false
  }
}

watch(isPlaying, (playing) => {
  if (!playing) {
    isControlsVisible.value = true
    if (hideControlsTimeout) clearTimeout(hideControlsTimeout)
  } else {
    showControls()
  }
})

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function togglePlay() {
  if(props.requested===false)return
  if (adsRef.value?.busy) return
  if (!videoRef.value) return
  if (videoRef.value.paused) {
    videoRef.value.play().catch(() => {})
  } else {
    videoRef.value.pause()
  }
}

function skip(amount: number) {
  if (adsRef.value?.busy) return
  if (!videoRef.value) return
  videoRef.value.currentTime = Math.max(0, Math.min(videoRef.value.duration || Infinity, videoRef.value.currentTime + amount))
  showControls()
}

function handleTimeUpdate() {
  if (!videoRef.value || isDragging.value) return
  adsRef.value?.tick()
  currentTime.value = videoRef.value.currentTime
  
  if (videoRef.value.buffered.length > 0) {
    const bufferedEnd = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
    buffered.value = (bufferedEnd / (videoRef.value.duration || 1)) * 100
  }
}

function handleLoadedMetadata() {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
}

function handleWaiting() {
  isBuffering.value = true
}

function handlePlaying() {
  if(adsRef.value?.busy){videoRef.value?.pause();return}
  isBuffering.value = false
  isPlaying.value = true
}

function handleCanPlay() {
  isBuffering.value = false
}

function handlePause() {
  isPlaying.value = false
}

async function handleEnded() {
  await adsRef.value?.end()
  isPlaying.value = false
  // Playback finished on its own: the owner can release the playback session.
  emit('ended')
}

// Scrubbing
function getFraction(e: MouseEvent | TouchEvent): number {
  const wrap = document.querySelector('.progress-wrap') as HTMLElement | null
  if (!wrap) return 0
  const rect = wrap.getBoundingClientRect()
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const pos = (clientX - rect.left) / rect.width
  return Math.max(0, Math.min(1, pos))
}

function onProgressMouseDown(e: MouseEvent | TouchEvent) {
  if (adsRef.value?.busy) return
  if (!videoRef.value || !duration.value) return
  isDragging.value = true
  dragPosition.value = getFraction(e)
  currentTime.value = dragPosition.value * duration.value
  showControls()
}

function onDocumentMouseMove(e: MouseEvent | TouchEvent) {
  if (adsRef.value?.busy) return
  if (!isDragging.value || !duration.value) return
  dragPosition.value = getFraction(e)
  currentTime.value = dragPosition.value * duration.value
  showControls()
}

function onDocumentMouseUp(e: MouseEvent | TouchEvent) {
  if (adsRef.value?.busy) return
  if (!isDragging.value || !videoRef.value || !duration.value) return
  isDragging.value = false
  const frac = getFraction(e)
  videoRef.value.currentTime = frac * duration.value
  currentTime.value = frac * duration.value
}

function toggleMute() {
  if (!videoRef.value) return
  isMuted.value = !isMuted.value
  videoRef.value.muted = isMuted.value
}

function handleVolumeChange(event: Event) {
  if (!videoRef.value) return
  const val = parseFloat((event.target as HTMLInputElement).value)
  volume.value = val
  videoRef.value.volume = val
  if (val > 0) {
    isMuted.value = false
    videoRef.value.muted = false
  }
}

function toggleFullscreen() {
  const container = document.querySelector('.video-player-container') as HTMLElement | null
  if (!document.fullscreenElement) {
    container?.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`)
    })
  } else {
    document.exitFullscreen().catch(() => {})
  }
}

function handleKeydown(e: KeyboardEvent) {
  if(props.requested===false)return
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
    showControls()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    skip(-10)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    skip(10)
  } else if (e.code === 'KeyF') {
    e.preventDefault()
    toggleFullscreen()
  } else if (e.code === 'KeyM') {
    e.preventDefault()
    toggleMute()
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
  document.addEventListener('mousemove', onDocumentMouseMove)
  document.addEventListener('touchmove', onDocumentMouseMove)
  document.addEventListener('mouseup', onDocumentMouseUp)
  document.addEventListener('touchend', onDocumentMouseUp)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('touchmove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)
  document.removeEventListener('touchend', onDocumentMouseUp)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div 
    class="video-player-container" 
    :class="{ 'fullscreen': isFullscreen, 'hide-cursor': !isControlsVisible && isPlaying }"
    @mousemove="showControls"
    @mouseleave="handleMouseLeave"
    @click="showControls"
  >
    <div class="video-wrap">
      <video 
        ref="videoRef"
        :src="src||undefined"
        :poster="poster"
        preload="auto"
        playsinline
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoadedMetadata"
        @waiting="handleWaiting"
        @playing="handlePlaying"
        @canplay="handleCanPlay"
        @pause="handlePause"
        @ended="handleEnded"
        @click="togglePlay"
        :autoplay="!targetId"
        @seeking="adsRef?.tick()"
      ></video>
      
      <AdPlaybackContainer ref="adsRef" :main="videoRef" :target-id="targetId" :target-type="targetType" :source="src" :requested="requested" />
      <!-- Buffering overlay -->
      <div class="buf-overlay" :class="{ show: isBuffering }">
        <div class="spinner"></div>
      </div>

      <!-- Top gradient & title -->
      <transition name="fade-slide-down">
        <div class="top-controls-overlay" v-show="isControlsVisible || !isPlaying">
          <div class="now-playing-title">{{ title }}</div>
        </div>
      </transition>

      <!-- Bottom controls overlay -->
      <transition name="fade-slide-up">
        <div class="bottom-controls-overlay" v-show="isControlsVisible || !isPlaying">
          <div 
            class="progress-wrap" 
            @mousedown="onProgressMouseDown"
            @touchstart="onProgressMouseDown"
          >
            <div class="progress-buf" :style="{ width: `${buffered}%` }"></div>
            <div 
              class="progress-fill" 
              :style="{ width: `${duration ? ((isDragging ? dragPosition * duration : currentTime) / duration) * 100 : 0}%` }"
            ></div>
            <div 
              class="progress-thumb" 
              :style="{ left: `${duration ? ((isDragging ? dragPosition * duration : currentTime) / duration) * 100 : 0}%` }"
            ></div>
          </div>
          
          <div class="btn-row">
            <button class="ctrl-btn" @click="skip(-10)" :title="t('−10 с')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg>
            </button>
            <button class="ctrl-btn big" @click="togglePlay" :title="t('Play / Pause')">
              <svg v-if="!isPlaying" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
            <button class="ctrl-btn" @click="skip(10)" :title="t('+10 с')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5"/><path d="M6 17l5-5-5-5"/></svg>
            </button>
            
            <div class="time-display">
              <span>{{ formatTime(currentTime) }}</span>
              <span class="sep">/</span>
              <span>{{ formatTime(duration) }}</span>
            </div>
            
            <div class="vol-wrap">
              <span class="vol-icon" @click="toggleMute" :title="t('Mute')">
                <svg v-if="isMuted || volume === 0" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </span>
              <input 
                type="range" 
                class="vol-slider" 
                min="0" 
                max="1" 
                step="0.02" 
                :value="isMuted ? 0 : volume" 
                @input="handleVolumeChange" 
              />
              <button class="ctrl-btn fullscreen-btn" @click="toggleFullscreen" :title="t('Во весь экран')">
                <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.video-player-container {
  width: 100%;
  max-width: 1000px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  position: relative;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.55);
}

.video-player-container.fullscreen {
  max-width: none;
  border-radius: 0;
  width: 100vw;
  height: 100vh;
  aspect-ratio: auto;
}

.video-player-container.hide-cursor,
.video-player-container.hide-cursor * {
  cursor: none !important;
}

.video-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  position: relative;
}

video {
  width: 100%;
  height: 100%;
  max-height: 100vh;
  object-fit: contain;
  cursor: pointer;
  background: #000;
}

.buf-overlay {
  position: absolute; inset: 0;
  display: none;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.4);
  pointer-events: none;
  z-index: 10;
}
.buf-overlay.show { display: flex; }
.spinner {
  width: 48px; height: 48px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top-color: #5b8dee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Controls Overlay */
.top-controls-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%;
  padding: 24px 24px 48px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);
  pointer-events: none;
  z-index: 20;
}
.now-playing-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  margin: 0;
}

.bottom-controls-overlay {
  position: absolute;
  bottom: 0; left: 0; width: 100%;
  padding: 48px 24px 24px;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  z-index: 20;
}

/* Animations */
.fade-slide-up-enter-active, .fade-slide-up-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-slide-up-enter-from, .fade-slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
.fade-slide-down-enter-active, .fade-slide-down-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-slide-down-enter-from, .fade-slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Progress bar */
.progress-wrap {
  position: relative;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  transition: height 0.1s ease;
}
.progress-wrap:hover { height: 8px; }
.progress-buf  { position: absolute; top: 0; left: 0; height: 100%; background: rgba(255,255,255,0.3); border-radius: 3px; }
.progress-fill { position: absolute; top: 0; left: 0; height: 100%; background: #5b8dee; border-radius: 3px; }
.progress-thumb {
  position: absolute; top: 50%;
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s, transform 0.1s;
}
.progress-wrap:hover .progress-thumb, .progress-thumb:active { opacity: 1; }

/* Buttons */
.btn-row {
  display: flex; 
  align-items: center; 
  gap: 16px; 
}
.ctrl-btn {
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.8;
  transition: opacity 0.15s, transform 0.1s;
  padding: 4px;
}
.ctrl-btn:hover { opacity: 1; transform: scale(1.1); }
.ctrl-btn:active { transform: scale(0.95); }
.ctrl-btn.big { opacity: 1; }
.ctrl-btn.big svg { width: 32px; height: 32px; }

.time-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #f1f5f9;
  font-weight: 500;
  margin-left: 8px;
}
.time-display .sep { color: #94a3b8; margin: 0 4px; }

.vol-wrap {
  display: flex; align-items: center; gap: 12px; margin-left: auto;
}
.vol-icon { 
  color: #fff; opacity: 0.8; cursor: pointer; transition: opacity 0.15s;
  display: flex; align-items: center;
}
.vol-icon:hover { opacity: 1; }
input[type="range"].vol-slider {
  -webkit-appearance: none;
  width: 80px; height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
}
input[type="range"].vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}
.fullscreen-btn {
  margin-left: 8px;
}
</style>
