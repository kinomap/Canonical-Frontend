import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory} from 'vue-router'
import {ref} from 'vue'
import DesktopAuthorizeModal from '@/components/DesktopAuthorizeModal.vue'
const mocks=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/accountApi',()=>({accountApi:mocks.api}))
const signed=ref(true),user=ref({username:'viewer'})
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({isAuthenticated:signed,user})}))
beforeEach(()=>{signed.value=true;mocks.api.mockReset();mocks.api.mockResolvedValue({ok:true})})
async function render(path='/profile?player_code=ABCDEFGH'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})
 await router.push(path);await router.isReady()
 const w=mount(DesktopAuthorizeModal,{global:{plugins:[router],stubs:{teleport:true,SignInForm:{template:'<form class="test-signin"/>'}}}})
 await flushPromises();return {w,router}
}
describe('Browser player authorization',()=>{
 it('opens centered dialog without manual code or automatic approval',async()=>{const {w}=await render();expect(w.find('[role=dialog]').exists()).toBe(true);expect(w.find('input').exists()).toBe(false);expect(w.text()).toContain('viewer');expect(mocks.api).not.toHaveBeenCalled();await w.get('.primary').trigger('click');await flushPromises();expect(mocks.api).toHaveBeenCalledWith('/desktop/pairing/approve','POST',{code:'ABCDEFGH'});expect(w.text()).toContain('Вход подтверждён');w.unmount()})
 it('shows sign-in form for guests before approval',async()=>{signed.value=false;const {w}=await render();expect(w.find('.test-signin').exists()).toBe(true);expect(mocks.api).not.toHaveBeenCalled();w.unmount()})
 it('cancel removes challenge and makes no request',async()=>{const {w,router}=await render();await w.get('.cancel').trigger('click');await flushPromises();expect(router.currentRoute.value.query.player_code).toBeUndefined();expect(mocks.api).not.toHaveBeenCalled();w.unmount()})
 it('rejects invalid links locally',async()=>{const {w}=await render('/?player_code=bad');expect(w.text()).toContain('недействительна');expect(mocks.api).not.toHaveBeenCalled();w.unmount()})
 it('shows expiry and does not claim authorization',async()=>{mocks.api.mockRejectedValue(Object.assign(new Error('expired'),{code:'PAIRING_EXPIRED_OR_USED'}));const {w}=await render();await w.get('.primary').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toContain('истекло');expect(w.text()).not.toContain('Вход подтверждён');w.unmount()})
 it('does not appear without an approval challenge',async()=>{const {w}=await render('/profile');expect(w.find('[role=dialog]').exists()).toBe(false);w.unmount()})
})
