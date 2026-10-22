import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const src=readFileSync(new URL('../src/utils/adPlacement.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
const {nodeMediaUrl,placementBody}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const draft=()=>({creative_id:'creative',where:'videos',targets:[{kind:'movie',id:'1',title:'Test'}],scope:'all',genre_id:null,preroll:true,postroll:false,minutes:0,exact:''})
test('media fail closed: only exact HTTPS Media Node; no backend, self, blob, arbitrary HTTPS or credentials',()=>{
 assert.equal(new URL(nodeMediaUrl('https://node-1.scenrix.com/ads/1?token=x')).origin,'https://node-1.scenrix.com')
 for(const u of ['http://node-1.scenrix.com/a','https://node-1.scenrix.com.evil.test/a','https://watch.scenrix.com/a','http://10.8.0.1:8888/video','blob:https://node-1.scenrix.com/1','https://user@node-1.scenrix.com/a','/api/video'])assert.throws(()=>nodeMediaUrl(u))
})
test('all admin CSP variants allow ONLY Media Node for video without altering script policy',()=>{
 const nginx=readFileSync(new URL('../../nginx.admin-only.conf',import.meta.url),'utf8')
 const lines=nginx.split('\n').filter(x=>x.includes('Content-Security-Policy'));assert.equal(lines.length,3)
 for(const s of lines){assert.equal(s.match(/media-src ([^;]+);/)[1],'https://node-1.scenrix.com');assert.ok(s.includes("script-src 'self';"));assert.ok(s.includes("frame-ancestors 'none'"))}
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
test('two modes, visual markers and revision-safe save replace four tabs and comma timings',()=>{
 const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
 for(const text of ['Ролики и авто-правила','Визуальная студия таймингов','revision:revision.value','@pointerdown="drag','@keydown.left.prevent','Тест перехода','testTransition','/api/v1/playback/stop','/api/v1/playback/heartbeat'])assert.ok(view.includes(text),text)
 for(const text of ['Точные тайминги видео','Настроить показ','через запятую'])assert.ok(!view.includes(text),text)
})
