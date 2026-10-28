import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {setLanguage} from '@/i18n'
import ProfileView from '@/views/ProfileView.vue'
import AccountSecurity from '@/components/AccountSecurity.vue'
import {toastMessage} from '@/lib/toast'
const mocks=vi.hoisted(()=>({api:vi.fn(),push:vi.fn(),fetchCurrentUser:vi.fn(),setToken:vi.fn(),logout:vi.fn()}))
vi.mock('@/accountApi',()=>({accountApi:mocks.api}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({user:{value:{username:'viewer'}},isAuthenticated:{value:true},...mocks})}))
vi.mock('vue-router',()=>({useRoute:()=>({query:{}}),useRouter:()=>({push:mocks.push,replace:mocks.push})}))
let wrappers:any[]=[]
const fixture=()=>({id:'fixture',username:'viewer',email:'viewer@example.com',display_name:'Cinema fan',language:'ru',avatar_preset:0,telegram_notifications:false,password_login_available:true,two_factor_enabled:false,role:'user',created_at:'2026-10-01T00:00:00Z',subscription_status:'free',entitlements:[]})
beforeEach(()=>{vi.clearAllMocks();setLanguage('ru');wrappers=[];mocks.api.mockImplementation(async(path:string)=>path==='/account'?fixture():path==='/billing/plans'?[]:path.startsWith('/billing/orders')?{items:[],total:0}:[])})
afterEach(()=>wrappers.forEach(w=>w.unmount()))
describe('Modular account dashboard',()=>{
 it('has five isolated Russian tabs and eight avatar presets',async()=>{
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.findAll('[role=tab]').map(x=>x.text())).toEqual(['Профиль','PRO подписка и оплата','KINOSOTA Player','Безопасность и 2FA','Настройки'])
  expect(w.findAll('.preset-gallery button')).toHaveLength(8)
  expect(w.text()).not.toContain('Member Since');expect(w.text()).not.toContain('Email Address')
  await w.get('#tab-billing').trigger('click');expect(w.find('#panel-profile').exists()).toBe(false);expect(w.find('#panel-billing').exists()).toBe(true)
  expect(w.find('.promo-form input').exists()||w.text().includes('Промокод')).toBe(true)
 })
 it('switches all account labels and persists the selected language',async()=>{
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();await w.get('#tab-settings').trigger('click')
  await w.findAll('input[type=radio]')[1].trigger('change')
  expect(w.findAll('[role=tab]').map(x=>x.text())).toEqual(['Profile','PRO & Billing','KINOSOTA Player','Security & 2FA','Settings'])
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
  expect(localStorage.getItem('telegram_require_confirmation')).toBeNull();expect(localStorage.getItem('tg_just_unlinked')).toBeNull();
  expect(mocks.setToken).toHaveBeenCalledWith(null);expect(mocks.push).toHaveBeenCalledWith('/');expect(toastMessage.value).toBe('Вы вышли из аккаунта. Чтобы войти под другим номером Telegram, нажмите "Отключить" в сервисном сообщении от Telegram')
  expect(mocks.api.mock.calls.filter(c=>c[0]==='/account')).toHaveLength(0)
 })
})

it('unlinks password account without signing out or redirecting',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true)
 let unlinked=false
 mocks.api.mockImplementation(async(path:string)=>{if(path==='/account')return {...fixture(),telegram_linked:!unlinked};if(path==='/account/telegram/unlink'){unlinked=true;return {ok:true,logout:false}}return []})
 const w=mount(ProfileView);wrappers.push(w);await flushPromises()
 localStorage.setItem('tg_just_unlinked','true')
 await w.findAll('button').find(b=>b.text()==='Отвязать Telegram')!.trigger('click');await flushPromises()
 expect(mocks.setToken).not.toHaveBeenCalledWith(null);expect(mocks.push).not.toHaveBeenCalled();expect(w.text()).toContain('Telegram отвязан.');expect(localStorage.getItem('tg_just_unlinked')).toBeNull()
})

it('stops initial spinner on failure and retries the account without rendering null data',async()=>{
 mocks.api.mockRejectedValueOnce(new Error('Account temporarily unavailable'))
 const w=mount(ProfileView);wrappers.push(w);await flushPromises()
 expect(w.get('[role=alert]').text()).toContain('Account temporarily unavailable')
 expect(w.text()).not.toContain('Загружаем аккаунт')
 expect(w.find('#panel-profile').exists()).toBe(false)
 await w.get('[role=alert] button').trigger('click');await flushPromises()
 expect(w.find('#panel-profile').exists()).toBe(true)
 expect(w.find('[role=alert]').exists()).toBe(false)
})

