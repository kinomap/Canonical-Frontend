import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TvConnectModal from '@/components/TvConnectModal.vue'
import { TV_DEVICE_LIMIT, MSX_START_PARAMETER, TV_ENTRY_PATH, MSX_PLATFORMS } from '@/lib/tvConnect'

function mountModal(show = true) {
  return mount(TvConnectModal, { props: { show }, global: { stubs: { teleport: true } } })
}

describe('TvConnectModal.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders nothing while closed', () => {
    const wrapper = mountModal(false)
    expect(wrapper.find('[data-testid="tv-connect-modal"]').exists()).toBe(false)
  })

  it('is an accessible dialog with a title', () => {
    const dialog = mountModal().get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.get('#tv-connect-title').text()).toContain('KINOSOTA')
  })

  it('states the device limit of 2 TV devices per account', () => {
    expect(TV_DEVICE_LIMIT).toBe(2)
    const badge = mountModal().get('[data-testid="tv-limit-badge"]')
    expect(badge.text()).toBe('До 2 ТВ-устройств на одну подписку / аккаунт')
  })

  it('explains step 1: install Media Station X on any TV platform and set the start parameter', () => {
    const step = mountModal().get('[data-testid="tv-step-msx"]')
    expect(step.text()).toContain('Media Station X')
    for (const platform of MSX_PLATFORMS) expect(step.text()).toContain(platform)
    expect(step.text()).toContain('Settings → Start Parameter')
    expect(step.get('[data-testid="tv-start-parameter"]').text()).toBe(MSX_START_PARAMETER)
    expect(MSX_START_PARAMETER).toBe('kinosota.devs.surf')
  })

  it('explains step 2: the «ВОЙТИ В KINOSOTA» button on the TV', () => {
    expect(mountModal().get('[data-testid="tv-step-login"]').text()).toContain('«ВОЙТИ В KINOSOTA»')
  })

  it('explains step 3: QR code and 6-digit PIN login without typing on the remote', () => {
    const text = mountModal().get('[data-testid="tv-step-qr"]').text()
    expect(text).toContain('QR-код')
    expect(text).toContain('6-значный PIN')
    expect(text).toContain('не нужно набирать логин и пароль с пульта')
  })

  it('links to the /tv test version in a new tab', () => {
    const link = mountModal().get('[data-testid="tv-open-browser"]')
    expect(TV_ENTRY_PATH).toBe('/tv')
    expect(link.attributes('href')).toBe('/tv')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toContain('Открыть ТВ-версию в браузере (для теста)')
  })

  it('emits close from the close button and from an overlay click', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="tv-connect-close"]').trigger('click')
    await wrapper.get('[data-testid="tv-connect-overlay"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('does not close when clicking inside the card', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="tv-step-msx"]').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('closes on Escape only while open and stops listening after unmount', async () => {
    const onClose = vi.fn()
    const wrapper = mount(TvConnectModal, { props: { show: true, onClose }, global: { stubs: { teleport: true } } })
    const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false })
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: true })
    wrapper.unmount()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('copies the MSX start parameter and shows a confirmation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = mountModal()
    const label = () => wrapper.get('[data-testid="tv-copy-parameter"]').text()
    expect(label()).toBe('Копировать')

    await wrapper.get('[data-testid="tv-copy-parameter"]').trigger('click')
    await Promise.resolve()
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('kinosota.devs.surf')
    expect(label()).toBe('Скопировано')

    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(label()).toBe('Копировать')
  })
})
