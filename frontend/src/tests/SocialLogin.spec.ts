import {t} from '../i18n'
import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import SocialLogin from '@/components/SocialLogin.vue'
const mocks=vi.hoisted(()=>({setToken:vi.fn(),fetchCurrentUser:vi.fn(),push:vi.fn(),user:{value:null as any}}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>mocks}))
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}))
let wrappers:any[]=[]
beforeEach(()=>{vi.clearAllMocks();mocks.user.value=null;vi.stubGlobal('fetch',vi.fn());wrappers=[]})
afterEach(()=>{wrappers.forEach(w=>w.unmount());vi.unstubAllGlobals()})
const reply=(d:any,ok=true)=>Promise.resolve(new Response(JSON.stringify(d),{status:ok?200:503,headers:{'Content-Type':'application/json'}}))
async function render(enabled=true){
 vi.mocked(fetch).mockImplementation((url:any)=>String(url).endsWith('/providers')?reply({providers:{telegram:enabled}}):reply({state:'synthetic-flow-state',bot_username:'kino_publisher_bot'}))
 const w=mount(SocialLogin);wrappers.push(w);await flushPromises();return w
}
describe('Telegram one-click UI',()=>{
 it('mounts official widget immediately, without a preliminary button',async()=>{
  const w=await render();expect(fetch).toHaveBeenCalledTimes(2)
  expect(w.findAll('button')).toHaveLength(0)
  const script=w.find('script');expect(script.attributes('src')).toBe('https://telegram.org/js/telegram-widget.js?22')
  expect(script.attributes('data-telegram-login')).toBe('kino_publisher_bot');expect(script.attributes('data-lang')).toBe('ru');expect(script.attributes('data-request-access')).toBe('write')
  await script.trigger('load');expect(w.find('[role=status]').exists()).toBe(false)
  expect(w.text()).not.toContain('Google')
  expect(w.text()).not.toContain(t('Войти через Telegram-бота'))
  expect(w.find('[aria-label="Резервный вход через Telegram-бота"]').exists()).toBe(false)
 })
 it('opens Home after successful Telegram widget authentication',async()=>{
  const w=await render();const callback=w.find('script').attributes('data-onauth')!.split('(')[0]!
  mocks.user.value={id:'synthetic-viewer'}
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({access_token:'cookie-session'}),{status:200,headers:{'Content-Type':'application/json'}}))
  await (window as any)[callback]({id:123,hash:'synthetic'});await flushPromises()
  expect(mocks.fetchCurrentUser).toHaveBeenCalled();expect(mocks.push).toHaveBeenCalledWith('/')
 })
 it('does not start a flow when provider is not configured',async()=>{
  const w=await render(false);expect(fetch).toHaveBeenCalledTimes(1);expect(w.find('script').exists()).toBe(false);expect(w.text()).toContain('not connected')
 })
 it('shows retry only after a real loading error and replaces old widget',async()=>{
  const w=await render();await w.find('script').trigger('error');expect(w.find('[role=alert]').exists()).toBe(true)
  expect(w.findAll('button')).toHaveLength(1);await w.findAll('button').find(b=>b.text().includes(t('Повторить')))!.trigger('click');await flushPromises()
  expect(w.findAll('script')).toHaveLength(1);expect(w.findAll('button')).toHaveLength(0)
 })
 it('removes its callback on unmount',async()=>{
  const w=await render();const callback=w.find('script').attributes('data-onauth')!.split('(')[0]!
  expect(typeof(window as any)[callback]).toBe('function');w.unmount();expect((window as any)[callback]).toBeUndefined()
 })
 it('does not inject a script after the page has been left',async()=>{
  let resolve:any;vi.mocked(fetch).mockReturnValue(new Promise(r=>{resolve=r}) as any)
  const w=mount(SocialLogin);w.unmount();resolve({ok:true,json:async()=>({providers:{telegram:true}})});await flushPromises();expect(fetch).toHaveBeenCalledTimes(1)
 })
})
