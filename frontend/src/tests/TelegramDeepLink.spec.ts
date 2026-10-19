import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import TelegramDeepLink from '@/components/TelegramDeepLink.vue'
const mocks=vi.hoisted(()=>({setToken:vi.fn(),fetchCurrentUser:vi.fn(),push:vi.fn()}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({...mocks,user:{value:{id:'synthetic'}}})}))
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}))
let wrappers:any[]=[]
const reply=(d:any,status=200)=>Promise.resolve(new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}}))
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn());vi.clearAllMocks();wrappers=[]})
afterEach(()=>{wrappers.forEach(w=>w.unmount());vi.useRealTimers();vi.unstubAllGlobals()})
describe('Telegram bot fallback',()=>{
 it('requires bot confirmation and an explicit browser completion click',async()=>{
  vi.mocked(fetch).mockImplementation((url:any)=>String(url).endsWith('/start')?reply({state:'x'.repeat(43),url:'https://t.me/test_bot?start=auth_synthetic',verification_code:'ABC123',expires_in:300}):String(url).endsWith('/poll')?reply({status:'confirmed',username:'synthetic'}):reply({access_token:'cookie-session'}))
  const w=mount(TelegramDeepLink);wrappers.push(w);expect(fetch).not.toHaveBeenCalled()
  await w.find('button').trigger('click');await flushPromises();expect(w.text()).toContain('ABC123');expect(w.find('a').attributes('rel')).toBe('noopener noreferrer')
  await vi.advanceTimersByTimeAsync(2000);await flushPromises();expect(w.text()).toContain('Войти как synthetic');expect(mocks.setToken).not.toHaveBeenCalled()
  await w.findAll('button').find(b=>b.text().startsWith('Войти как'))!.trigger('click');await flushPromises()
  expect(mocks.setToken).toHaveBeenCalledWith('cookie-session');expect(mocks.push).toHaveBeenCalledWith('/')
  expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as string)).toEqual({state:'x'.repeat(43)})
 })
 it('does not issue a session on a pending challenge and stops polling after unmount',async()=>{
  vi.mocked(fetch).mockImplementation((url:any)=>String(url).endsWith('/start')?reply({state:'x'.repeat(43),url:'https://t.me/test_bot',verification_code:'ABC123',expires_in:300}):reply({status:'pending'}))
  const w=mount(TelegramDeepLink);wrappers.push(w);await w.find('button').trigger('click');await flushPromises();await vi.advanceTimersByTimeAsync(2000)
  expect(w.text()).toContain('Ожидается');expect(mocks.setToken).not.toHaveBeenCalled();w.unmount();const count=vi.mocked(fetch).mock.calls.length;await vi.advanceTimersByTimeAsync(10000);expect(fetch).toHaveBeenCalledTimes(count)
 })
 it('shows backend failures without a fake success',async()=>{
  vi.mocked(fetch).mockImplementation(()=>reply({detail:'Telegram не настроен'},409))
  const w=mount(TelegramDeepLink);wrappers.push(w);await w.find('button').trigger('click');await flushPromises();expect(w.find('[role=alert]').text()).toContain('не настроен');expect(mocks.setToken).not.toHaveBeenCalled();expect(w.find('a').exists()).toBe(false)
 })
})
