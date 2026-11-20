/** Metadata only. Never call a Telegram playback or catalogue endpoint here. */
import { apiClient, adRequest } from './client'
import type { PrepStatus, PrepStatusItem } from './preparation'
export type TorrentKind = 'movie' | 'tv'
export type TmdbGenre = { id: number; name: string }
export type TorrentItem = {
 tmdb_id:number; kind:TorrentKind; title:string; original_title:string; year:number|null;
 overview:string; poster:string|null; backdrop:string|null; rating:number;
 playback_available:false; genres?:TmdbGenre[]; seasons?:number; episodes?:number; runtime?:number;
 season_list?:TorrentSeason[];
 /** Title page only (/torrents/detail): TMDB credits, studios and production countries. */
 tagline?:string; directors?:string[]; cast?:TorrentCastMember[]; studios?:string[]; countries?:string[]; end_year?:number|null;
 /** Directors (series creators) with portraits, the full premiere date, the budget (USD, films) and the TMDB status. */
 director_list?:TorrentPerson[]; country_codes?:string[]; release_date?:string|null; budget?:number|null; status?:string|null;
}
export type TorrentPerson = { name:string; photo:string|null }
export type TorrentCastMember = TorrentPerson & { character:string }
export type TorrentSeason = { season:number; episodes:number; name:string }
export type TorrentPage = { provider:'tmdb'; mode:'metadata_only'; items:TorrentItem[]; page:number; total:number; total_pages:number; refresh_at?:string; rotation?:string; interpreted_as?:string }
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

export type TorrentPlaybackStatus = PrepStatus
/** Same shape as the Kinoteka status: machine state + the stage / label the UI names. */
export type TorrentStatusPayload = PrepStatusItem
export type TorrentSourceState = 'candidate' | 'queued' | 'loading' | 'ready' | 'failed'
export type TorrentEpisode = { season: number; episode: number }
/** One cell of the episode grid: the ready source serving it and the file size. */
export type TorrentSeasonEpisode = { episode: number; source_id: string | null; size_bytes: number }
export type TorrentSeasonFiles = { season: number; episodes: TorrentSeasonEpisode[] }
export type TorrentLanguage = 'ru' | 'uk' | 'en'
/** One audio track of the release file; ``codec`` (aac, ac3, eac3, dts…) and ``channels`` come from the container header. */
export type ContainerAudioTrack = { index: number; language: TorrentLanguage | 'und'; title: string; codec?: string | null; channels?: number | null }
/** Swarm health of a release: judged by the background check, or reported by a viewer (rebuild). */
export type TorrentSourceHealth = 'healthy' | 'degraded' | 'dead'
/** What «Пересобрать источник» did on the server. */
export type TorrentRebuildOutcome = 'promoted' | 'switched' | 'probing' | 'requeued' | 'cooldown' | 'busy' | 'no_source'
export type TorrentSource = {
  source_id: string | null; title: string; quality: string | null; source_type: string | null; languages: TorrentLanguage[];
  seeders: number; size_bytes: number; state: TorrentSourceState; progress: number; start_ms: number | null;
  default: boolean; episodes: TorrentEpisode[]; file_count: number
  voices?: string[]
  audio_tracks?: ContainerAudioTrack[]
  /** Name of the release's video file («Hopeu.2026.1080p.AMZN.WEB-DL.DDP5.1.H.264.mkv»): it names codecs the title omits. */
  file_name?: string | null
  rank?: number
  health?: TorrentSourceHealth
  /** A Russian sentence when the release may not start; null when healthy. */
  warning?: string | null
}
export type TorrentSourcesView = {
  allowed: boolean; status: TorrentStatusPayload; discovering: boolean; in_library: boolean; selected_source_id: string | null;
  sources: TorrentSource[]; qualities: { value: string; available: boolean }[]; languages: { value: TorrentLanguage; available: boolean }[];
  episodes: TorrentEpisode[]
  voices?: { value: string; available: boolean }[]
  seasons?: TorrentSeasonFiles[]
  /** Health and warning of the recommended (selected) release. */
  health?: TorrentSourceHealth | null
  warning?: string | null
  /** A rebuild is still picking a working release (search or probe in flight). */
  rebuilding?: boolean
}
export type StreamChoice = { source_id?: string | null; season?: number | null; episode?: number | null; file_index?: number | null }
export type PlaybackTicket = { stream_url: string; expires_at: string; title: string; source_id?: string | null; season?: number | null; episode?: number | null }
export type DesktopLaunch = { launch_id: string; deep_link: string; expires_at: string }
export type DesktopLaunchRequest = StreamChoice & { kind: TorrentKind; tmdb_id: number; audio_lang?: TorrentLanguage | null; audio_track?: number | null }

function choiceBody(choice: StreamChoice = {}) {
  const body: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(choice)) if (value !== null && value !== undefined && value !== '') body[key] = value
  return body
}

export const torrentPlaybackApi = {
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
  /** «Эта раздача зависла»: strike the watched release and move the title to a working one. */
  rebuild(kind: TorrentKind, tmdb_id: number, source_id?: string | null): Promise<TorrentSourcesView & {rebuild: TorrentRebuildOutcome}> {
    return apiClient.postTorrentAction(`sources/${kind}/${tmdb_id}/rebuild`, source_id ? {source_id} : {})
  },
  desktopLaunch(request: DesktopLaunchRequest, signal?: AbortSignal): Promise<DesktopLaunch> {
    const {kind, tmdb_id, audio_lang, audio_track, ...choice} = request
    const body = {kind, tmdb_id, ...choiceBody({...choice, file_index: undefined}), ...(audio_lang ? {audio_lang} : {}), ...(audio_track != null ? {audio_track} : {})}
    return signal ? apiClient.postTorrentAction<DesktopLaunch>('desktop-launch', body, signal) : apiClient.postTorrentAction<DesktopLaunch>('desktop-launch', body)
  },
  /** A KINOSOTA catalogue film the browser cannot play: the app plays it with its own session. */
  catalogLaunch(movie_id: string, signal?: AbortSignal): Promise<DesktopLaunch> {
    const body = {kind: 'movie' as const, movie_id}
    return signal ? apiClient.postTorrentAction<DesktopLaunch>('desktop-launch', body, signal) : apiClient.postTorrentAction<DesktopLaunch>('desktop-launch', body)
  },
  launchStatus(launch_id: string, signal?: AbortSignal): Promise<{opened: boolean; expired: boolean}> {
    return adRequest(`/torrents/desktop-launch/${encodeURIComponent(launch_id)}`, {signal, cache: 'no-store'})
  },
}
