/**
 * Playback target of the TV player (/tv/player) and the remote seek model.
 * src=torrent: kind movie|tv, id = TMDB id (torrentPlaybackApi.playbackTicket).
 * src=catalog: kind movie|series, id = catalogue id (apiClient.startPlayback / startSeriesPlayback).
 */
import type { LocationQuery } from 'vue-router'

export type TvPlayTarget =
  | { src: 'torrent'; kind: 'movie' | 'tv'; id: string; season?: number; episode?: number; sourceId?: string }
  | { src: 'catalog'; kind: 'movie' | 'series'; id: string; episodeId?: string }

function text(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item.trim() : ''
}

function positive(value: unknown): number | undefined {
  const parsed = Number(text(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function tvPlayerQuery(target: TvPlayTarget): Record<string, string> {
  const query: Record<string, string> = { src: target.src, kind: target.kind, id: target.id }
  if (target.src === 'torrent') {
    if (target.season) query.season = String(target.season)
    if (target.episode) query.episode = String(target.episode)
    if (target.sourceId) query.source = target.sourceId
  } else if (target.episodeId) {
    query.ep = target.episodeId
  }
  return query
}

export function tvPlayerLocation(target: TvPlayTarget) {
  return { path: '/tv/player', query: tvPlayerQuery(target) }
}

/** Title card (/tv/details) shown before playback: same query as the player. */
export function tvDetailsLocation(target: TvPlayTarget) {
  const query: Record<string, string> = { src: target.src, kind: target.kind, id: target.id }
  return { path: '/tv/details', query }
}

const SOURCE_ID = /^[\w.:-]{1,128}$/

/** Parse the player query; null when it does not name a playable title. */
export function parseTvPlayTarget(query: LocationQuery): TvPlayTarget | null {
  const src = text(query.src)
  const kind = text(query.kind)
  const id = text(query.id)
  if (!id || id.length > 64 || !/^[\w-]+$/.test(id)) return null
  if (src === 'torrent' && (kind === 'movie' || kind === 'tv')) {
    if (!/^\d+$/.test(id)) return null
    const sourceId = text(query.source)
    return { src, kind, id, season: positive(query.season), episode: positive(query.episode), ...(sourceId && SOURCE_ID.test(sourceId) ? { sourceId } : {}) }
  }
  if (src === 'catalog' && (kind === 'movie' || kind === 'series')) {
    const episodeId = text(query.ep)
    return { src, kind, id, ...(episodeId && /^[\w-]+$/.test(episodeId) ? { episodeId } : {}) }
  }
  return null
}

/** A press within this window continues the seek series (holding the key repeats it too). */
export const SEEK_SERIES_MS = 700
/** The accumulated seek is applied to the video once the remote is quiet for this long. */
export const SEEK_COMMIT_MS = 650
/** Controls fade out after this long without a key press (unless paused). */
export const TV_CONTROLS_HIDE_MS = 3500

/** Seek step of the n-th press of a series: 10 s, then 30 s, then 1 min. */
export function seekStep(pressIndex: number): number {
  if (pressIndex < 3) return 10
  if (pressIndex < 6) return 30
  return 60
}

export function formatClock(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = String(value % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** «+30s», «-10s», «+2m», «+1m 30s». */
export function formatSeekDelta(delta: number): string {
  const sign = delta < 0 ? '-' : '+'
  const value = Math.abs(Math.round(delta))
  if (value < 60) return `${sign}${value}s`
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return seconds ? `${sign}${minutes}m ${seconds}s` : `${sign}${minutes}m`
}
