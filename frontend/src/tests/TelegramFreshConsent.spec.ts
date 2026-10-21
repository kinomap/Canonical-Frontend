import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {setLanguage} from '@/i18n'
import TelegramDeepLink from '@/components/TelegramDeepLink.vue'
const mocks=vi.hoisted(()=>({setToken:vi.fn(),fetchCurrentUser:vi.fn(async()=>({id:'B'})),push:vi.fn(),user:{value:{id:'B'}}}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>mocks}))
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}))
let wrapper:any
const ok=(data:any)=>({ok:true,json:async()=>data})
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();setLanguage('ru');vi.stubGlobal('fetch',vi.fn(async()=>ok({state:'S'.repeat(43),url:'https://t.me/fixture_bot?start=auth_fixture',verification_code:'ABC123',expires_in:300})))})
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.unstubAllGlobals()})
async function start(){wrapper=mount(TelegramDeepLink);await wrapper.get('button').trigger('click');await flushPromises()}
async function confirm(){vi.mocked(fetch).mockResolvedValueOnce(ok({status:'confirmed',username:'AccountB'}) as any);await vi.advanceTimersByTimeAsync(2000);await flushPromises()}
describe('Fresh Telegram consent',()=>{
 it('never logs in simply by opening the bot link',async()=>{await start();expect(wrapper.get('a').attributes('href')).toContain('https://t.me/');expect(wrapper.text()).toContain('ABC123');expect(wrapper.text()).not.toContain('Войти как');expect(mocks.setToken).not.toHaveBeenCalled()})
 it('shows account B and requires the final explicit click',async()=>{await start();await confirm();expect(wrapper.text()).toContain('Войти как AccountB');expect(mocks.setToken).not.toHaveBeenCalled();localStorage.setItem('telegram_require_confirmation','1');vi.mocked(fetch).mockResolvedValueOnce(ok({access_token:'cookie-session'}) as any);await wrapper.findAll('button')[1].trigger('click');await flushPromises();expect(mocks.setToken).toHaveBeenCalledWith('cookie-session');expect(mocks.push).toHaveBeenCalledWith('/');expect(localStorage.getItem('telegram_require_confirmation')).toBeNull()})
 it('forwards MFA challenges without granting a session',async()=>{await start();await confirm();vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({detail:{code:'MFA_REQUIRED',challenge:'mfa-B'}})} as any);await wrapper.findAll('button')[1].trigger('click');await flushPromises();expect(wrapper.emitted('challenge')).toEqual([['mfa-B']]);expect(mocks.setToken).not.toHaveBeenCalled()})
 it('clears confirmed identity when the user restarts to select another account',async()=>{await start();await confirm();expect(wrapper.text()).toContain('AccountB');await wrapper.findAll('button')[0].trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('AccountB');expect(wrapper.text()).not.toContain('Войти как');expect(mocks.setToken).not.toHaveBeenCalled()})
})
