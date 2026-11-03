/** Torrent preparation status. PRO/Admin only; non-eligible always get 'unavailable'. */
import { adRequest } from './client'

export type PrepStatus = 'not_queued' | 'queued' | 'searching' | 'loading' | 'partial' | 'playable' | 'retrying' | 'unavailable'
export type PrepStatusItem = { status: PrepStatus; playable: boolean; progress?: number; start_ms?: number | null }
export type PrepStatusMap = Record<string, PrepStatusItem>

/** Stage labels shown by the live progress bar (detail page and Kinoteka). */
export const PREP_LABELS: Record<PrepStatus, string> = {
  not_queued:  '',
  queued:      'В очереди',
  searching:   'Поиск раздач',
  loading:     'Проверка и буферизация',
  partial:     'Готово',
  playable:    'Готово',
  retrying:    'В очереди',
  unavailable: 'Раздачи не найдены',
}

/** Server-side progress per stage; used when an older backend omits `progress`. */
export const PREP_PROGRESS: Record<PrepStatus, number> = {
  not_queued: 0, unavailable: 0, queued: 10, retrying: 10, searching: 35, loading: 75, partial: 100, playable: 100,
}

export const IN_PROGRESS: readonly PrepStatus[] = ['queued', 'searching', 'loading', 'retrying']

export const preparationApi = {
  status(keys: string[]): Promise<{ statuses: PrepStatusMap }> {
    if (!keys.length) return Promise.resolve({ statuses: {} })
    const q = encodeURIComponent(keys.slice(0, 100).join(','))
    return adRequest<{ statuses: PrepStatusMap }>(`/torrents/preparation-status?keys=${q}`, { cache: 'no-store' })
  },
}
