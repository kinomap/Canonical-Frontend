import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(name, context={}) {
 const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8')
 const sandbox={exports:{}, URL, Headers, Request, Event,...context}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
 return sandbox.exports
}
function browser(status=200) {
 const storage=new Map([['admin_token','cookie-session']]), events=[],calls=[]
 const window={location:{origin:'http://10.8.0.1:8888'},dispatchEvent:e=>events.push(e.type),fetch:async(...args)=>{calls.push(args);return {status}}}
 const localStorage={getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}
 const module=load('browserAuth.ts',{window,localStorage,document:{cookie:'kinosota_csrf=test-csrf'}})
 return {module,window,storage,events,calls}
}
test('401 on protected API clears stale marker and signals reauthentication',()=>{
 const b=browser();b.module.handleSessionFailure(401,'/api/v1/admin/ads/creatives')
 assert.equal(b.storage.has('admin_token'),false);assert.deepEqual(b.events,['admin-session-expired'])
})
test('wrong login password, external API and non-API 401 do not expire admin session',()=>{
 const b=browser();for(const url of ['/api/v1/auth/login','/api/v1/auth/mfa/complete','https://other.example/api/v1/admin/ads','/admin/asset'])b.module.handleSessionFailure(401,url)
 assert.equal(b.storage.has('admin_token'),true);assert.equal(b.events.length,0)
})
test('403 CSRF/permission failures and service failures do not impersonate logout',()=>{
 const b=browser();for(const s of [403,409,422,503])b.module.handleSessionFailure(s,'/api/v1/admin/ads/creatives/upload')
 assert.equal(b.storage.has('admin_token'),true);assert.equal(b.events.length,0)
})
test('fetch binary upload retains body, uses cookie credentials and CSRF, never marker bearer',async()=>{
 const b=browser();const body=new Uint8Array([1,2,3]);await b.window.fetch('/api/v1/admin/ads/creatives/upload',{method:'POST',headers:{Authorization:'Bearer cookie-session','Content-Type':'video/mp4'},body})
 const [,init]=b.calls[0];assert.equal(init.body,body);assert.equal(init.credentials,'same-origin');assert.equal(init.headers.has('Authorization'),false);assert.equal(init.headers.get('X-CSRF-Token'),'test-csrf');assert.equal(init.headers.get('Content-Type'),'video/mp4')
})
test('fetch 401 reports expired session and makes exactly one request',async()=>{
 const b=browser(401);await b.window.fetch('/api/v1/admin/ads/creatives/upload',{method:'POST',body:'test'});assert.equal(b.calls.length,1);assert.deepEqual(b.events,['admin-session-expired'])
})
test('axios upload uses cookie session, keeps MIME and CSRF, does not retry 401',async()=>{
 let request,errorHandler;const calls=[];const axios={interceptors:{request:{use:f=>request=f},response:{use:(_f,e)=>errorHandler=e}}}
 load('httpClient.ts',{window:{location:{origin:'http://10.8.0.1:8888'}},require:n=>n==='axios'?{__esModule:true,default:axios}:{csrfToken:()=> 'csrf',handleSessionFailure:(...a)=>calls.push(a)}})
 const config={url:'/api/v1/admin/ads/creatives/upload',method:'post',headers:new Headers({Authorization:'Bearer cookie-session','Content-Type':'video/mp4'})}
 request(config);assert.equal(config.withCredentials,true);assert.equal(config.headers.has('Authorization'),false);assert.equal(config.headers.get('X-CSRF-Token'),'csrf');assert.equal(config.headers.get('Content-Type'),'video/mp4')
 const error={config,response:{status:401}};await assert.rejects(errorHandler(error));assert.deepEqual(calls,[[401,config.url]])
})
test('return URL cannot escape admin router or loop to login',()=>{
 const {safeReturnPath}=load('sessionNavigation.ts');for(const bad of ['//evil.example','https://evil.example','/\\evil','/login?next=x','/x\nfoo',undefined,['/ad-studio']])assert.equal(safeReturnPath(bad),'/')
 assert.equal(safeReturnPath('/ad-studio'),'/ad-studio')
})
test('guard validates server session; upload preflight precedes video transfer',()=>{
 const router=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8');assert.match(router,/await axios.get\('\/api\/v1\/auth\/me'/);assert.match(router,/data.role !== 'admin'/)
 const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');assert.ok(view.indexOf("await axios.get('/api/v1/auth/me'")<view.indexOf("await axios.post(base+'/creatives/upload-ticket'"))
})
