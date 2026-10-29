import { adRequest } from './client'
export interface HistoryItem {
  movie: { id: string; title: string; original_title?: string; year?: number; poster?: string; rating?: number; status: string }
  source_id: string | null; position: number; duration: number; completed: boolean
  last_watched_at: string; available: boolean; part_number?: number; part_total?: number
}
export interface HistoryPage { items: HistoryItem[]; total: number; page: number; page_size: number; total_pages: number }
export const getHistory = (page: number, size: number) => adRequest<HistoryPage>(`/account/history?page=${page}&page_size=${size}`, {cache:'no-store'})
export const getResume = (id: string) => adRequest<{item: HistoryItem | null}>(`/account/history/${id}`, {cache:'no-store'})

// Sequence belongs to one playback session, not to the movie or browser tab.
// Parallel keepalive delivery is safe: the server rejects out-of-order updates.
export function createHistoryWriter(send?: typeof adRequest) {
  let sequence = 0
  return async (sessionId: string, position: number, duration: number, ended = false, keepalive = false) => {
    if (!sessionId || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
    await (send || adRequest)('/account/history/progress', {method:'POST', keepalive,
      body:JSON.stringify({session_id:sessionId, sequence:++sequence, position:Math.max(0,Math.min(position,duration)), duration, ended})})
  }
}
export function historyCapacity(width: number, height: number) {
  const columns = Math.max(1, Math.floor((width + 16) / 156))
  const rows = Math.max(1, Math.floor((height + 16) / 216))
  const visibleColumns=Math.min(columns,10), visibleRows=Math.min(rows,6)
  return {columns:visibleColumns, rows:visibleRows, size:visibleColumns*visibleRows}
}
