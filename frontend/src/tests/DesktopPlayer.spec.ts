import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory} from 'vue-router'
import {ref} from 'vue'
import DesktopPlayerCard from '@/components/DesktopPlayerCard.vue'
import PlaybackCompatibility from '@/components/PlaybackCompatibility.vue'
const mocks=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/accountApi',()=>({accountApi:mocks.api}))
const signed=ref(false)
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({isAuthenticated:signed})}))
const rows=(paid=false,ready=false)=>({can_download:paid,items:['windows','macos','linux'].map(os=>({os,ready,version:ready?'0.1.0':null,sha256:null,download_url:paid&&ready?'/api/v1/desktop/download/'+os:null}))})
async function render(component:any,query=''){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/player',component},{path:'/profile',component:{template:'<div/>'}},{path:'/login',component:{template:'<div/>'}}]})
 await router.push('/player'+query);await router.isReady()
 const wrapper=mount(component,{global:{plugins:[router]}});await flushPromises();return wrapper
}
beforeEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();signed.value=false;mocks.api.mockResolvedValue(rows())})
describe('Desktop player privilege',()=>{
 it('shows all platforms to guests without download or pairing controls',async()=>{
  const w=await render(DesktopPlayerCard);expect(w.findAll('.platform')).toHaveLength(3);expect(w.text()).toContain('KINOSOTA Player')
  expect(w.find('.platform button').exists()).toBe(false);expect(w.find('form').exists()).toBe(false);expect(w.get('a').attributes('href')).toContain('/login');w.unmount()
 })
 it('paid account never receives a fake ready download',async()=>{
  signed.value=true;mocks.api.mockResolvedValue(rows(true,false));const w=await render(DesktopPlayerCard)
  expect(w.find('.platform button').exists()).toBe(false);expect(w.text()).toContain('Сборка ещё не опубликована');expect(w.find('form').exists()).toBe(false);w.unmount()
 })
 it('published Linux remains visible but locked for non-paying accounts',async()=>{
  mocks.api.mockResolvedValue(rows(false,true));const w=await render(DesktopPlayerCard)
  const linux=w.findAll('.platform')[2];expect(linux.text()).toContain('sudo apt install');expect(linux.text()).toContain('Доступно с платной подпиской');expect(linux.find('button').exists()).toBe(false);w.unmount()
 })
 it('paid account can download only the published Linux platform',async()=>{
  signed.value=true;const data=rows(true,false);data.items[2]={os:'linux',ready:true,version:'0.1.1',sha256:null,download_url:'/api/v1/desktop/download/linux'};mocks.api.mockResolvedValue(data)
  const w=await render(DesktopPlayerCard);expect(w.findAll('.platform button')).toHaveLength(1);expect(w.findAll('.platform')[2].text()).toContain('Версия 0.1.1');w.unmount()
 })
 it.each([[401,'Сессия истекла'],[403,'нужна действующая платная подписка']])('does not save a package when download authorization returns %s',async(status,text)=>{
  signed.value=true;mocks.api.mockResolvedValue(rows(true,true));const blob=vi.fn();const request=vi.fn().mockResolvedValue({ok:false,status,blob});vi.stubGlobal('fetch',request)
  const w=await render(DesktopPlayerCard);await w.findAll('.platform')[2].get('button').trigger('click');await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/v1/desktop/download/linux',expect.objectContaining({credentials:'same-origin',cache:'no-store'}));expect(blob).not.toHaveBeenCalled();expect(w.get('[role=alert]').text()).toContain(text);w.unmount()
 })
 it('profile has no manual pairing code even for an old client URL',async()=>{signed.value=true;mocks.api.mockResolvedValue(rows(true,false));const w=await render(DesktopPlayerCard,'?player_code=ABCDEFGH');expect(w.find('input').exists()).toBe(false);expect(mocks.api.mock.calls.filter(c=>c[0].endsWith('/approve'))).toHaveLength(0);w.unmount()})
 it('failed release loading is an error and retry, not a fake download',async()=>{
  mocks.api.mockRejectedValue(new Error('offline'));const w=await render(DesktopPlayerCard);expect(w.get('[role=alert]').text()).toContain('Не удалось проверить');expect(w.find('.platform button').exists()).toBe(false);w.unmount()
 })
 it('compatibility warning has actionable profile and public information links',async()=>{
  const w=await render(PlaybackCompatibility);expect(w.text()).toContain('кодек');expect(w.findAll('a').map(a=>a.attributes('href'))).toEqual(['/profile#desktop-player','/player']);w.unmount()
 })
})
