import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {setLanguage} from '@/i18n'
import ProfileView from '@/views/ProfileView.vue'
import AccountSecurity from '@/components/AccountSecurity.vue'
const mocks=vi.hoisted(()=>({api:vi.fn(),push:vi.fn(),fetchCurrentUser:vi.fn(),setToken:vi.fn(),logout:vi.fn()}))
vi.mock('@/accountApi',()=>({accountApi:mocks.api}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({user:{value:{username:'viewer'}},isAuthenticated:{value:true},...mocks})}))
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push,replace:mocks.push})}))
let wrappers:any[]=[]
const fixture=()=>({id:'fixture',username:'viewer',email:'viewer@example.com',display_name:'Cinema fan',language:'ru',avatar_preset:0,telegram_notifications:false,password_login_available:true,two_factor_enabled:false,role:'user',created_at:'2026-10-01T00:00:00Z',subscription_status:'free',entitlements:[]})
beforeEach(()=>{vi.clearAllMocks();setLanguage('ru');wrappers=[];mocks.api.mockImplementation(async(path:string)=>path==='/account'?fixture():path==='/billing/plans'?[]:path.startsWith('/billing/orders')?{items:[],total:0}:[])})
afterEach(()=>wrappers.forEach(w=>w.unmount()))
describe('Modular account dashboard',()=>{
 it('has exactly four isolated Russian tabs and eight avatar presets',async()=>{
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.findAll('[role=tab]').map(x=>x.text())).toEqual(['Профиль','PRO подписка и оплата','Безопасность и 2FA','Настройки'])
  expect(w.findAll('.preset-gallery button')).toHaveLength(8)
  expect(w.text()).not.toContain('Member Since');expect(w.text()).not.toContain('Email Address')
  await w.get('#tab-billing').trigger('click');expect(w.find('#panel-profile').exists()).toBe(false);expect(w.find('#panel-billing').exists()).toBe(true)
  expect(w.find('.promo-form input').exists()||w.text().includes('Промокод')).toBe(true)
 })
 it('switches all account labels and persists the selected language',async()=>{
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();await w.get('#tab-settings').trigger('click')
  await w.findAll('input[type=radio]')[1].trigger('change')
  expect(w.findAll('[role=tab]').map(x=>x.text())).toEqual(['Profile','PRO & Billing','Security & 2FA','Settings'])
  expect(localStorage.getItem('kinosota_language')).toBe('en');expect(w.text()).toContain('Interface language');expect(w.text()).not.toContain('Настройки')
  await w.get('#panel-settings form').trigger('submit.prevent');await flushPromises()
  expect(mocks.api).toHaveBeenCalledWith('/account/settings','PUT',{language:'en',telegram_notifications:false})
 })
 it('opens local TOTP setup and never persists secrets in browser storage',async()=>{
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?fixture():path==='/account/2fa/setup'?{secret:'FIXTUREONLY',qr_svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',uri:'otpauth://totp/KINOSOTA:fixture'}:[])
  const w=mount(AccountSecurity);wrappers.push(w);await flushPromises()
  await w.get('input[type=password]').setValue('fixture-not-a-real-password')
  await w.findAll('button').find(b=>b.text()==='Подключить 2FA')!.trigger('click');await flushPromises()
  expect(w.get('img.qr').attributes('src')).toMatch(/^data:image\/svg\+xml;base64,/)
  expect(w.text()).toContain('FIXTUREONLY');expect(JSON.stringify({...localStorage})).not.toContain('FIXTUREONLY')
  expect(mocks.api).toHaveBeenCalledWith('/account/2fa/setup','POST',{current_password:'fixture-not-a-real-password'})
 })
 it('shows failed setup as an error, not a success state',async()=>{
  mocks.api.mockImplementation(async(path:string)=>{if(path==='/account')return fixture();if(path==='/account/2fa/setup')throw new Error('fixture reauthentication required');return []})
  const w=mount(AccountSecurity);wrappers.push(w);await flushPromises();await w.findAll('button').find(b=>b.text()==='Подключить 2FA')!.trigger('click');await flushPromises()
  expect(w.get('[role=alert]').text()).toContain('fixture reauthentication required');expect(w.find('img.qr').exists()).toBe(false)
 })
})

describe('Human profiles, Telegram disconnection and visible MFA',()=>{
 it('shows active MFA in navigation, security and settings with recovery count',async()=>{
  const a={...fixture(),two_factor_enabled:true,two_factor_enabled_at:'2026-10-20T03:00:00Z',recovery_codes_remaining:6}
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?a:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.get('#tab-security .mfa-badge').text()).toBe('2FA ON')
  await w.get('#tab-settings').trigger('click');expect(w.get('.factor-active').text()).toContain('АКТИВНА');expect(w.get('.factor-active').text()).toContain('6')
  await w.get('.security-manage').trigger('click');await flushPromises();expect(w.find('#panel-security .factor-active').exists()).toBe(true)
 })
 it('saves a social-only display name without transmitting technical identity fields',async()=>{
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?{...fixture(),username:'HumanFixture',email:'',password_login_available:false}:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();await w.get('input[autocomplete=nickname]').setValue('My name');await w.get('.profile-details').trigger('submit.prevent');await flushPromises()
  expect(mocks.api).toHaveBeenCalledWith('/account/profile','PATCH',{display_name:'My name',current_password:''},'')
  expect(w.text()).not.toContain('telegram.invalid')
 })
 it('disconnects a sole Telegram identity and redirects home without loading the revoked session',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true)
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?{...fixture(),telegram_linked:true,password_login_available:false}:path==='/account/telegram/unlink'?{ok:true,logout:true}:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();mocks.api.mockClear()
  await w.findAll('button').find(b=>b.text()==='Отвязать Telegram')!.trigger('click');await flushPromises()
  expect(mocks.api).toHaveBeenCalledWith('/account/telegram/unlink','POST',{})
  expect(localStorage.getItem('telegram_require_confirmation')).toBe('1');
  expect(mocks.setToken).toHaveBeenCalledWith(null);expect(mocks.push).toHaveBeenCalledWith('/')
  expect(mocks.api.mock.calls.filter(c=>c[0]==='/account')).toHaveLength(0)
 })
})
