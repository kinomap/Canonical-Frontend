import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import ts from 'typescript'
const require=createRequire(import.meta.url), vue=require('vue')
const {renderToString}=require('vue/server-renderer')
const read=rel=>readFileSync(new URL(rel,import.meta.url),'utf8')
const cjs=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const filters={};vm.runInNewContext(cjs(read('../src/channelFilters.ts')),{exports:filters,require})
async function page(rows,filter='ACTIVE',restore=false){
 const {descriptor}=parse(read('../src/views/Telegram.vue'))
 const script=compileScript(descriptor,{id:'source-counts'})
 const template=compileTemplate({source:descriptor.template.content,filename:'Telegram.vue',id:'source-counts',compilerOptions:{bindingMetadata:script.bindings}})
 assert.deepEqual(template.errors,[])
 const calls=[]
 const req=n=>n==='vue'?vue:n==='axios'?{__esModule:true,default:{get:async()=>({data:rows}),post:async(url)=>{calls.push(url);return{data:{restored:1,missing:0}}}}}:n==='vue-router'?{useRouter:()=>({push(){}})}:n==='../toast'?{addToast(){}}:n==='../channelFilters'?filters:require(n)
 const sandbox={exports:{},require:req,localStorage:{getItem:()=>null,removeItem(){}},window:{setInterval:()=>1,clearInterval(){}},setInterval:()=>1,clearInterval(){}}
 vm.runInNewContext(cjs(script.content),sandbox)
 const tpl={exports:{}};vm.runInNewContext(cjs(template.code),{exports:tpl.exports,require:req})
 const base=sandbox.exports.default
 const component={...base,async setup(props,ctx){const b=base.setup(props,ctx);await b.fetchChannels();b.channelStatusFilter.value=filter;if(restore)await b.restoreNames();return b},render:tpl.exports.render}
 const app=vue.createSSRApp(component);app.config.warnHandler=()=>{}
 return {html:await renderToString(app),calls}
}
const series={channel_id:'-1002',name:'Лучшие Сериалы',username:'series',name_known:true,status:'ACTIVE',is_series_channel:true,current_movies:0,current_series:5,current_episodes:38,active_physical_resources:38}
const movie={channel_id:'-1001',name:'Кино 🍿',name_known:true,status:'ACTIVE',is_series_channel:false,current_movies:117,current_series:0,current_episodes:0,active_physical_resources:117}
test('Series channel renders five series and 38 episodes, not zero Current Movies',async()=>{const {html}=await page([series]);assert.match(html,/SERIES/);assert.match(html,/Сериалы/);assert.match(html,/>5</);assert.match(html,/>38</);assert.doesNotMatch(html,/Current Movies|>Фильмы</)})
test('Movie channel renders its 117 films',async()=>{const {html}=await page([movie]);assert.match(html,/MOVIE/);assert.match(html,/Фильмы/);assert.match(html,/>117</);assert.doesNotMatch(html,/>Сериалы</)})
test('Inactive named channels remain visible and inactive',async()=>{const {html}=await page([{...movie,name:'Сохранённое название',status:'DISABLED'}],'INACTIVE');assert.match(html,/Сохранённое название/);assert.match(html,/DISABLED/)})
test('Missing historical names have an honest fallback and explicit repair action',async()=>{const {html,calls}=await page([{...movie,name:null,name_known:false,status:'DISABLED'}],'INACTIVE',true);assert.match(html,/Название не сохранено/);assert.match(html,/Восстановить названия/);assert.deepEqual(calls,['/api/v1/admin/telegram/channels/restore-names'])})
test('Dashboard distinguishes combined titles, episode files and duplicate copies',()=>{const s=read('../src/views/Dashboard.vue');assert.match(s,/Активные произведения/);for(const field of ['telegram_active_movies','telegram_active_series','telegram_active_episodes','telegram_physical_resources_active'])assert.ok(s.includes(field));assert.doesNotMatch(s,/Active \(Unique Movies\)|Reset Total|@click="resetTotal"/);assert.match(s,/Дополнительные копии фильмов \/ эпизодов/)})
