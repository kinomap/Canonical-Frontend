import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'
import SocialLogin from '@/components/SocialLogin.vue'
import {setLanguage} from '@/i18n'
const m=vi.hoisted(()=>({push:vi.fn(),setToken:vi.fn(),fetchCurrentUser:vi.fn()}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>m}))
vi.mock('vue-router',()=>({useRouter:()=>({push:m.push}),useRoute:()=>({query:{}})}))
let w:any
beforeEach(()=>{vi.clearAllMocks();setLanguage('ru');m.fetchCurrentUser.mockResolvedValue({id:'fixture'});w=mount(LoginView,{global:{stubs:{SocialLogin:true}}})})
afterEach(()=>{w.unmount();vi.unstubAllGlobals()})
describe('Clean login and second-step site MFA',()=>{
 it('has only the native Telegram component, no password form or auxiliary buttons',()=>{expect(w.findAll('input')).toHaveLength(0);expect(w.findAll('button')).toHaveLength(0);expect(w.findAll('a')).toHaveLength(0);expect(w.findComponent(SocialLogin).exists()).toBe(true);expect(w.text()).not.toContain('был отвязан')})
 it('replaces native login with MFA and sends six digits to MFA completion only',async()=>{
  w.findComponent(SocialLogin).vm.$emit('challenge','fixture-mfa');await flushPromises();expect(w.find('input[type=password]').exists()).toBe(false);expect(w.findComponent(SocialLogin).exists()).toBe(false)
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({access_token:'cookie-session'})})))
  await w.get('input[autocomplete=one-time-code]').setValue('123456');await w.get('form').trigger('submit.prevent');await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/v1/auth/mfa/complete',expect.objectContaining({headers:expect.objectContaining({'X-TOTP-Code':'123456'}),body:JSON.stringify({challenge:'fixture-mfa'})}));expect(m.push).toHaveBeenCalledWith('/')
 })
 it('never creates a session for rejected MFA',async()=>{
  w.findComponent(SocialLogin).vm.$emit('challenge','fixture-mfa');await flushPromises();vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({detail:'Неверный код'})})))
  await w.get('input[autocomplete=one-time-code]').setValue('000000');await w.get('form').trigger('submit.prevent');await flushPromises();expect(m.setToken).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();expect(w.find('.auth-error-alert').exists()).toBe(true);expect(w.find('input[autocomplete=one-time-code]').exists()).toBe(true)
 })
})
