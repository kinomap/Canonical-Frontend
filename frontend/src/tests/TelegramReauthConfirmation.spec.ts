import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import Component from '@/components/TelegramReauthConfirmation.vue'
const m=vi.hoisted(()=>({setToken:vi.fn(),fetchCurrentUser:vi.fn(),push:vi.fn()}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>m}))
vi.mock('vue-router',()=>({useRouter:()=>({push:m.push})}))
let w:any
const response=(data:any,ok=true)=>({ok,json:async()=>data} as Response)
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();localStorage.clear();vi.stubGlobal('fetch',vi.fn());w=mount(Component)})
afterEach(()=>{w.unmount();vi.useRealTimers();vi.unstubAllGlobals()})
async function start(expires_in=300){vi.mocked(fetch).mockResolvedValueOnce(response({state:'fixture',url:'https://t.me/test?start=fixture',verification_code:'AB1234',expires_in}));await w.vm.start();await flushPromises()}
async function confirmed(){await start();vi.mocked(fetch).mockResolvedValueOnce(response({status:'confirmed',username:'AccountB'}));await vi.advanceTimersByTimeAsync(1500);await flushPromises()}
describe('Explicit Telegram consent',()=>{
 it('never completes a pending challenge automatically',async()=>{await start();vi.mocked(fetch).mockResolvedValueOnce(response({status:'pending'}));await vi.advanceTimersByTimeAsync(1500);expect(w.find('button').exists()).toBe(false);expect(m.setToken).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(2)})
 it('requires an explicit final action after confirmation and clears unlink flags on success',async()=>{localStorage.setItem('tg_just_unlinked','true');await confirmed();expect(w.get('button').text()).toContain('AccountB');expect(m.setToken).not.toHaveBeenCalled();vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'cookie-session'}));await w.get('button').trigger('click');await flushPromises();expect(m.setToken).toHaveBeenCalledWith('cookie-session');expect(m.push).toHaveBeenCalledWith('/');expect(localStorage.getItem('tg_just_unlinked')).toBeNull();expect(w.emitted('submitting')).toEqual([[true],[false]])})
 it('preserves MFA and does not issue a local session',async()=>{localStorage.setItem('tg_just_unlinked','true');await confirmed();vi.mocked(fetch).mockResolvedValueOnce(response({detail:{code:'MFA_REQUIRED',challenge:'mfa-fixture'}},false));await w.get('button').trigger('click');await flushPromises();expect(w.emitted('challenge')).toEqual([['mfa-fixture']]);expect(m.setToken).not.toHaveBeenCalled();expect(localStorage.getItem('tg_just_unlinked')).toBe('true')})
 it('expires without completing a challenge',async()=>{await start(1);await vi.advanceTimersByTimeAsync(1500);expect(w.text()).toContain('Запрос истёк');expect(w.find('a').exists()).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);expect(m.setToken).not.toHaveBeenCalled()})
 it('ignores late poll responses after cancellation',async()=>{await start();let resolve:any;vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>resolve=r));await vi.advanceTimersByTimeAsync(1500);w.vm.cancel();resolve(response({status:'confirmed',username:'OldAccount'}));await flushPromises();expect(w.find('button').exists()).toBe(false);expect(m.setToken).not.toHaveBeenCalled()})
})
