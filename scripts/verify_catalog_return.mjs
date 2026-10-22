import fs from 'node:fs';
const pages=await(await fetch(`http://127.0.0.1:${process.env.QA_CDP}/json/list`)).json();const ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let seq=0;const pending=new Map(),errors=[],proof=[];ws.onmessage=e=>{let x=JSON.parse(e.data);if(x.id){let p=pending.get(x.id);if(p){pending.delete(x.id);x.error?p.j(Error(x.error.message)):p.r(x.result)}}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text)};function call(method,params={}){return new Promise((r,j)=>{const id=++seq;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);j(Error(method+' timeout'))}},45000).unref()})}async function ev(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}const pause=t=>new Promise(r=>setTimeout(r,t));async function wait(expr){for(let i=0;i<150;i++){if(await ev(expr))return;await pause(200)}throw Error('Timeout '+expr)}
const out=process.env.QA_EVIDENCE+'/candidate-navigation';fs.mkdirSync(out,{recursive:true});await call('Page.enable');await call('Runtime.enable');
try {
 for(const width of [1440,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
  await call('Page.navigate',{url:process.env.QA_ORIGIN+'/movies?page=2&sort=rating'});
  await wait(`!!document.querySelector('.catalog-page[data-catalog-ready="true"] .movie-card')`);
  await ev('document.fonts.ready');await pause(600);
  const index=width===390?6:12;
  await ev(`document.querySelectorAll('.movie-card')[${index}].scrollIntoView({block:'center'})`);await pause(400);
  const before=await ev(`({url:location.pathname+location.search,y:scrollY,ids:[...document.querySelectorAll('.movie-card')].map(e=>e.dataset.id),page:document.querySelector('.page-info')?.textContent})`);
  if(before.y<100)throw Error('Not sufficiently scrolled');
  for(const method of ['link','native','reload']){
   await ev(`document.querySelectorAll('.movie-card')[${index}].click()`);
   await wait(`!!document.querySelector('.back-link')&&!document.querySelector('.catalog-page')`);await pause(500);
   if(method==='reload'){await call('Page.reload');await wait(`!!document.querySelector('.back-link')`);await pause(400)}
   if(method==='native')await ev('history.back()');else await ev(`document.querySelector('.back-link').click()`);
   await wait(`location.pathname+location.search===${JSON.stringify(before.url)}&&!!document.querySelector('.catalog-page[data-catalog-ready="true"] .movie-card')`);
   await wait(`Math.abs(scrollY-${before.y})<=3`);await pause(250);
   const after=await ev(`({url:location.pathname+location.search,y:scrollY,ids:[...document.querySelectorAll('.movie-card')].map(e=>e.dataset.id),page:document.querySelector('.page-info')?.textContent})`);
   if(JSON.stringify(before.ids)!==JSON.stringify(after.ids))throw Error('Card/page mismatch');
   proof.push({width,method,before,after});console.log(JSON.stringify({width,method,beforeY:before.y,afterY:after.y,url:after.url}));
  }
  const shot=await call('Page.captureScreenshot',{format:'jpeg',quality:65});fs.writeFileSync(out+'/restored-'+width+'.jpg',Buffer.from(shot.data,'base64'));
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(out+'/proof.json',JSON.stringify({proof,errors},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws.close();if(errors.length)process.exitCode=1}
