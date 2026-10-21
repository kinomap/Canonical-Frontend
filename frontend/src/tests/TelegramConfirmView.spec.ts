import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import View from '@/views/TelegramConfirmView.vue'
import Confirmation from '@/components/TelegramReauthConfirmation.vue'
const m=vi.hoisted(()=>({postMessage:vi.fn(),setToken:vi.fn(),fetchCurrentUser:vi.fn(),push:vi.fn()}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>m}))
vi.mock('vue-router',()=>({useRouter:()=>({push:m.push})}))
let w:any
const response=(d:any,ok=true)=>({ok,json:async()=>d} as Response)
beforeEach(()=>{vi.clearAllMocks();location.hash='01234567-89ab-4cde-8123-0123456789ab';vi.stubGlobal('opener',{postMessage:m.postMessage});vi.stubGlobal('fetch',vi.fn(async()=>response({state:'fixture',url:'https://t.me/test?start=fixture',verification_code:'AB1234',expires_in:300})))})
afterEach(()=>{w?.unmount();vi.unstubAllGlobals();location.hash=''})
describe('Separate Telegram confirmation window',()=>{
 it('automatically starts a fresh challenge on opening, outside /login',async()=>{w=mount(View);await flushPromises();expect(fetch).toHaveBeenCalledWith('/api/v1/auth/social/telegram/deeplink/start',expect.anything());expect(w.text()).toContain('Ожидается ваше подтверждение');expect(m.postMessage).not.toHaveBeenCalled();expect(w.find('button').exists()).toBe(false)})
 it('notifies only the exact site origin with a correlation nonce and no token',async()=>{w=mount(View);await flushPromises();w.findComponent(Confirmation).vm.$emit('complete');await flushPromises();expect(m.postMessage).toHaveBeenCalledWith({event:'telegram-consent-complete',nonce:location.hash.slice(1)},location.origin);expect(m.setToken).not.toHaveBeenCalled()})
 it('keeps MFA inside the separate window and sends no completion before it passes',async()=>{w=mount(View);await flushPromises();w.findComponent(Confirmation).vm.$emit('challenge','mfa-fixture');await flushPromises();expect(w.text()).toContain('Подтверждение 2FA');expect(m.postMessage).not.toHaveBeenCalled();vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'cookie-session'}));await w.get('input').setValue('123456');await w.get('form').trigger('submit');await flushPromises();expect(m.postMessage).toHaveBeenCalledOnce();expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe('/api/v1/auth/mfa/complete')})
 it('does not complete when MFA fails',async()=>{w=mount(View);await flushPromises();w.findComponent(Confirmation).vm.$emit('challenge','mfa-fixture');await flushPromises();vi.mocked(fetch).mockResolvedValueOnce(response({detail:'Неверный код'},false));await w.get('input').setValue('123456');await w.get('form').trigger('submit');await flushPromises();expect(m.postMessage).not.toHaveBeenCalled();expect(w.text()).toContain('Неверный код')})
 it('does not start a challenge when opened directly without an opener',async()=>{vi.stubGlobal('opener',null);w=mount(View);await flushPromises();expect(fetch).not.toHaveBeenCalled();expect(w.text()).toContain('Откройте вход кнопкой')})
})
