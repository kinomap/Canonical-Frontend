import { afterEach, describe, expect, it } from 'vitest'
import { installPasswordVisibility } from '../../../design-system/password-visibility.js'
let dispose: (() => void) | undefined
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { dispose?.(); dispose = undefined; document.body.innerHTML = '' })
function setup() {
 document.body.innerHTML = '<form><label>Password<input name="password" type="password" value="test-only-value" autocomplete="current-password"></label><label>Confirm<input name="confirm" type="password"></label><input name="otp" inputmode="numeric"></form>'
 dispose = installPasswordVisibility()
 return { input: document.querySelector('input')!, button: document.querySelector<HTMLButtonElement>('.pw-reveal-toggle')!, form: document.querySelector('form')! }
}
describe('shared password reveal', () => {
 it('is hidden by default, independently toggles, preserves value and selection/copy', () => {
  const { input, button } = setup()
  expect(input.type).toBe('password'); expect(button.getAttribute('role')).toBe('checkbox')
  button.click(); expect(input.type).toBe('text'); expect(button.getAttribute('aria-checked')).toBe('true')
  input.select(); expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length)
  expect(input.value).toBe('test-only-value')
  expect(document.querySelector<HTMLInputElement>('[name=confirm]')!.type).toBe('password')
  button.click(); expect(input.type).toBe('password')
 })
 it('never submits, modifies values, fires input/change, or pollutes FormData', () => {
  const { input, button, form } = setup(); let events = 0
  for (const type of ['submit', 'input', 'change']) form.addEventListener(type, e => { events++; e.preventDefault() })
  const before = [...new FormData(form).entries()]; button.click(); button.click()
  expect(events).toBe(0); expect([...new FormData(form).entries()]).toEqual(before)
  expect(input.autocomplete).toBe('current-password'); expect(button.type).toBe('button')
 })
 it('handles dynamic modals/removal without duplicates or orphan controls', async () => {
  setup(); expect(document.querySelectorAll('.pw-reveal-toggle')).toHaveLength(2)
  const label = document.createElement('label'); label.innerHTML = 'SSH passphrase<input type="password">'; document.body.append(label)
  await flush(); expect(label.querySelectorAll('.pw-reveal-toggle')).toHaveLength(1)
  label.querySelector('input')!.remove(); await flush(); expect(label.querySelector('.pw-reveal-toggle')).toBeNull()
  installPasswordVisibility(); expect(document.querySelectorAll('.pw-reveal-toggle')).toHaveLength(2)
 })
 it('conceals on reset and pagehide, preserves OTP fields', () => {
  const { input, button, form } = setup(); button.click(); form.reset(); expect(input.type).toBe('password')
  button.click(); window.dispatchEvent(new Event('pagehide')); expect(input.type).toBe('password')
  expect(document.querySelectorAll('.pw-reveal-toggle')).toHaveLength(2)
  expect(document.querySelector('[name=otp]')!.nextElementSibling).toBeNull()
 })
 it('tracks disabled fields, conceals on tab hiding and cleans up', async () => {
  const { input, button } = setup(); input.disabled = true; await flush(); expect(button.disabled).toBe(true)
  input.disabled = false; await flush(); button.click()
  Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'))
  expect(input.type).toBe('password'); delete (document as unknown as { hidden?: boolean }).hidden
  dispose?.(); dispose = undefined; expect(document.querySelector('.pw-reveal-toggle')).toBeNull()
 })
})
