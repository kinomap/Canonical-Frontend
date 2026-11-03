/** Metadata only. Never call a Telegram playback or catalogue endpoint here. */
import { apiClient, adRequest } from './client'
export type TorrentKind = 'movie' | 'tv'
export type TmdbGenre = { id: number; name: string }
export type TorrentItem = {
 tmdb_id:number; kind:TorrentKind; title:string; original_title:string; year:number|null;
 overview:string; poster:string|null; backdrop:string|null; rating:number;
 playback_available:false; genres?:TmdbGenre[]; seasons?:number; episodes?:number; runtime?:number;
 season_list?:TorrentSeason[];
}
export type TorrentSeason = { season:number; episodes:number; name:string }
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
export type TorrentStatusPayload = { status: TorrentPlaybackStatus; playable: boolean; progress?: number; start_ms?: number | null; quality?: string | null; source_type?: string | null; seeders?: number | null }
export type TorrentSourceState = 'candidate' | 'queued' | 'loading' | 'ready' | 'failed'
export type TorrentEpisode = { season: number; episode: number }
export type TorrentLanguage = 'ru' | 'uk' | 'en'
export type TorrentSource = {
  source_id: string | null; title: string; quality: string | null; source_type: string | null; languages: TorrentLanguage[];
  seeders: number; size_bytes: number; state: TorrentSourceState; progress: number; start_ms: number | null;
  default: boolean; episodes: TorrentEpisode[]; file_count: number
}
export type TorrentSourcesView = {
  allowed: boolean; status: TorrentStatusPayload; discovering: boolean; in_library: boolean; selected_source_id: string | null;
  sources: TorrentSource[]; qualities: { value: string; available: boolean }[]; languages: { value: TorrentLanguage; available: boolean }[];
  episodes: TorrentEpisode[]
}
export type StreamChoice = { source_id?: string | null; season?: number | null; episode?: number | null; file_index?: number | null }
export type PlaybackTicket = { stream_url: string; expires_at: string; title: string; source_id?: string | null; season?: number | null; episode?: number | null }
export type DesktopLaunch = { launch_id: string; deep_link: string; expires_at: string }
export type DesktopLaunchRequest = StreamChoice & { kind: TorrentKind; tmdb_id: number; audio_lang?: TorrentLanguage | null }

/** Only send explicit choices: null/undefined fields are left to the server default. */
function choiceBody(choice: StreamChoice = {}) {
  const body: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(choice)) if (value !== null && value !== undefined && value !== '') body[key] = value
  return body
}

export const torrentPlaybackApi = {
  /** Live, never cached: the progress bar polls this. */
  preparationStatus(keys: string[], signal?: AbortSignal): Promise<{statuses: Record<string, TorrentStatusPayload>}> {
    return adRequest('/torrents/preparation-status?keys=' + encodeURIComponent(keys.slice(0, 100).join(',')), {signal, cache: 'no-store'})
  },
  playbackTicket(kind: TorrentKind, tmdb_id: number, choice: StreamChoice = {}, signal?: AbortSignal): Promise<PlaybackTicket> {
    return apiClient.postTorrentAction<PlaybackTicket>('playback-ticket', {kind, tmdb_id, ...choiceBody(choice)}, signal)
  },
  sources(kind: TorrentKind, tmdb_id: number, signal?: AbortSignal): Promise<TorrentSourcesView> {
    return adRequest(`/torrents/sources/${kind}/${tmdb_id}`, {signal, cache: 'no-store'})
  },
  prepareSource(source_id: string): Promise<{source_id: string; state: TorrentSourceState; progress: number}> {
    return apiClient.postTorrentAction(`sources/${encodeURIComponent(source_id)}/prepare`, {})
  },
  discover(kind: TorrentKind, tmdb_id: number): Promise<{result: 'queued' | 'active' | 'cooldown' | 'no_demand'}> {
    return apiClient.postTorrentAction(`sources/${kind}/${tmdb_id}/discover`, {})
  },
  desktopLaunch(request: DesktopLaunchRequest): Promise<DesktopLaunch> {
    const {kind, tmdb_id, audio_lang, ...choice} = request
    return apiClient.postTorrentAction<DesktopLaunch>('desktop-launch', {kind, tmdb_id, ...choiceBody({...choice, file_index: undefined}), ...(audio_lang ? {audio_lang} : {})})
  },
  launchStatus(launch_id: string, signal?: AbortSignal): Promise<{opened: boolean; expired: boolean}> {
    return adRequest(`/torrents/desktop-launch/${encodeURIComponent(launch_id)}`, {signal, cache: 'no-store'})
  },
}
