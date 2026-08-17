<script setup lang="ts">
import type { AudioTrack } from '@/types/movie'

defineProps<{
  tracks: AudioTrack[] | null
}>()

function formatSampleRate(sr: number): string {
  if (sr >= 1000) {
    return `${(sr / 1000).toFixed(1)} kHz`
  }
  return `${sr} Hz`
}

function formatChannels(ch: number): string {
  if (ch === 1) return 'Mono (1.0)'
  if (ch === 2) return 'Stereo (2.0)'
  if (ch === 6) return '5.1 Surround'
  if (ch === 8) return '7.1 Surround'
  return `${ch} channels`
}
</script>

<template>
  <div class="audio-tracks-section">
    <h3 class="section-title">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6v12"/>
        <path d="M6 10v4"/>
        <path d="M18 10v4"/>
        <path d="M3 12h.01"/>
        <path d="M21 12h.01"/>
      </svg>
      Audio Tracks
    </h3>

    <div v-if="!tracks || tracks.length === 0" class="audio-empty">
      Audio tracks unavailable
    </div>

    <div v-else class="audio-tracks-grid">
      <div v-for="track in tracks" :key="track.id" class="track-card" :class="{ default: track.is_default }">
        <div class="track-header">
          <span class="track-index">Track #{{ track.track_index + 1 }}</span>
          <span v-if="track.is_default" class="default-badge">Default</span>
        </div>

        <div class="track-details">
          <div v-if="track.title" class="track-title-text">{{ track.title }}</div>
          <div class="track-meta">
            <span class="meta-tag lang-tag">{{ track.language || 'und' }}</span>
            <span v-if="track.codec" class="meta-tag">{{ track.codec.toUpperCase() }}</span>
            <span v-if="track.channels" class="meta-tag">{{ formatChannels(track.channels) }}</span>
            <span v-if="track.sample_rate" class="meta-tag">{{ formatSampleRate(track.sample_rate) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-tracks-section {
  margin-top: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #f3f4f6;
  margin-bottom: 12px;
}

.audio-empty {
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #9ca3af;
  font-size: 0.9rem;
  text-align: center;
}

.audio-tracks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.track-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.track-card.default {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.06);
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.track-index {
  font-size: 0.8rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
}

.default-badge {
  font-size: 0.7rem;
  font-weight: 600;
  background: #3b82f6;
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
}

.track-title-text {
  font-size: 0.95rem;
  font-weight: 500;
  color: #f3f4f6;
}

.track-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.meta-tag {
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.08);
  color: #d1d5db;
  padding: 2px 8px;
  border-radius: 4px;
}

.lang-tag {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  text-transform: uppercase;
  font-weight: 600;
}
</style>