describe('Reference account layout uses actual backend state',()=>{
 it('does not claim an unconfigured account is protected and shows only actual sessions',async()=>{
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?fixture():path==='/account/sessions'?[{current:true,device:'Fixture browser',last_seen_at:'2026-10-23T00:00:00Z'}]:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.get('.private-badge').text()).toBe('2FA не настроена')
  expect(w.get('.sessions-summary').text()).toContain('Активных сеансов: 1')
  expect(w.get('.security-summary').text()).toContain('не настроена')
  expect(w.findAll('.account-summaries button')).toHaveLength(2)
  expect(w.text()).not.toContain('История просмотров');expect(w.text()).not.toContain('Избранное')
  await w.get('.sessions-summary').trigger('click');await flushPromises();expect(w.find('#panel-security').exists()).toBe(true)
 })
 it('does not manufacture a device count when sessions cannot be loaded',async()=>{
  mocks.api.mockImplementation(async(path:string)=>{if(path==='/account')return fixture();if(path==='/account/sessions')throw Error('fixture unavailable');return []})
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.find('#panel-profile').exists()).toBe(true);expect(w.get('.sessions-summary').text()).toContain('недоступны');expect(w.text()).not.toContain('Активных сеансов:')
 })
 it('shows no observed sessions honestly and never assumes one current device',async()=>{
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();expect(w.get('.sessions-summary').text()).toContain('не найдено')
 })
 it('shows real factor state, Telegram connection and nickname instead of reference identities',async()=>{
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?{...fixture(),two_factor_enabled:true,telegram_linked:true,telegram_username:'fixture_handle'}:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises();expect(w.get('.private-badge').text()).toBe('2FA включена');expect(w.get('.identity-copy h2').text()).toBe('Cinema fan');expect(w.get('.telegram-handle').text()).toBe('@fixture_handle');expect(w.text()).not.toContain('MysteriumPersonae')
 })
 it('requires explicit confirmation before ending other sessions',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(false)
  const w=mount(AccountSecurity);wrappers.push(w);await flushPromises();mocks.api.mockClear()
  await w.findAll('button').find(b=>b.text()==='Завершить все остальные сеансы')!.trigger('click');await flushPromises();expect(mocks.api).not.toHaveBeenCalled();expect(window.confirm).toHaveBeenCalled()
 })
})

it('reveals existing reauthentication fields only for a sensitive identity edit',async()=>{
 mocks.api.mockImplementation(async(path:string)=>path==='/account'?{...fixture(),two_factor_enabled:true}:[])
 const w=mount(ProfileView);wrappers.push(w);await flushPromises()
 expect(w.find('.profile-details input[autocomplete=current-password]').exists()).toBe(false)
 await w.get('input[autocomplete=username]').setValue('viewer_new')
 expect(w.find('.profile-details input[autocomplete=current-password]').exists()).toBe(true)
 await w.get('.profile-details input[autocomplete=current-password]').setValue('fixture-only')
 await w.get('.profile-details input[autocomplete=one-time-code]').setValue('123456')
 await w.get('.profile-details').trigger('submit.prevent');await flushPromises()
 expect(mocks.api).toHaveBeenCalledWith('/account/profile','PATCH',{display_name:'Cinema fan',username:'viewer_new',email:'viewer@example.com',current_password:'fixture-only'},'123456')
 expect(w.text()).toContain('Профиль обновлён.')
})


it('renders player only in its own main-content menu panel',async()=>{
 const w=mount(ProfileView);wrappers.push(w);await flushPromises()
 expect(w.findComponent({name:'DesktopPlayerCard'}).exists()).toBe(false)
 expect(w.find('#desktop-player').exists()).toBe(false)
 await w.get('#tab-player').trigger('click');await flushPromises()
 expect(w.find('#panel-profile').exists()).toBe(false)
 expect(w.find('#panel-player #desktop-player').exists()).toBe(true)
 expect(w.find('.account-content #panel-player').exists()).toBe(true)
 await w.get('#tab-profile').trigger('click');await flushPromises()
 expect(w.find('#desktop-player').exists()).toBe(false)
})

it('keyboard navigation includes the new player tab and wraps all menu items',async()=>{
 const w=mount(ProfileView);wrappers.push(w);await flushPromises()
 await w.get('#tab-profile').trigger('keydown',{key:'End'});await flushPromises()
 expect(w.get('#tab-settings').attributes('aria-selected')).toBe('true')
 await w.get('#tab-settings').trigger('keydown',{key:'ArrowDown'});await flushPromises()
 expect(w.get('#tab-profile').attributes('aria-selected')).toBe('true')
})


describe('Administrator paid privileges display',()=>{
 it('labels administrator access truthfully without a fake paid subscription',async()=>{
  mocks.api.mockImplementation(async(path:string)=>path==='/account'?{...fixture(),role:'admin'}:path==='/desktop/releases'?{can_download:true,access_basis:'administrator',items:[]}:[])
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.text()).toContain('Администратор · полный доступ')
  await w.get('#tab-player').trigger('click');await flushPromises()
  expect(w.text()).toContain('ДОСТУП АДМИНИСТРАТОРА')
  expect(w.text()).toContain('Покупать подписку не нужно')
  expect(w.find('#player-pair-code').exists()).toBe(false)
  expect(w.find('.access-note').exists()).toBe(false)
 })
})

describe('Account expiry rendering',()=>{
 it('never renders the broken retry-error screen for an expired session',async()=>{
  mocks.api.mockRejectedValue(Object.assign(new Error('Операция не выполнена. Проверьте данные и повторите попытку.'),{status:401}))
  const w=mount(ProfileView);wrappers.push(w);await flushPromises()
  expect(w.find('.notice.error').exists()).toBe(false)
  expect(w.text()).not.toContain('Повторить загрузку')
  expect(mocks.logout).not.toHaveBeenCalled()
 })
})
