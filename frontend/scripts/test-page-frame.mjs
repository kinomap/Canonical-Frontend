// Offline layout regression against the real production bundle. No real accounts,
// browser profiles or VPS access. Run `npm run build && npm run test:layout`.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
const root=path.resolve('dist'), out=path.resolve(process.env.LAYOUT_EVIDENCE||os.tmpdir()+'/kinosota-layout-proof')
fs.mkdirSync(out,{recursive:true});assert(fs.existsSync(root+'/index.html'),'Build public frontend first')
const states=(process.env.LAYOUT_STATES||'content,empty,error').split(',');assert(states.every(x=>['content','empty','error'].includes(x)))
let mode='content';const genres=Array.from({length:9},(_,i)=>({id:i+1,name:'Жанр '+(i+1),slug:'genre-'+(i+1)}))
const movie={id:'layout-fixture',title:'Тестовая карточка',original_title:'Layout fixture',year:2026,poster:null,rating:8,runtime:120,quality:'1080p',status:'available',genres:[genres[0]],overview:'Локальный макет без реальных данных.',backdrop:null,tmdb_id:null,mime_type:null,file_size:null}
const items=()=>mode==='empty'?[]:Array.from({length:24},(_,i)=>({...movie,id:'fixture-'+i}))
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(req.method!=='GET'){res.writeHead(405).end();return}
 if(u.pathname.startsWith('/api/')){
  let status=200,data
  if(u.pathname.endsWith('/auth/me')){status=401;data={detail:'Unauthorized'}}
  else if(mode==='error'){status=503;data={detail:'Fixture unavailable'}}
  else if(u.pathname.endsWith('/genres'))data=mode==='empty'?[]:genres
  else if(u.pathname.endsWith('/movies/home')||u.pathname.endsWith('/series/home'))data={hero:null,newest:items(),popular:[],top_rated:[],by_year:[],by_genre:[]}
  else if(u.pathname.endsWith('/movies')||u.pathname.endsWith('/series'))data={items:items(),total:items().length,page:1,page_size:24,total_pages:1}
  else if(u.pathname.includes('/genres/'))data={genre:genres[0],items:items(),total:items().length,movies_total:items().length,series_total:0,page:1,page_size:24,total_pages:1}
  else if(u.pathname.endsWith('/layout-fixture'))data={...movie,seasons:[],episodes:[],seasons_count:0,episodes_count:0}
  else if(u.pathname.endsWith('/latest-check'))data={total:24,latest_created_at:null}
  else if(u.pathname.endsWith('/audio')||u.pathname.endsWith('/comments'))data=[]
  else {status=404;data={detail:'Fixture not found'}}
  setTimeout(()=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))},250);return
 }
 const requested=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!requested.startsWith(root+path.sep)&&requested!==root){res.writeHead(403).end();return}
 const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:root+'/index.html'
 const type={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(fs.readFileSync(file))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const profile=fs.mkdtempSync(os.tmpdir()+'/kinosota-layout-chrome-'), chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;const pending=new Map();let seq=0;const proof=[],errors=[]
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method))}},15000).unref()})}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function wait(expression){for(let i=0;i<100;i++){if(await ev(expression))return;await pause(30)}throw Error('Missing DOM: '+expression)}
const measure=`(()=>{const b=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {path:location.pathname,header:b('.header-container'),page:b('#main-content > *'),poster:b('.rail-item,.movie-grid > :first-child'),client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}})()`
try{
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){assert(i<100,'Chrome did not start');await pause(50)}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
 ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);if(p){pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text)}
 await call('Page.enable');await call('Runtime.enable')
 for(const width of [320,390,768,1024,1440,1920]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
  for(mode of states){
   let baseline,posterWidth
   for(const route of ['/','/movies','/series','/genres','/discover','/movies/layout-fixture','/series/layout-fixture','/login','/register']){
    await call('Page.navigate',{url:origin+route});await wait(`location.pathname===${JSON.stringify(route)}&&!!document.querySelector('.header-container')&&!!document.querySelector('#main-content > *')`)
    const loading=await ev(measure);await pause(600);const settled=await ev(measure)
    baseline??=settled.header
    for(const m of [loading,settled]){
     for(const k of ['x','width','height'])assert(Math.abs(m.header[k]-baseline[k])<1,JSON.stringify({kind:'header shift',width,mode,route,baseline,measurement:m}))
     assert(m.scroll<=m.client+1,JSON.stringify({kind:'horizontal overflow',width,mode,route,measurement:m}))
     if(!['/login','/register'].includes(route))for(const k of ['x','width'])assert(Math.abs(m.page[k]-m.header[k])<1,JSON.stringify({kind:'frame mismatch',width,mode,route,measurement:m}))
    }
    if(mode==='content'&&route==='/'&&settled.poster)posterWidth=settled.poster.width
    if(mode==='content'&&['/movies','/series'].includes(route)&&posterWidth!==undefined){assert(settled.poster,'Missing populated poster grid');assert(Math.abs(settled.poster.width-posterWidth)<1,JSON.stringify({kind:'poster rhythm mismatch',width,route,posterWidth,actual:settled.poster.width}))}
    proof.push({width,mode,route,header:settled.header,page:settled.page,poster:settled.poster})
    if(mode==='content'&&route==='/movies'&&[390,1440].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/movies-'+width+'.png',Buffer.from(shot.data,'base64'))}
   }
   // Also follow real Vue Router navigation without a document reload.
   for(const target of ['/movies','/series','/genres','/']){await ev(`document.querySelector('a[href="${target}"]').click()`);await wait(`location.pathname===${JSON.stringify(target)}`);await pause(350);const m=await ev(measure);for(const k of ['x','width','height'])assert(Math.abs(m.header[k]-baseline[k])<1,'SPA navigation shifted header')}
   // Force short/long page transitions without changing viewport or route.
   const before=await ev(measure);await ev(`(()=>{const d=document.createElement('div');d.id='qa-long';d.style.height='3000px';document.body.append(d)})()`);const long=await ev(measure);await ev(`document.querySelector('#qa-long').remove()`)
   for(const k of ['x','width'])assert(Math.abs(before.header[k]-long.header[k])<1,'Scrollbar moved header')
  }
 }
 assert.equal(errors.length,0,'Unhandled browser exceptions: '+errors.join(','))
 fs.writeFileSync(out+'/proof.json',JSON.stringify({measurements:proof,unhandled_errors:errors,offline_only:true},null,2));console.log(JSON.stringify({passed:true,route_state_viewport_cases:proof.length,widths:[320,390,768,1024,1440,1920],states:['loading',...states],scrollbar_transitions:6*states.length,spa_transitions:24*states.length,unhandled_errors:0}))
}finally{if(ws)ws.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));await pause(200);fs.rmSync(profile,{recursive:true,force:true})}
