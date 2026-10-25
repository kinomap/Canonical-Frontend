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
 const axios={post:async(url,body)=>{requests.push({url,body});if(url.endsWith('/ssh/verify')) {if(response instanceof Error)throw response;return {data:typeof response==='function'?await response():response}};return {data:url.endsWith('/deploy')?{deployment_id:'op-test',status:'DEPLOYING'}:{id:'node-test'}}},patch:async(url,body)=>{requests.push({url,body});return {data:{}}},get:async()=>({data:[]})}
 const sandbox={exports:{},require:(name)=>name==='vue'?{...vue,onUnmounted:()=>{}}:name==='axios'?{default:axios,__esModule:true}:name==='../toast'?{addToast:()=>{}}:{default:{},__esModule:true},localStorage:{getItem:()=> 'synthetic'},window:{setInterval:()=>1,clearInterval:()=>{}}}
 vm.runInNewContext(compiled,sandbox)
 const state=sandbox.exports.default.setup({}, {expose:()=>{},emit:()=>{}})
 state.nodeName.value='node-test';state.host.value='203.0.113.10';state.sshPort.value=2222;state.sshUsername.value='deployer';state.hostFingerprint.value=pin;state.releases.value=[{version:'test',commit:'a'.repeat(40)}];state.selectedVersion.value='test';state.sshPrivateKey.value='synthetic'.repeat(10)
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
test('one click checks identity before node writes, then deploys',async()=>{
 const {state,requests}=setup();assert.equal(state.canDeploy.value,false);assert.equal(state.canStartDeploy.value,true)
 await state.startDeploy()
 assert.deepEqual(requests.map(r=>r.url),['/api/v1/admin/media/nodes/ssh/verify','/api/v1/admin/media/nodes','/api/v1/admin/media/nodes/node-test','/api/v1/admin/media/nodes/node-test/deploy'])
 assert.equal(requests[0].body.port,2222);assert.equal('ssh_private_key' in requests[0].body,false)
 assert.equal(state.step.value,4);assert.equal(state.sshPrivateKey.value,'')
})
for(const response of [new Error('mismatch'),{verified:false}])test('failed check never writes nodes and preserves key',async()=>{
 const {state,requests}=setup(response);await state.startDeploy();assert.equal(requests.length,1)
 assert.equal(state.identityVerified.value,false);assert.ok(state.identityError.value);assert.equal(state.sshPrivateKey.value,'synthetic'.repeat(10));assert.equal(state.deploying.value,false)
})
for(const field of ['sshPrivateKey','hostFingerprint','selectedVersion','host'])test(`missing ${field} explains blocker without API calls`,async()=>{
 const {state,requests}=setup();state[field].value='';assert.ok(state.deploymentBlockers.value.length);await state.startDeploy();assert.equal(requests.length,0)
})
test('double click while checking cannot duplicate deployment',async()=>{
 let resolve;const {state,requests}=setup(()=>new Promise(r=>{resolve=r}));const pending=state.startDeploy();await state.startDeploy();assert.equal(requests.length,1);resolve({verified:true});await pending;assert.equal(requests.filter(r=>r.url.endsWith('/deploy')).length,1)
})
for(const field of ['host','sshPort','hostFingerprint'])test(`editing ${field} during check prevents stale deployment`,async()=>{
 let resolve;const {state,requests}=setup(()=>new Promise(r=>{resolve=r}));const pending=state.startDeploy();state[field].value=field==='sshPort'?2200:field==='host'?'203.0.113.20':'SHA256:'+'b'.repeat(43);resolve({verified:true});await pending;assert.equal(requests.length,1);assert.equal(state.identityVerified.value,false);assert.ok(state.identityError.value)
})
test('explicit verification is reused for unchanged target',async()=>{
 const {state,requests}=setup();await state.verifyIdentity();await state.startDeploy();assert.equal(requests.filter(r=>r.url.endsWith('/ssh/verify')).length,1);assert.equal(requests.filter(r=>r.url.endsWith('/deploy')).length,1)
})
test('readiness reasons are accessible and disabled CTA has distinct styling',()=>{
 assert.match(source,/aria-describedby="deployment-readiness"/);assert.match(source,/v-for="reason in deploymentBlockers"/);assert.match(source,/Проверить VPS и развернуть/);assert.match(source,/\.wizard-modal \.btn-deploy:disabled/)
})
for(const field of ['host','sshPort','hostFingerprint'])test(`editing ${field} invalidates confirmed identity`,async()=>{
 const {state}=setup();await vue.nextTick();await state.verifyIdentity();assert.equal(state.identityVerified.value,true)
 state[field].value=field==='sshPort'?2200:'changed';await vue.nextTick();assert.equal(state.identityVerified.value,false);assert.equal(state.canDeploy.value,false)
})
test('failed identity check stays visible and does not allow deployment',async()=>{
 const {state}=setup(new Error('synthetic mismatch'));await vue.nextTick();await state.verifyIdentity()
 assert.equal(state.identityVerified.value,false);assert.ok(state.identityError.value.length>10);assert.equal(state.canDeploy.value,false)
})
