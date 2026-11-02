/** Torrent preparation status. PRO/Admin only; non-eligible always get 'unavailable'. */
import { adRequest } from './client'

export type PrepStatus = 'not_queued' | 'queued' | 'searching' | 'loading' | 'partial' | 'playable' | 'retrying' | 'unavailable'
export type PrepStatusItem = { status: PrepStatus; playable: boolean }
export type PrepStatusMap = Record<string, PrepStatusItem>

export const PREP_LABELS: Record<PrepStatus, string> = {
  not_queued:  '',
  queued:      'В очереди',
  searching:   'Поиск раздачи',
  loading:     'Подготовка на ноде',
  partial:     'Найдены серии',
  playable:    'Готово к просмотру',
  retrying:    'Повтор поиска',
  unavailable: 'Недоступно',
}

export const preparationApi = {
  status(keys: string[]): Promise<{ statuses: PrepStatusMap }> {
    if (!keys.length) return Promise.resolve({ statuses: {} })
    const q = encodeURIComponent(keys.slice(0, 100).join(','))
    return adRequest<{ statuses: PrepStatusMap }>(`/torrents/preparation-status?keys=${q}`, { cache: 'no-store' })
  },
}
