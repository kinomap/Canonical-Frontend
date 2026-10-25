import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import MainCatalogView from '@/views/MainCatalogView.vue'
import { apiClient } from '@/api/client'

vi.mock('@/api/client', () => ({ apiClient: { getHomeCollections: vi.fn(), checkLatest: vi.fn() } }))
const home = (title: string) => ({ newest: [{ id: 'movie', title }], popular: [], top_rated: [], by_year: [], by_genre: [], hero: null })
const latest = (total = 1, timestamp = '2026-01-01') => ({ total, latest_created_at: timestamp })
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r }); return { promise, resolve } }
let wrapper: ReturnType<typeof mount> | undefined
let mountedRails = 0
const Rail = defineComponent({ props: ['movies'], setup(props) { mountedRails++; return () => h('div', { class: 'test-rail' }, props.movies.map((m: any) => m.title).join(',')) } })
async function open() { wrapper = mount(MainCatalogView, { global: { stubs: { MovieRail: Rail } } }); await flushPromises(); return wrapper }
async function tick() { await vi.advanceTimersByTimeAsync(60_000); await flushPromises() }
function visible(hidden: boolean) { Object.defineProperty(document, 'hidden', { configurable: true, value: hidden }); document.dispatchEvent(new Event('visibilitychange')) }

beforeEach(() => {
 vi.useFakeTimers(); vi.resetAllMocks(); mountedRails = 0
 Object.defineProperty(document, 'hidden', { configurable: true, value: false })
 vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
 vi.mocked(apiClient.checkLatest).mockResolvedValue(latest())
 vi.mocked(apiClient.getHomeCollections).mockResolvedValue(home('Original') as any)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.restoreAllMocks() })

describe('quiet automatic home catalog updates', () => {
 it('adds movies without notification, confirmation, skeleton, rail remount or scrolling', async () => {
  const w = await open(); const rail = w.find('.test-rail').element
  vi.mocked(apiClient.checkLatest).mockResolvedValue(latest(2, '2026-01-02'))
  const pending = deferred(); vi.mocked(apiClient.getHomeCollections).mockReturnValueOnce(pending.promise)
  await tick(); expect(w.text()).toContain('Original'); expect(w.find('.home-loading').exists()).toBe(false)
  pending.resolve(home('Original + New movie')); await flushPromises()
  expect(w.text()).toContain('New movie'); expect(w.find('.new-movie-banner').exists()).toBe(false)
  expect(w.find('[role="alert"]').exists()).toBe(false); expect(w.text()).not.toMatch(/Добавлен|Показать|Show/)
  expect(w.find('.test-rail').element).toBe(rail); expect(mountedRails).toBe(1); expect(window.scrollTo).not.toHaveBeenCalled()
  expect(apiClient.getHomeCollections).toHaveBeenLastCalledWith(true)
 })
 it('does not reload unchanged collections and remembers successfully applied changes', async () => {
  await open(); await tick(); expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(1)
  vi.mocked(apiClient.checkLatest).mockResolvedValue(latest(2)); await tick(); await tick()
  expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(2)
 })
 it('refreshes timestamp changes even if total stays unchanged', async () => {
  await open(); vi.mocked(apiClient.checkLatest).mockResolvedValue(latest(1, '2026-01-03')); await tick()
  expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(2)
 })
 it('keeps existing movies on background failure and retries the same version quietly', async () => {
  const w = await open(); vi.mocked(apiClient.checkLatest).mockResolvedValue(latest(2))
  vi.mocked(apiClient.getHomeCollections).mockRejectedValueOnce(new Error('network'))
  await tick(); expect(w.text()).toContain('Original'); expect(w.find('.error-panel').exists()).toBe(false)
  vi.mocked(apiClient.getHomeCollections).mockResolvedValue(home('Recovered') as any)
  await tick(); expect(w.text()).toContain('Recovered'); expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(3)
 })
 it('pauses while hidden and refreshes silently on return', async () => {
  await open(); visible(true); await tick(); expect(apiClient.checkLatest).toHaveBeenCalledTimes(1)
  vi.mocked(apiClient.checkLatest).mockResolvedValue(latest(2)); visible(false); await flushPromises()
  expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(2)
 })
 it('coalesces overlapping visibility events and timer ticks into one request', async () => {
  await open(); const pending = deferred(); vi.mocked(apiClient.checkLatest).mockReturnValueOnce(pending.promise)
  visible(false); visible(false); await tick(); expect(apiClient.checkLatest).toHaveBeenCalledTimes(2)
  pending.resolve(latest(2)); await flushPromises(); expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(2)
 })
 it('does not delay initial catalog rendering on a slow latest-check', async () => {
  const pending = deferred(); vi.mocked(apiClient.checkLatest).mockReturnValueOnce(pending.promise)
  const w = await open(); expect(w.text()).toContain('Original'); expect(w.find('.home-loading').exists()).toBe(false)
  w.unmount(); pending.resolve(latest()); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
 })
 it('disposes timers and ignores late check results after navigating away', async () => {
  await open(); const pending = deferred(); vi.mocked(apiClient.checkLatest).mockReturnValueOnce(pending.promise)
  visible(false); wrapper!.unmount(); pending.resolve(latest(2)); await flushPromises(); await tick()
  expect(apiClient.getHomeCollections).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
 })
})
