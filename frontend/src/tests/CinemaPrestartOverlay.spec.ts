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

  it('softly hides the overlay on window blur without aborting the launch signal', async () => {
    vi.useFakeTimers()
    const cancelSpy = vi.fn()
    showCinemaPrestart(cancelSpy)
    const state = useCinemaPrestart()
    const wrapper = mount(CinemaPrestartOverlay, { props: { show: state.visible }, attachTo: document.body })
    expect(state.visible).toBe(true)

    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(200)
    expect(state.visible).toBe(false)
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('cancel')).toBeUndefined()
    wrapper.unmount()
  })
})
