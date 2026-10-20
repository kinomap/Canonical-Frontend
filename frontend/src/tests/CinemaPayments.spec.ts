import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {beginCell} from '@ton/core'
import {TonConnect} from '@tonconnect/sdk'
import {friendlyTonAddress,compactTonAddress,validatedTransaction} from '@/tonPayments'
import {setLanguage} from '@/i18n'
import BillingPanel from '@/components/BillingPanel.vue'
const mocks=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/accountApi',()=>({accountApi:mocks.api}))
const RAW='0:'+'11'.repeat(32),SENDER='0:'+'22'.repeat(32)
// jsdom does not implement native dialog methods; real Chromium coverage exercises focus trapping.
HTMLDialogElement.prototype.showModal ||= function(){this.setAttribute('open','')}
HTMLDialogElement.prototype.close ||= function(){this.removeAttribute('open')}
let wrappers:any[]=[]
const account={username:'viewer',subscription_status:'free',telegram_linked:false,password_login_available:true,two_factor_enabled:false}
const plans=[{id:'m1',days:30,usd:'4.99',stars:250},{id:'m6',days:180,usd:'22',stars:1100},{id:'m12',days:365,usd:'35',stars:1750}].map(p=>({...p,methods:[{id:'ton',symbol:'TON',network:'TON',price:'1',available:false},{id:'usdt_ton',symbol:'USDT',network:'TON · Jetton',price:p.usd,available:false}]}))
beforeEach(()=>{setLanguage('ru');vi.clearAllMocks();wrappers=[];vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.setAttribute('open','')});vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.removeAttribute('open')});mocks.api.mockImplementation(async(path:string)=>path==='/billing/plans'?plans:path.startsWith('/billing/orders')?{items:[],total:0}:[])})
afterEach(()=>{wrappers.forEach(w=>w.unmount());vi.restoreAllMocks()})
describe('Cinema checkout and real TON Connect SDK validator',()=>{
 it('normalizes raw/EQ/UQ to compact mainnet UQ and rejects malformed/testnet addresses',()=>{const u=friendlyTonAddress(RAW);expect(u).toMatch(/^UQ[A-Za-z0-9_-]{46}$/);expect(friendlyTonAddress(u)).toBe(u);expect(compactTonAddress(RAW)).toBe(u.slice(0,6)+'…'+u.slice(-5));for(const bad of ['', '0:bad',u.slice(0,-1)+'x'])expect(()=>friendlyTonAddress(bad)).toThrow()})
 it.each(['ton','usdt_ton','gram'])('passes actual SDK request validation for %s without sending a transaction',async provider=>{
  const payload=beginCell().storeUint(0,32).storeStringTail('kos_fixture').endCell().toBoc().toString('base64')
  const request:any={validUntil:Math.floor(Date.now()/1000)+120,network:'-239',from:SENDER,messages:[{address:RAW,amount:provider==='ton'?'1000000000':'80000000',payload}]}
  const tx=validatedTransaction(request,SENDER)
  expect(tx.messages[0].address.startsWith('UQ')).toBe(true)
  // The unmodified SDK validates BEFORE checkConnection. Stop there deliberately: no wallet, bridge or charge.
  const stop={checkConnection(){throw new Error('VALIDATED_STOP_BEFORE_NETWORK')}}
  await expect(TonConnect.prototype.sendTransaction.call(stop as any,tx)).rejects.toThrow('VALIDATED_STOP_BEFORE_NETWORK')
 })
 it('reproduces the reported SDK error with raw recipient and blocks bad requests locally',async()=>{
  const request:any={validUntil:Math.floor(Date.now()/1000)+120,network:'-239',from:SENDER,messages:[{address:RAW,amount:'1'}]}
  await expect(TonConnect.prototype.sendTransaction.call({} as any,request)).rejects.toThrow("Wrong 'address' format")
  expect(()=>validatedTransaction({...request,validUntil:1},SENDER)).toThrow('PAYMENT_ORDER_EXPIRED')
  expect(()=>validatedTransaction({...request,from:RAW},SENDER)).toThrow('TON_WALLET_MISMATCH')
  expect(()=>validatedTransaction(request,SENDER)).toThrow('PAYMENT_REQUEST_INVALID')
 })
 it('renders exactly 3 plan cards and 4 bento benefits, updates the selected amount',async()=>{const w=mount(BillingPanel,{props:{account}});wrappers.push(w);await flushPromises();expect(w.findAll('.plan-card')).toHaveLength(3);expect(w.findAll('.benefit')).toHaveLength(4);expect(w.get('.checkout-total').text()).toContain('22');await w.get('[data-days="365"]').trigger('click');expect(w.get('.checkout-total').text()).toContain('35')})
 it('keeps Stars clickable without Telegram and opens linking inline, not a dead disabled button',async()=>{const w=mount(BillingPanel,{props:{account},attachTo:document.body});wrappers.push(w);await flushPromises();expect(w.get('[data-testid=pay-stars]').attributes('disabled')).toBeUndefined();await w.get('[data-testid=pay-stars]').trigger('click');await flushPromises();expect(document.querySelector('dialog[open]')).not.toBeNull();expect(w.get('dialog').text()).toContain('Привяжите Telegram');expect(w.find('dialog input[type=password]').exists()).toBe(true);expect(mocks.api.mock.calls.some(c=>c[0]==='/billing/orders'&&c[1]==='POST')).toBe(false)})
 it('shows an unavailable-method modal before calling any wallet SDK or creating an order',async()=>{const w=mount(BillingPanel,{props:{account},attachTo:document.body});wrappers.push(w);await flushPromises();await w.get('.checkout-total button').trigger('click');await flushPromises();expect(w.get('dialog').text()).toContain('Этот способ оплаты настраивается');expect(mocks.api.mock.calls.some(c=>c[1]==='POST')).toBe(false)})
 it('uses a direct Stars invoice for an already linked account',async()=>{
  vi.spyOn(window,'open').mockImplementation(()=>null)
  mocks.api.mockImplementation(async(path:string,method:string,body:any)=>path==='/billing/plans'?plans:path==='/billing/orders'&&method==='POST'?{id:'fixture',provider:'stars',invoice_url:'https://t.me/$fixtureOnly',duration_days:180,amount_display:'1100',status:'pending'}:path.startsWith('/billing/orders')?{items:[],total:0}:[])
  const w=mount(BillingPanel,{props:{account:{...account,telegram_linked:true}},attachTo:document.body});wrappers.push(w);await flushPromises();await w.get('[data-testid=pay-stars]').trigger('click');await flushPromises();expect(mocks.api).toHaveBeenCalledWith('/billing/orders','POST',expect.objectContaining({plan_id:'m6',provider:'stars'}));expect(w.get('dialog a').attributes('href')).toBe('https://t.me/$fixtureOnly')
 })
})
