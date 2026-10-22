import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {setLanguage} from '@/i18n'
import SocialLogin from '@/components/SocialLogin.vue'
const m=vi.hoisted(()=>({push:vi.fn(),fetchCurrentUser:vi.fn(),setToken:vi.fn()}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>m}))
vi.mock('vue-router',()=>({useRouter:()=>({push:m.push})}))
let w:any,callback:any,sdk:any
const response=(data:any,ok=true)=>({ok,json:async()=>data}) as Response
const user={id:12345,auth_date:123,hash:'fixture',first_name:'Fixture'}
const clean=()=>{expect(w.findAll('button')).toHaveLength(1);expect(w.get('button').text()).toBe('Войти через Telegram');expect(w.findAll('a')).toHaveLength(0);expect(w.text()).not.toMatch(/Сменить аккаунт|Аккаунт @|Подтвердить новый|Открыть бота/)}
async function click(){await w.get('button').trigger('click');await flushPromises()}
async function reply(u:any=user){callback(u);await flushPromises()}
beforeEach(async()=>{
 vi.clearAllMocks();localStorage.clear();sessionStorage.clear();setLanguage('ru');m.fetchCurrentUser.mockResolvedValue({id:'fixture'})
 sdk=vi.fn((_:any,cb:any)=>{callback=cb});window.Telegram={Login:{auth:sdk}}
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.endsWith('/providers')?{providers:{telegram:true},telegram_bot_id:'123'}:url.endsWith('/start')?{state:'fixture-state',bot_id:'123'}:{access_token:'cookie-session'})))
 w=mount(SocialLogin);await flushPromises()
})
afterEach(()=>{w.unmount();vi.unstubAllGlobals();delete window.Telegram;vi.restoreAllMocks();vi.useRealTimers()})
describe('One native Telegram Login.auth button',()=>{
 it('loads public configuration but does not open Telegram until clicked',()=>{clean();expect(sdk).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1)})
 it('always calls the official SDK from the button and never bot endpoints',async()=>{await click();expect(sdk).toHaveBeenCalledWith({bot_id:'123',request_access:'write'},expect.any(Function));await reply();expect(m.fetchCurrentUser).toHaveBeenCalled();expect(m.push).toHaveBeenCalledWith('/');expect(vi.mocked(fetch).mock.calls.some(c=>String(c[0]).includes('deeplink'))).toBe(false);clean()})
 it('ignores and cleans all historical unlink flags',async()=>{localStorage.setItem('tg_just_unlinked','true');localStorage.setItem('tg_unlinked_username','AccountA');localStorage.setItem('telegram_require_confirmation','true');sessionStorage.setItem('telegram_auth','obsolete');w.unmount();w=mount(SocialLogin);await flushPromises();await click();expect(sdk).toHaveBeenCalledTimes(1);expect(localStorage.getItem('tg_just_unlinked')).toBeNull();expect(sessionStorage.getItem('telegram_auth')).toBeNull();clean()})
 it('passes the signed SDK payload with CSRF flow state to backend',async()=>{await click();await reply();const c=vi.mocked(fetch).mock.calls.find(c=>String(c[0]).endsWith('/complete'))!;expect(JSON.parse(String(c[1]?.body))).toEqual({state:'fixture-state',user});expect(c[1]?.headers).toEqual({'Content-Type':'application/json','X-Session-Mode':'cookie'})})
 it('does not sign in when Telegram is cancelled',async()=>{await click();await reply(false);expect(m.setToken).not.toHaveBeenCalled();expect(vi.mocked(fetch).mock.calls.some(c=>String(c[0]).endsWith('/complete'))).toBe(false);expect(w.text()).toContain('Вход отменён');clean()})
 it('permits another native attempt after cancellation and ignores late old callbacks',async()=>{await click();const old=callback;await reply(false);await click();old(user);await flushPromises();expect(m.push).not.toHaveBeenCalled();await reply();expect(m.push).toHaveBeenCalledWith('/');expect(sdk).toHaveBeenCalledTimes(2)})
 it('never bypasses site MFA',async()=>{await click();vi.mocked(fetch).mockResolvedValueOnce(response({detail:{code:'MFA_REQUIRED',challenge:'mfa-fixture'}},false));await reply();expect(w.emitted('challenge')).toEqual([['mfa-fixture']]);expect(m.setToken).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();clean()})
 it('does not trust a success response without a current authenticated user',async()=>{m.fetchCurrentUser.mockResolvedValueOnce(null);await click();await reply();expect(m.setToken).toHaveBeenLastCalledWith(null);expect(m.push).not.toHaveBeenCalled();expect(w.text()).toContain('Вход не подтверждён')})
 it('shows backend errors without adding another action or redirecting to bot',async()=>{await click();vi.mocked(fetch).mockResolvedValueOnce(response({detail:'Подпись не подтверждена'},false));await reply();expect(w.text()).toContain('Подпись не подтверждена');expect(m.setToken).not.toHaveBeenCalled();clean()})
 it('does not resurrect a bot flow even if a stale server returns the retired 409',async()=>{await click();vi.mocked(fetch).mockResolvedValueOnce(response({detail:{require_fresh_reauth:true}},false));await reply();expect(m.setToken).not.toHaveBeenCalled();expect(sdk).toHaveBeenCalledTimes(1);clean()})
 it('handles flow setup failure without posting a signed assertion',async()=>{vi.mocked(fetch).mockResolvedValueOnce(response({detail:'Start unavailable'},false));await click();await reply();expect(w.text()).toContain('Start unavailable');expect(m.push).not.toHaveBeenCalled()})
 it('ignores callback after unmount',async()=>{await click();w.unmount();await reply();expect(m.setToken).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled()})
 it('prevents duplicate clicks and duplicate SDK completions',async()=>{await click();await click();expect(sdk).toHaveBeenCalledTimes(1);callback(user);callback(user);await flushPromises();expect(vi.mocked(fetch).mock.calls.filter(c=>String(c[0]).endsWith('/complete'))).toHaveLength(1)})
 it('handles synchronous SDK failure without bot fallback',async()=>{sdk.mockImplementationOnce(()=>{throw new Error('Popup blocked')});await click();expect(w.text()).toContain('Popup blocked');expect(m.setToken).not.toHaveBeenCalled();clean()})
})

it('expires an SDK attempt without a callback and ignores its late result',async()=>{vi.useFakeTimers();await click();await vi.advanceTimersByTimeAsync(300001);expect(w.get('button').attributes('disabled')).toBeUndefined();expect(w.text()).toContain('Время входа истекло');await reply();expect(m.setToken).not.toHaveBeenCalled();clean()})
it('opens SDK before the asynchronous state setup resolves',async()=>{let resolve:any;vi.mocked(fetch).mockReturnValueOnce(new Promise(r=>{resolve=r}));await click();expect(sdk).toHaveBeenCalledTimes(1);expect(m.setToken).not.toHaveBeenCalled();resolve(response({state:'deferred-state'}));await reply();expect(m.push).toHaveBeenCalledWith('/')})
