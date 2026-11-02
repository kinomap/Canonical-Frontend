/** Metadata only. Never call a Telegram playback or catalogue endpoint here. */
import { apiClient } from './client'
export type TorrentKind = 'movie' | 'tv'
export type TmdbGenre = { id: number; name: string }
export type TorrentItem = {
 tmdb_id:number; kind:TorrentKind; title:string; original_title:string; year:number|null;
 overview:string; poster:string|null; backdrop:string|null; rating:number;
 playback_available:false; genres?:TmdbGenre[]; seasons?:number; episodes?:number; runtime?:number;
}
export type TorrentPage = { provider:'tmdb'; mode:'metadata_only'; items:TorrentItem[]; page:number; total:number; total_pages:number; refresh_at?:string; rotation?:string }
export type TorrentFilters = { kind:TorrentKind; page?:number; genre?:string; year?:string; rating?:string; q?:string; collection?:'spotlight' }
export const torrentsApi = {
 access(signal?:AbortSignal) {return apiClient.getTorrentPlaybackAccess(signal)},
 list(filters:TorrentFilters, signal?:AbortSignal):Promise<TorrentPage> {
  const query=new URLSearchParams({kind:filters.kind,page:String(filters.page||1)})
  if(filters.genre)query.set('genre',filters.genre)
  if(filters.year)query.set('year',filters.year)
  if(filters.rating)query.set('rating',filters.rating)
  if(filters.q?.trim())query.set('q',filters.q.trim().slice(0,120))
  if(filters.collection)query.set('collection',filters.collection)
  return apiClient.getTorrentMetadata<TorrentPage>('catalog?'+query,signal)
 },
 genres(kind:TorrentKind,signal?:AbortSignal):Promise<{items:TmdbGenre[]}> {return apiClient.getTorrentMetadata('genres?kind='+kind,signal)},
 detail(kind:TorrentKind,id:string,signal?:AbortSignal):Promise<TorrentItem> {return apiClient.getTorrentMetadata(`detail/${kind}/${encodeURIComponent(id)}`,signal)},
}
export const torrentPath=(item:Pick<TorrentItem,'kind'|'tmdb_id'>)=>`/torrents/${item.kind}/${item.tmdb_id}`

export type TorrentPlaybackStatus = 'playable' | 'partial' | 'loading' | 'searching' | 'queued' | 'retrying' | 'unavailable' | 'not_queued'
export type PlaybackTicket = { stream_url: string; expires_at: string; title: string }

export const torrentPlaybackApi = {
  preparationStatus(keys: string[], signal?: AbortSignal): Promise<{statuses: Record<string, {status: TorrentPlaybackStatus; playable: boolean}>}> {
    return apiClient.getTorrentMetadata('preparation-status?keys=' + keys.join(','), signal)
  },
  playbackTicket(kind: TorrentKind, tmdb_id: number, file_index = 0, signal?: AbortSignal): Promise<PlaybackTicket> {
    return apiClient.postTorrentAction<PlaybackTicket>('playback-ticket', {kind, tmdb_id, file_index}, signal)
  },
}
