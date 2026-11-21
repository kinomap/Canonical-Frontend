import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const list = vi.fn()
vi.mock('@/api/torrents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/torrents')>()
  return { ...actual, torrentsApi: { ...actual.torrentsApi, list: (...args: unknown[]) => list(...args) } }
})

import { spotlightDelay, useTvSpotlight, SPOTLIGHT_MAX_DELAY_MS, SPOTLIGHT_RETRY_DELAY_MS } from '@/composables/useTvSpotlight'
import TvSpotlightHero from '@/views/tv/TvSpotlightHero.vue'

const HOUR = 3600 * 1000
const NOW = Date.parse('2026-11-21T12:00:00Z')

function item(id: number, extra: Record<string, unknown> = {}) {
  return {
    tmdb_id: id, kind: 'movie', title: `Фильм ${id}`, original_title: '', year: 2024, overview: 'Синопсис',
    poster: null, backdrop: `https://img.example/${id}.jpg`, rating: 8.4, playback_available: false,
    genres: [{ id: 18, name: 'драма' }, { id: 53, name: 'триллер' }], ...extra,
  }
}

function page(id: number, refreshAt?: string) {
  return { provider: 'tmdb', mode: 'metadata_only', items: [item(id)], page: 1, total: 1, total_pages: 1, refresh_at: refreshAt }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

function mountSpotlight() {
  let state!: ReturnType<typeof useTvSpotlight>
  const wrapper = mount(defineComponent({ setup() { state = useTvSpotlight(); return () => h('div') } }))
  return { wrapper, state: () => state }
}

describe('spotlightDelay', () => {
  it('waits until refresh_at, clamped to [1 s, 4 h]', () => {
    expect(spotlightDelay(new Date(NOW + 2 * HOUR).toISOString(), NOW)).toBe(2 * HOUR)
    expect(spotlightDelay(new Date(NOW + 10 * HOUR).toISOString(), NOW)).toBe(4 * HOUR)
    expect(spotlightDelay(new Date(NOW - HOUR).toISOString(), NOW)).toBe(1000)
  })

  it('falls back to the 4 hour rotation when refresh_at is missing or invalid', () => {
    expect(spotlightDelay(undefined, NOW)).toBe(SPOTLIGHT_MAX_DELAY_MS)
    expect(spotlightDelay('not a date', NOW)).toBe(SPOTLIGHT_MAX_DELAY_MS)
    expect(SPOTLIGHT_MAX_DELAY_MS).toBe(4 * HOUR)
  })
})

describe('useTvSpotlight (4 hour rotation)', () => {
  beforeEach(() => {
    list.mockReset()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => { vi.useRealTimers() })

  it('requests the torrent spotlight collection and shows its first title', async () => {
    list.mockResolvedValueOnce(page(1, new Date(NOW + 2 * HOUR).toISOString()))
    const { state } = mountSpotlight()
    await state().refreshHero()
    expect(list).toHaveBeenCalledWith({ kind: 'movie', collection: 'spotlight' }, expect.any(AbortSignal))
    expect(state().hero.value?.tmdb_id).toBe(1)
    expect(state().loading.value).toBe(false)
  })

  it('refreshes exactly at refresh_at', async () => {
    list.mockResolvedValueOnce(page(1, new Date(NOW + 2 * HOUR).toISOString()))
      .mockResolvedValueOnce(page(2, new Date(NOW + 6 * HOUR).toISOString()))
    const { state } = mountSpotlight()
    await state().refreshHero()

    vi.advanceTimersByTime(2 * HOUR - 1)
    await flush()
    expect(list).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await flush()
    expect(list).toHaveBeenCalledTimes(2)
    expect(state().hero.value?.tmdb_id).toBe(2)
  })

  it('never waits longer than 4 hours, even when refresh_at is far away or missing', async () => {
    list.mockResolvedValueOnce(page(1, new Date(NOW + 24 * HOUR).toISOString()))
      .mockResolvedValueOnce(page(2))
      .mockResolvedValueOnce(page(3))
    const { state } = mountSpotlight()
    await state().refreshHero()

    vi.advanceTimersByTime(4 * HOUR)
    await flush()
    expect(list).toHaveBeenCalledTimes(2)
    expect(state().hero.value?.tmdb_id).toBe(2)

    vi.advanceTimersByTime(4 * HOUR)
    await flush()
    expect(list).toHaveBeenCalledTimes(3)
    expect(state().hero.value?.tmdb_id).toBe(3)
  })

  it('keeps the current banner and retries in a minute when the request fails', async () => {
    list.mockResolvedValueOnce(page(1, new Date(NOW + HOUR).toISOString()))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(2, new Date(NOW + 5 * HOUR).toISOString()))
    const { state } = mountSpotlight()
    await state().refreshHero()

    vi.advanceTimersByTime(HOUR)
    await flush()
    expect(state().hero.value?.tmdb_id).toBe(1)
    expect(state().failed.value).toBe(true)

    vi.advanceTimersByTime(SPOTLIGHT_RETRY_DELAY_MS)
    await flush()
    expect(list).toHaveBeenCalledTimes(3)
    expect(state().hero.value?.tmdb_id).toBe(2)
    expect(state().failed.value).toBe(false)
  })

  it('stops the rotation timer when the screen is left', async () => {
    list.mockResolvedValue(page(1, new Date(NOW + HOUR).toISOString()))
    const { wrapper, state } = mountSpotlight()
    await state().refreshHero()
    wrapper.unmount()
    vi.advanceTimersByTime(8 * HOUR)
    await flush()
    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('TvSpotlightHero.vue', () => {
  it('shows backdrop, caption, title, year, ★ rating, genres, synopsis and the «Смотреть» button', async () => {
    const wrapper = mount(TvSpotlightHero, { props: { hero: item(7) as any, loading: false, focused: true } })
    expect(wrapper.get('img.tv-hero-backdrop').attributes('src')).toBe('https://img.example/7.jpg')
    expect(wrapper.get('[data-testid="tv-hero-label"]').text()).toBe('СЕГОДНЯ В ФОКУСЕ · Новая история каждые 4 часа')
    expect(wrapper.get('[data-testid="tv-hero-title"]').text()).toBe('Фильм 7')
    const meta = wrapper.get('[data-testid="tv-hero-meta"]').text()
    expect(meta).toContain('2024')
    expect(meta).toContain('★ 8.4')
    expect(meta).toContain('Драма')
    expect(meta).toContain('Триллер')
    expect(wrapper.text()).toContain('Синопсис')
    const watch = wrapper.get('[data-testid="tv-hero-watch"]')
    expect(watch.text()).toBe('Смотреть')
    expect(watch.attributes('data-tv-key')).toBe('hero:0')
    expect(watch.classes()).toContain('tv-focused')
    await watch.trigger('click')
    expect(wrapper.emitted('watch')).toHaveLength(1)
  })

  it('shows a loading line while the first banner is on its way', () => {
    const wrapper = mount(TvSpotlightHero, { props: { hero: null, loading: true, focused: false } })
    expect(wrapper.find('[data-testid="tv-hero-watch"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Загружаем')
  })
})
