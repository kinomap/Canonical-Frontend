import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import KSelect from '@/components/KSelect.vue'

const options = [
  { value: 1, label: '1 серия', hint: '1,4 ГБ' },
  { value: 2, label: '2 серия', hint: 'нет раздачи', disabled: true },
  { value: 3, label: '3 серия' },
  { value: 4, label: '4 серия' },
]
const mounted: VueWrapper[] = []
function make(props: Record<string, unknown> = {}) {
  const w = mount(KSelect, { props: { modelValue: 1, options, label: 'Серия', ...props }, attachTo: document.body })
  mounted.push(w)
  return w
}
const trigger = (w: VueWrapper) => w.find('[role="combobox"]')
const active = (w: VueWrapper) => w.find('[role="option"].active').find('.kselect-label').text()
afterEach(() => { while (mounted.length) mounted.pop()!.unmount() })

describe('KSelect', () => {
  it('is a labelled combobox showing the current option and opening a listbox', async () => {
    const w = make()
    expect(trigger(w).attributes('aria-label')).toBe('Серия')
    expect(trigger(w).attributes('aria-haspopup')).toBe('listbox')
    expect(trigger(w).text()).toBe('1 серия')
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await trigger(w).trigger('click')
    const list = w.find('[role="listbox"]')
    expect(trigger(w).attributes('aria-expanded')).toBe('true')
    expect(trigger(w).attributes('aria-controls')).toBe(list.attributes('id'))
    expect(trigger(w).attributes('aria-activedescendant')).toBe(w.findAll('[role="option"]')[0].attributes('id'))
    expect(w.findAll('[role="option"]').map((o) => o.text())).toEqual(['1 серия1,4 ГБ', '2 сериянет раздачи', '3 серия', '4 серия'])
    expect(w.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true')
    expect(w.findAll('[role="option"]')[0].find('.kselect-check').exists()).toBe(true)
    expect(w.findAll('[role="option"]')[1].attributes('aria-disabled')).toBe('true')
  })

  it('moves over disabled options with the arrows, Home and End and picks with Enter or Space', async () => {
    const w = make()
    await trigger(w).trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('[role="listbox"]').exists()).toBe(true)
    expect(active(w)).toBe('1 серия')
    await trigger(w).trigger('keydown', { key: 'ArrowDown' })
    expect(active(w)).toBe('3 серия')
    await trigger(w).trigger('keydown', { key: 'End' })
    expect(active(w)).toBe('4 серия')
    await trigger(w).trigger('keydown', { key: 'ArrowDown' })
    expect(active(w)).toBe('4 серия')
    await trigger(w).trigger('keydown', { key: 'Home' })
    expect(active(w)).toBe('1 серия')
    await trigger(w).trigger('keydown', { key: 'End' })
    await trigger(w).trigger('keydown', { key: 'ArrowUp' })
    expect(active(w)).toBe('3 серия')
    await trigger(w).trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toEqual([[3]])
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await w.setProps({ modelValue: 3 })
    expect(trigger(w).text()).toBe('3 серия')
    await trigger(w).trigger('keydown', { key: ' ' })
    await trigger(w).trigger('keydown', { key: 'ArrowDown' })
    await trigger(w).trigger('keydown', { key: ' ' })
    expect(w.emitted('update:modelValue')).toEqual([[3], [4]])
  })

  it('does not emit for the current or a disabled option and closes on Escape, Tab and outside clicks', async () => {
    const w = make()
    await trigger(w).trigger('click')
    await w.findAll('[role="option"]')[1].trigger('click')
    expect(w.find('[role="listbox"]').exists()).toBe(true)
    await w.findAll('[role="option"]')[0].trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await trigger(w).trigger('click')
    await trigger(w).trigger('keydown', { key: 'Escape' })
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger(w).element)
    await trigger(w).trigger('click')
    await trigger(w).trigger('keydown', { key: 'Tab' })
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await trigger(w).trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await trigger(w).trigger('click')
    await w.findAll('[role="option"]')[3].trigger('mousemove')
    expect(active(w)).toBe('4 серия')
    await w.findAll('[role="option"]')[1].trigger('mousemove')
    expect(active(w)).toBe('4 серия')
    await w.findAll('[role="option"]')[3].trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[4]])
  })

  it('shows the placeholder, stays closed when disabled or empty', async () => {
    const w = make({ modelValue: null, placeholder: 'Серия' })
    expect(trigger(w).text()).toBe('Серия')
    await w.setProps({ disabled: true })
    expect(trigger(w).attributes('disabled')).toBeDefined()
    await trigger(w).trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    const empty = make({ options: [] })
    await trigger(empty).trigger('click')
    expect(empty.find('[role="listbox"]').exists()).toBe(false)
  })
})
