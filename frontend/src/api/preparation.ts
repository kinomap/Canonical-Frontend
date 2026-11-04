/** Torrent preparation status. PRO/Admin only; other accounts get the 'locked' stage. */
import { adRequest } from './client'

export type PrepStatus = 'not_queued' | 'queued' | 'searching' | 'loading' | 'partial' | 'playable' | 'retrying' | 'unavailable'
/** The step a card / detail page names. Sent by the backend; derived from `status` for an older one. */
export type PrepStage = 'idle' | 'queued' | 'searching' | 'checking' | 'ready' | 'not_found' | 'failed' | 'locked'
export type PrepStatusItem = {
  status: PrepStatus
  playable: boolean
  progress?: number
  start_ms?: number | null
  stage?: PrepStage
  label?: string
  /** Safe job error code and its viewer text (retrying / unavailable only). */
  reason?: string | null
  reason_label?: string | null
  retry_at?: string
  /** The prepared default source (ready only). */
  quality?: string | null
  source_type?: string | null
  seeders?: number | null
}
export type PrepStatusMap = Record<string, PrepStatusItem>

export const NOT_FOUND_LABEL = 'Раздачи на трекерах пока не найдены'
/** Stage texts of the live progress bar; the backend sends the same `label`. */
export const STAGE_LABELS: Record<PrepStage, string> = {
  idle: '',
  queued: 'В очереди...',
  searching: 'Поиск источников...',
  checking: 'Проверка потока...',
  ready: 'Готово',
  not_found: NOT_FOUND_LABEL,
  failed: 'Подготовка временно не удалась',
  locked: '',
}
const STATUS_STAGE: Record<PrepStatus, PrepStage> = {
  not_queued: 'idle', queued: 'queued', retrying: 'queued', searching: 'searching',
  loading: 'checking', partial: 'ready', playable: 'ready', unavailable: 'not_found',
}

/** Server-side progress per state; used when an older backend omits `progress`. */
export const PREP_PROGRESS: Record<PrepStatus, number> = {
  not_queued: 0, unavailable: 0, queued: 10, retrying: 10, searching: 35, loading: 75, partial: 100, playable: 100,
}

/** Stages that still move by themselves: the page keeps polling while one is shown. */
export const ACTIVE_STAGES: readonly PrepStage[] = ['queued', 'searching', 'checking']
/** Live refresh period of the progress bars (detail page and Kinoteka). */
export const PREP_POLL_MS = 2500

type StageSource = { status: PrepStatus; stage?: PrepStage | null; label?: string | null }
export function stageOf(item: StageSource | null | undefined): PrepStage {
  if (!item) return 'idle'
  return item.stage || STATUS_STAGE[item.status] || 'idle'
}
export function stageLabel(item: StageSource | null | undefined): string {
  if (!item) return ''
  return item.label || STAGE_LABELS[stageOf(item)]
}
export const isActiveStage = (item: StageSource | null | undefined): boolean => ACTIVE_STAGES.includes(stageOf(item))

export const preparationApi = {
  status(keys: string[]): Promise<{ statuses: PrepStatusMap }> {
    if (!keys.length) return Promise.resolve({ statuses: {} })
    const q = encodeURIComponent(keys.slice(0, 100).join(','))
    return adRequest<{ statuses: PrepStatusMap }>(`/torrents/preparation-status?keys=${q}`, { cache: 'no-store' })
  },
}
