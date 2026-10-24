import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {parse,compileScript} from '@vue/compiler-sfc'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/components/SessionAuthWizard.vue',import.meta.url),'utf8')
const {descriptor}=parse(source)
const js=ts.transpileModule(compileScript(descriptor,{id:'media-http'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function mount(handler=async()=>({data:{id:'created-session'}})){
 const posts=[];let n=0
 const crypto={getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(n++*17+31)%256;return bytes}}
 const sandbox={exports:{},Uint8Array,crypto,localStorage:{getItem:()=> 'fixture-admin-jwt'},require(name){
  if(name==='axios')return {__esModule:true,default:{post:async(...a)=>{posts.push(a);return handler(...a)}}}
  if(name==='./MasterReplacement.vue')return {__esModule:true,default:{}}
  return require(name)
 }}
 vm.runInNewContext(js,sandbox)
 const state=sandbox.exports.default.setup({mode:'create'},{expose:()=>{},emit:()=>{}})
 state.account.value='test-worker';state.apiId.value='12345';state.apiHash.value='a'.repeat(32)
 return {state,posts}
}
test('HTTP WireGuard: creation works without secure-context randomUUID',async()=>{
 const {state,posts}=mount();await state.create()
 assert.equal(posts.length,1)
 assert.equal(posts[0][0],'/api/v1/admin/media/sessions')
 assert.match(posts[0][1].session_identifier,/^worker-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
 assert.equal(state.sid.value,'created-session');assert.equal(state.apiHash.value,'');assert.equal(state.error.value,'')
})
test('server failure remains visible and preserves filled credentials for retry',async()=>{
 const {state,posts}=mount(async()=>{throw {response:{data:{detail:'Fixture conflict'}}}})
 await state.create();assert.equal(posts.length,1);assert.equal(state.error.value,'Fixture conflict')
 assert.equal(state.apiHash.value,'a'.repeat(32));assert.equal(state.account.value,'test-worker');assert.equal(state.sid.value,'');assert.equal(state.busy.value,false)
})
test('invalid app fields do not send requests',async()=>{
 const {state,posts}=mount();state.apiHash.value='bad';await state.create();assert.equal(posts.length,0);assert.ok(state.error.value)
})
