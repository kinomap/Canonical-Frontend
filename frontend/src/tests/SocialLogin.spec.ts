import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {setLanguage} from '@/i18n'
import SocialLogin from '@/components/SocialLogin.vue'
const mocks=vi.hoisted(()=>({setToken:vi.fn(),fetchCurrentUser:vi.fn(),push:vi.fn(),user:{value:null as any}}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>mocks}))
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}))
let wrappers:any[]=[];let callback:any
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();setLanguage('ru');wrappers=[];callback=null;vi.stubGlobal('Telegram',{Login:{auth:vi.fn((_o:any,cb:any)=>callback=cb)}});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({state:'fixture',bot_id:'123'})})))})
afterEach(()=>{wrappers.forEach(w=>w.unmount());vi.unstubAllGlobals()})
async function render(){const w=mount(SocialLogin);wrappers.push(w);await flushPromises();return w}
describe('Custom rectangular Telegram login',()=>{
 it('has one own button, no iframe or widget attributes',async()=>{const w=await render();expect(w.findAll('button')).toHaveLength(2);expect(w.find('iframe').exists()).toBe(false);expect(document.querySelector('[data-telegram-login]')).toBeNull();expect(fetch).toHaveBeenCalledTimes(1)})
 it('opens SDK popup from user click and routes home after authentication',async()=>{const w=await render();await w.get('button:not(.switch-account)').trigger('click');expect((window as any).Telegram.Login.auth).toHaveBeenCalledWith({bot_id:123,request_access:'write'},expect.any(Function));vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({access_token:'cookie-session'})} as any);await callback({id:123,hash:'fixture'});expect(mocks.fetchCurrentUser).toHaveBeenCalled();expect(mocks.push).toHaveBeenCalledWith('/')})
 it('emits MFA challenge instead of granting a session',async()=>{const w=await render();await w.get('button:not(.switch-account)').trigger('click');vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({detail:{code:'MFA_REQUIRED',challenge:'fixture-mfa'}})} as any);await callback({id:123});expect(w.emitted('challenge')).toEqual([['fixture-mfa']]);expect(mocks.setToken).not.toHaveBeenCalled()})
 it('shows unavailable provider error without injecting a widget',async()=>{vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({detail:'Telegram unavailable'})} as any);const w=await render();expect(w.get('[role=alert]').text()).toContain('Telegram unavailable');expect(w.find('iframe').exists()).toBe(false)})
 it('does not process popup callbacks after unmount',async()=>{const w=await render();await w.get('button:not(.switch-account)').trigger('click');w.unmount();await callback({id:123});expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.setToken).not.toHaveBeenCalled()})
 it('does not inject scripts after navigation during preparation',async()=>{let resolve:any;vi.mocked(fetch).mockReturnValue(new Promise(r=>resolve=r) as any);const w=mount(SocialLogin);w.unmount();resolve({ok:true,json:async()=>({state:'late',bot_id:123})});await flushPromises();expect(document.querySelector('script[src*="telegram-widget"]')).toBeNull()})
})

describe('Explicit Telegram account selection',()=>{
 it('offers a different account without calling the cached widget',async()=>{const w=await render();await w.get('.switch-account').trigger('click');expect(w.findComponent({name:'TelegramDeepLink'}).exists()).toBe(true);expect((window as any).Telegram.Login.auth).not.toHaveBeenCalled();expect(w.text()).toContain('Выберите нужный аккаунт')})
 it('requires fresh confirmation immediately after unlink even after reload',async()=>{localStorage.setItem('telegram_require_confirmation','1');const w=await render();expect(fetch).not.toHaveBeenCalled();expect(w.find('.switch-account').exists()).toBe(false);expect(w.text()).toContain('Старое разрешение виджета не используется')})
 it('uses explicit confirmation when the server rejects an unlinked widget identity',async()=>{const w=await render();await w.get('button:not(.switch-account)').trigger('click');vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({detail:{code:'TELEGRAM_CONFIRMATION_REQUIRED'}})} as any);await callback({id:123});await flushPromises();expect(mocks.setToken).not.toHaveBeenCalled();expect(mocks.push).not.toHaveBeenCalled();expect(w.text()).toContain('Выберите нужный аккаунт')})
 it('ignores a late widget callback after choosing another account',async()=>{const w=await render();await w.get('button:not(.switch-account)').trigger('click');await w.get('.switch-account').trigger('click');await callback({id:123});expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.setToken).not.toHaveBeenCalled()})
})
