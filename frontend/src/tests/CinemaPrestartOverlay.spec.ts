import { DOMWrapper, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CinemaPrestartOverlay from '@/components/CinemaPrestartOverlay.vue'
import { showCinemaPrestart, useCinemaPrestart } from '@/composables/useCinemaPrestart'

describe('CinemaPrestartOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('renders immediately and changes to the preparation status after two seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: true }, attachTo: document.body })
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Фильм уже запускается, подождите немного…')

    await vi.advanceTimersByTimeAsync(2100)
    expect(document.body.textContent).toContain('Подготовка видеопотока…')
    wrapper.unmount()
  })

  it('plays the prepared KINOSOTA intro instead of the old SVG reels', () => {
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: true }, attachTo: document.body })
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('svg')).toBeNull()
    expect(dialog.querySelector('.reel, .spokes, .holes')).toBeNull()
    const intro = dialog.querySelector('[data-testid="cinema-intro"] video') as HTMLVideoElement
    expect(intro).not.toBeNull()
    expect(intro.getAttribute('poster')).toBe('/cinema/intro/kinosota-intro-v1.jpg') // First frame on the first paint.
    expect(intro.hasAttribute('playsinline')).toBe(true)
    expect([...intro.querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual([
      '/cinema/intro/kinosota-intro-v1.webm', '/cinema/intro/kinosota-intro-v1.mp4'])
    expect(dialog.textContent).not.toContain('KINOSOTA PLAYER') // No intermediate emblem over the intro.
    expect((dialog as HTMLElement).style.getPropertyValue('--cinema-dissolve')).toBe('900ms')
    wrapper.unmount()
  })

  it('toggles compact mode and emits cancellation', async () => {
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: true }, attachTo: document.body })
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()

    const toggleBtn = new DOMWrapper(document.body.querySelector('[aria-label="Уменьшить окно"]')!)
    await toggleBtn.trigger('click')
    expect(dialog?.classList.contains('is-compact')).toBe(true)

    const cancelBtn = new DOMWrapper(document.body.querySelector('[aria-label="Отменить запуск"]')!)
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('hides the overlay when the tab becomes hidden (navigated away), without aborting the launch', async () => {
    vi.useFakeTimers()
    const cancelSpy = vi.fn()
    showCinemaPrestart(cancelSpy)
    const state = useCinemaPrestart()
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: state.visible }, attachTo: document.body })
    expect(state.visible).toBe(true)

    // Simulate the tab being hidden (user navigated away or minimised the browser).
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10)
    expect(state.visible).toBe(false)
    // The launch signal must NOT be aborted — only the overlay is dismissed.
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('cancel')).toBeUndefined()

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    wrapper.unmount()
  })

  it('does NOT hide the overlay on window blur (desktop player opening takes focus)', async () => {
    vi.useFakeTimers()
    const cancelSpy = vi.fn()
    showCinemaPrestart(cancelSpy)
    const state = useCinemaPrestart()
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: state.visible }, attachTo: document.body })
    expect(state.visible).toBe(true)

    // Blur happens when the kinosota:// link opens the desktop player — overlay must stay.
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(500)
    expect(state.visible).toBe(true)
    expect(cancelSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
