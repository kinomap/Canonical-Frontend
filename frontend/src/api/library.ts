import { adRequest } from './client'
import type { TorrentItem, TorrentKind } from './torrents'
export type LibrarySort = 'added'|'rating'|'title'
export type LibraryCounts = {movie:number;tv:number}
export type LibraryPage = {items:TorrentItem[];page:number;total:number;total_pages:number;kind?:TorrentKind|null;sort?:LibrarySort;counts?:LibraryCounts}
export const libraryApi = {
 list:(page=1,kind?:TorrentKind,sort:LibrarySort='added')=>adRequest<LibraryPage>(`/account/library?page=${page}&size=24${kind?`&kind=${kind}`:''}${sort!=='added'?`&sort=${sort}`:''}`,{cache:'no-store'}),
 membership:(keys:string[])=>adRequest<{saved:string[]}>(`/account/library/membership?keys=${encodeURIComponent(keys.join(','))}`,{cache:'no-store'}),
 set:(kind:TorrentKind,id:number,saved:boolean)=>adRequest<{saved:boolean}>(`/account/library/${kind}/${id}`,{method:saved?'PUT':'DELETE',cache:'no-store'}),
}
