import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const vue=require('vue')
const source=readFileSync(new URL('../src/components/AddMediaNodeWizard.vue',import.meta.url),'utf8')
const {descriptor}=parse(source)
const script=compileScript(descriptor,{id:'trust-test'})
const compiled=ts.transpileModule(script.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const pin='SHA256:'+'a'.repeat(43)
function setup(response={verified:true}) {
 const requests=[]
 const axios={post:async(url,body)=>{requests.push({url,body});if(response instanceof Error)throw response;return {data:response}},get:async()=>({data:[]})}
 const sandbox={exports:{},require:(name)=>name==='vue'?{...vue,onUnmounted:()=>{}}:name==='axios'?{default:axios,__esModule:true}:name==='../toast'?{addToast:()=>{}}:{default:{},__esModule:true},localStorage:{getItem:()=> 'synthetic'},window:{setInterval:()=>1,clearInterval:()=>{}}}
 vm.runInNewContext(compiled,sandbox)
 const state=sandbox.exports.default.setup({}, {expose:()=>{},emit:()=>{}})
 state.nodeName.value='node-test';state.host.value='203.0.113.10';state.sshPort.value=2222;state.sshUsername.value='deployer';state.hostFingerprint.value=pin;state.selectedVersion.value='test';state.sshPrivateKey.value='synthetic'.repeat(10)
 return {state,requests}
}
test('wizard compiles and explains server identity separately from private credential',()=>{
 assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'AddMediaNodeWizard.vue',id:'trust'}).errors,[])
 assert.match(source,/доверенную консоль хостера/)
 assert.match(source,/ssh_host_ed25519_key.pub/)
 assert.match(source,/ssh_username: sshUsername.value/)
 assert.match(source,/ssh_port: sshPort.value/)
 assert.match(source,/ssh_host_key_fingerprint: hostFingerprint.value.trim/)
})
test('deployment is blocked until explicit server identity verification',async()=>{
 const {state,requests}=setup();await vue.nextTick()
 assert.equal(state.canDeploy.value,false)
 await state.startDeploy();assert.equal(requests.length,0)
 await state.verifyIdentity();assert.equal(state.identityVerified.value,true);assert.equal(state.canDeploy.value,true)
 assert.equal(requests[0].url,'/api/v1/admin/media/nodes/ssh/verify')
 assert.equal(requests[0].body.port,2222)
 assert.equal('ssh_private_key' in requests[0].body,false)
})
for(const field of ['host','sshPort','hostFingerprint'])test(`editing ${field} invalidates confirmed identity`,async()=>{
 const {state}=setup();await vue.nextTick();await state.verifyIdentity();assert.equal(state.identityVerified.value,true)
 state[field].value=field==='sshPort'?2200:'changed';await vue.nextTick();assert.equal(state.identityVerified.value,false);assert.equal(state.canDeploy.value,false)
})
test('failed identity check stays visible and does not allow deployment',async()=>{
 const {state}=setup(new Error('synthetic mismatch'));await vue.nextTick();await state.verifyIdentity()
 assert.equal(state.identityVerified.value,false);assert.ok(state.identityError.value.length>10);assert.equal(state.canDeploy.value,false)
})
