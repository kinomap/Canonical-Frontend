import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const src=readFileSync(new URL('../src/utils/adPlacement.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
const {nodeMediaUrl,nodeRegistryOrigins,mediaOrigins,placementBody}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const draft=()=>({creative_id:'creative',where:'videos',targets:[{kind:'movie',id:'1',title:'Test'}],scope:'all',genre_id:null,preroll:true,postroll:false,minutes:0,exact:''})
const registry=[{node_id:'node-1',status:'OFFLINE',media_endpoint:'https://node-1.scenrix.com',public_url:null},{node_id:'tg-node-1',status:'ACTIVE',media_endpoint:'https://TG-Node-1.scenrix.com:443/',public_url:'https://tg-node-1.scenrix.com'},{node_id:'old',status:'REMOVED',media_endpoint:'https://old.scenrix.com'},{node_id:'raw',status:'OFFLINE',media_endpoint:'http://63.185.177.108'},{node_id:'bad',status:'ACTIVE',media_endpoint:'https://user@bad.scenrix.com',public_url:'https://bad.scenrix.com/path'}]
test('media fail closed: only registered HTTPS Media Nodes; no backend, self, blob, removed, arbitrary HTTPS or credentials',()=>{
 const nodes=nodeRegistryOrigins(registry);assert.deepEqual(nodes,['https://node-1.scenrix.com','https://tg-node-1.scenrix.com'])
 for(const u of ['https://node-1.scenrix.com/ads/1?token=x','https://tg-node-1.scenrix.com/ads/1?token=x','https://tg-node-1.scenrix.com/stream/1?token=x'])assert.equal(nodeMediaUrl(u,nodes),u)
 for(const u of ['http://node-1.scenrix.com/a','https://node-1.scenrix.com.evil.test/a','https://watch.scenrix.com/a','http://10.8.0.1:8888/video','blob:https://node-1.scenrix.com/1','https://user@node-1.scenrix.com/a','/api/video','https://old.scenrix.com/ads/1','https://bad.scenrix.com/ads/1','http://63.185.177.108/ads/1'])assert.throws(()=>nodeMediaUrl(u,nodes),u)
 assert.throws(()=>nodeMediaUrl('https://node-1.scenrix.com/ads/1',[]))
 assert.deepEqual(mediaOrigins(['https://a.example','http://b.example','https://c.example/x','nope',null,'https://a.example/']),['https://a.example'])
 assert.deepEqual(nodeRegistryOrigins(null,['https://store.example','']),['https://store.example'])
})
test('regression: ad video from any registered node (e.g. tg-node-1) is accepted; no host is hard-coded',()=>{
 assert.ok(!src.includes('node-1.scenrix.com'))
 const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
 assert.ok(!view.includes('node-1.scenrix.com'));assert.ok(view.includes("request('/api/v1/admin/media/nodes')"))
 for(const s of ['trustedMediaUrl(data.media_url)','trustedMediaUrl(s.media_url)','trustedMediaUrl(t.upload_url)','trustedMediaUrl(r.media_url)'])assert.ok(view.includes(s),s)
 for(const v of ['data','s','t','r'])assert.ok(!view.includes('nodeMediaUrl('+v+'.'),v)
})
test('all admin CSP variants allow video/XHR only over HTTPS (exact node enforced in JS) without altering script policy',()=>{
 const nginx=readFileSync(new URL('../../nginx.admin-only.conf',import.meta.url),'utf8')
 const lines=nginx.split('\n').filter(x=>x.includes('Content-Security-Policy'));assert.equal(lines.length,3)
 for(const s of lines){assert.equal(s.match(/media-src ([^;]+);/)[1],'https:');assert.equal(s.match(/connect-src ([^;]+);/)[1],"'self' https:");assert.ok(s.includes("script-src 'self';"));assert.ok(s.includes("frame-ancestors 'none'"))}
})
test('individual placement sends identities only; precise moments parsed and minutes converted',()=>{
 const b=placementBody({...draft(),minutes:20,exact:'00:14:20, 01:05:10'});assert.deepEqual(b.midpoints,[860,3910]);assert.equal(b.interval_sec,1200);assert.deepEqual(b.targets,[{kind:'movie',id:'1'}]);assert.equal(b.selection,'videos')
})
test('group selection cannot accidentally apply stale selected videos or exact times',()=>{
 for(const where of ['all','movie','episode','genre']){const b=placementBody({...draft(),where,genre_id:5,scope:'episode',exact:'00:14:20'});assert.equal(b.selection,'group');assert.deepEqual(b.targets,[]);assert.deepEqual(b.midpoints,[]);assert.equal(b.genre_id,where==='genre'?5:null);assert.equal(b.scope,where==='genre'?'episode':where)}
})
test('invalid draft cannot reach server preview',()=>{
 for(const change of [{creative_id:''},{targets:[]},{where:'genre'},{minutes:0.5},{minutes:121},{exact:'00:60:00'},{exact:'07:00:00'},{exact:'00:00:00'},{exact:'00:01:00,00:01:00'},{preroll:false}])assert.throws(()=>placementBody({...draft(),...change}))
})
test('creative tabs retain visual markers and revision-safe saves, without comma timing inputs',()=>{
 const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
 for(const text of ['Рекламные ролики','Где вставляется','revision:revision.value','@pointerdown="drag','@keydown.left.prevent','Тест перехода','testTransition','/api/v1/playback/stop','/api/v1/playback/heartbeat'])assert.ok(view.includes(text),text)
 for(const text of ['Точные тайминги видео','Настроить показ','через запятую'])assert.ok(!view.includes(text),text)
})
