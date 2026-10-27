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
beforeEach(()=>{vi.clearAllMocks();signed.value=false;mocks.api.mockResolvedValue(rows())})
describe('Desktop player privilege',()=>{
 it('shows all platforms to guests without download or pairing controls',async()=>{
  const w=await render(DesktopPlayerCard);expect(w.findAll('.platform')).toHaveLength(3);expect(w.text()).toContain('KINOSOTA Player')
  expect(w.find('.platform button').exists()).toBe(false);expect(w.find('form').exists()).toBe(false);expect(w.get('a').attributes('href')).toContain('/login');w.unmount()
 })
 it('paid account never receives a fake ready download',async()=>{
  signed.value=true;mocks.api.mockResolvedValue(rows(true,false));const w=await render(DesktopPlayerCard)
  expect(w.find('.platform button').exists()).toBe(false);expect(w.text()).toContain('Сборка ещё не опубликована');expect(w.find('form').exists()).toBe(true);w.unmount()
 })
 it('pairing requires explicit confirmation of a valid code',async()=>{
  signed.value=true;mocks.api.mockResolvedValue(rows(true,false));const w=await render(DesktopPlayerCard,'?player_code=ABCDEFGH')
  expect(mocks.api.mock.calls.filter(c=>c[0].endsWith('/approve'))).toHaveLength(0)
  expect((w.get('input').element as HTMLInputElement).value).toBe('ABCDEFGH')
  await w.get('form').trigger('submit');await flushPromises();expect(mocks.api).toHaveBeenCalledWith('/desktop/pairing/approve','POST',{code:'ABCDEFGH'});expect(w.text()).toContain('Устройство подтверждено');w.unmount()
 })
 it('failed release loading is an error and retry, not a fake download',async()=>{
  mocks.api.mockRejectedValue(new Error('offline'));const w=await render(DesktopPlayerCard);expect(w.get('[role=alert]').text()).toContain('Не удалось проверить');expect(w.find('.platform button').exists()).toBe(false);w.unmount()
 })
 it('compatibility warning has actionable profile and public information links',async()=>{
  const w=await render(PlaybackCompatibility);expect(w.text()).toContain('кодек');expect(w.findAll('a').map(a=>a.attributes('href'))).toEqual(['/profile#desktop-player','/player']);w.unmount()
 })
})
