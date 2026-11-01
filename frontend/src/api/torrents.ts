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
