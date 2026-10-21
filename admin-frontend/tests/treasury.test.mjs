import test from 'node:test';import assert from 'node:assert/strict'
import {fromMnemonic,preview} from '../src/crypto/hd.mjs'
import {buildTreasuryPlan,verifyTreasuryMnemonic,decimalToRaw} from '../src/crypto/treasury.mjs'
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const keys=fromMnemonic(phrase),addresses=preview(keys)
const snapshot={networks:[{provider:'trc20',master_address:addresses[0].trc20,master_raw:'0',active:[{index:1,address:addresses[1].trc20,amount_raw:'22000000',gas_raw:'0'}]}]}
test('local treasury plan reserves #0 and never performs network I/O',()=>{let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('network forbidden')};try{assert.equal(verifyTreasuryMnemonic(phrase,keys),true);const p=buildTreasuryPlan({phrase,keys,snapshot,provider:'trc20'});assert.equal(p.master,addresses[0].trc20);assert.deepEqual(p.actions.map(x=>[x.type,x.from,x.to]),[['gas',0,1],['sweep',1,0]]);assert.equal(calls,0);assert.throws(()=>verifyTreasuryMnemonic('legal winner thank year wave sausage worth useful legal winner thank yellow',keys))}finally{globalThis.fetch=old}})

test('treasury amounts use exact decimal conversion',()=>{assert.equal(decimalToRaw('123456789.123456789123456789',18),'123456789123456789123456789');assert.throws(()=>decimalToRaw('1.0000001',6));assert.throws(()=>decimalToRaw('-1',6))})
test('full TON withdrawal keeps fee reserve on master',()=>{const p=buildTreasuryPlan({phrase,keys,snapshot:{networks:[{provider:'ton',master_address:addresses[0].ton,master_raw:'1000000000',active:[]}]},provider:'ton',mode:'withdraw',target:addresses[1].ton});assert.equal(p.actions[0].amount_raw,'985000000')})
