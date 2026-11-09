import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import ts from 'typescript'
const src=readFileSync(new URL('../src/utils/adPlacement.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
const {nodeMediaUrl,placementBody}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
// nginx.admin-only.conf sits next to package.json; '../../' keeps the monorepo layout (config one level above the app) working
const nginxConf=['../nginx.admin-only.conf','../../nginx.admin-only.conf'].map(p=>new URL(p,import.meta.url)).find(u=>existsSync(u))
const draft=()=>({creative_id:'creative',where:'videos',targets:[{kind:'movie',id:'1',title:'Test'}],scope:'all',genre_id:null,preroll:true,postroll:false,minutes:0,exact:''})
const NOT_MEDIA_NODE=/адрес не принадлежит Media Node/
test('media fail closed: only HTTPS Media Nodes *.scenrix.com; no control plane, backend, self, blob, data, spoofed hosts, ports or credentials',()=>{
 for(const u of ['https://node-1.scenrix.com/ads/1?token=x','https://tg-node-1.scenrix.com/ads/1?token=x','https://torrent-node-1.scenrix.com/ads/1?token=x'])assert.equal(nodeMediaUrl(u),u)
 assert.equal(nodeMediaUrl('https://TG-Node-1.Scenrix.com:443/ads/1'),'https://tg-node-1.scenrix.com/ads/1')
 for(const u of ['https://watch.scenrix.com/a','https://WATCH.scenrix.com/a','https://watch.scenrix.com./a','https://scenrix.com/a','http://tg-node-1.scenrix.com/a','http://node-1.scenrix.com/a','https://node-1.scenrix.com.evil.test/a','https://evilscenrix.com/a','https://user:pass@tg-node-1.scenrix.com/a','https://user@node-1.scenrix.com/a','https://:pass@tg-node-1.scenrix.com/a','https://tg-node-1.scenrix.com:8443/a','blob:https://tg-node-1.scenrix.com/1','data:video/mp4;base64,AAAA','http://10.8.0.1:8888/video','https://10.8.0.1/video','https://localhost/video','http://backend/video','https://backend/video'])assert.throws(()=>nodeMediaUrl(u),NOT_MEDIA_NODE,u)
 for(const u of ['/api/video','api/video',''])assert.throws(()=>nodeMediaUrl(u),Error,u)
})
test('all admin CSP variants allow ONLY Media Nodes (*.scenrix.com) for video and direct uploads without altering script policy',()=>{
 assert.ok(nginxConf,'nginx.admin-only.conf not found')
 const nginx=readFileSync(nginxConf,'utf8')
 const lines=nginx.split('\n').filter(x=>x.includes('Content-Security-Policy'));assert.equal(lines.length,3)
 for(const s of lines){
  assert.equal(s.match(/media-src ([^;]+);/)[1],'https://*.scenrix.com https://node-1.scenrix.com')
  const connect=s.match(/connect-src ([^;]+);/)[1].split(' ')
  for(const origin of ["'self'",'https://*.scenrix.com','https://node-1.scenrix.com'])assert.ok(connect.includes(origin),origin)
  assert.ok(s.includes("script-src 'self';"));assert.ok(s.includes("frame-ancestors 'none'"))
 }
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
