import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const lib={}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/securityView.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:lib})
function samples(d){
 const tokens=d.match(/[MLQ]|-?\d+(?:\.\d+)?/g);const out=[];let i=0,x=0,y=0
 while(i<tokens.length){
  const command=tokens[i++]
  if(command==='M'){x=+tokens[i++];y=+tokens[i++];out.push([x,y]);continue}
  const oldX=x,oldY=y
  if(command==='L'){x=+tokens[i++];y=+tokens[i++];for(let j=1;j<=50;j++){const t=j/50;out.push([oldX+(x-oldX)*t,oldY+(y-oldY)*t])}}
  else if(command==='Q'){const cx=+tokens[i++],cy=+tokens[i++];x=+tokens[i++];y=+tokens[i++];for(let j=1;j<=50;j++){const t=j/50;out.push([(1-t)**2*oldX+2*(1-t)*t*cx+t*t*x,(1-t)**2*oldY+2*(1-t)*t*cy+t*t*y])}}
  else throw new Error('Unexpected command '+command)
 }
 return out
}
for(const count of [1,100])test(`media arcs bypass every unrelated card with ${count} nodes in both directions`,()=>{
 const nodes=[{id:'internet',layer:'external'},{id:'telegram',layer:'external'},{id:'spa',layer:'control'},{id:'pg',layer:'private'},...Array.from({length:count},(_,i)=>({id:`node-${i+1}`,layer:'media'}))]
 const {placed}=lib.layoutTopology(nodes)
 for(const source of ['internet','telegram'])for(let n=1;n<=count;n++)for(const reverse of [false,true]){
  const a=placed[reverse?`node-${n}`:source],b=placed[reverse?source:`node-${n}`]
  const route=lib.mediaEdgeRoute(a,b,n)
  assert.ok(route.my<94)
  for(const [x,y] of samples(route.d))for(const card of Object.values(placed)){
   assert.ok(!(x>card.x+.01&&x<card.x+card.w-.01&&y>card.y+.01&&y<card.y+card.h-.01),`arc entered ${card.id}`)
  }
 }
})
