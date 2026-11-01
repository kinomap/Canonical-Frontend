import { adRequest } from './client'
import type { TorrentItem, TorrentKind } from './torrents'
export type LibraryPage = {items:TorrentItem[];page:number;total:number;total_pages:number}
export const libraryApi = {
 list:(page=1)=>adRequest<LibraryPage>(`/account/library?page=${page}&size=24`,{cache:'no-store'}),
 membership:(keys:string[])=>adRequest<{saved:string[]}>(`/account/library/membership?keys=${encodeURIComponent(keys.join(','))}`,{cache:'no-store'}),
 set:(kind:TorrentKind,id:number,saved:boolean)=>adRequest<{saved:boolean}>(`/account/library/${kind}/${id}`,{method:saved?'PUT':'DELETE',cache:'no-store'}),
}
