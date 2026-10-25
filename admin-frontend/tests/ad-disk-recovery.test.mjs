import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
const ast=ts.createSourceFile('ad.ts',source,ts.ScriptTarget.Latest,true);
function harness(respond){
 const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['syncMedia','pollSources','refreshDiskStatus','loadLibrary','loadSources','message'].includes(n.name.text)).map(n=>n.getText(ast)).join('\n');
 const ref=v=>({value:v});
 const context={base:'/api/v1/admin/ads',cid:ref('clip'),selectedCreative:ref({telegram_channel_id:'-100123'}),busy:ref(false),manageableCreatives:ref([]),async stopPreview(){},syncBusy:ref(false),error:ref(''),notice:ref(''),diskStatus:ref(null),previewUrl:ref(''),creatives:ref([]),sources:ref([]),analyticsMode:ref(false),disposed:false,polling:false,document:{hidden:false},calls:[],definition:ref({schedule:{preserved:true}}),baseline:ref('original'),passport:ref({title:'Unsaved edit'}),async refreshCreativePreview(){context.previewUrl.value='https://node.example/ads/clip'},async selectCreative(){throw Error('Must not reset selected form')},async request(path,method='GET',data){context.calls.push({path,method,data});return respond(path,method,data)}};
 vm.createContext(context);vm.runInContext(ts.transpileModule(funcs,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return context;
}
test('Retry only requests disk sync; unsaved passport and schedule remain untouched',async()=>{
 const h=harness(()=>({state:'pending',nodes:[]}));await h.syncMedia();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'POST');assert.ok(h.calls[0].path.endsWith('/clip/media-sync'));
 assert.equal(h.passport.value.title,'Unsaved edit');assert.equal(h.definition.value.schedule.preserved,true);assert.equal(h.baseline.value,'original');assert.equal(h.syncBusy.value,false);
});
test('Background status polling exposes access failure without resetting settings',async()=>{
 const h=harness(p=>p.endsWith('media-status')?{state:'error',nodes:[{error_code:'telegram_access'}]}:[]);h.previewUrl.value='stale';await h.pollSources();
 assert.equal(h.diskStatus.value.state,'error');assert.equal(h.previewUrl.value,'');assert.equal(h.passport.value.title,'Unsaved edit');assert.equal(h.baseline.value,'original');assert.ok(h.calls.every(c=>c.method==='GET'));assert.ok(!h.calls.some(c=>c.path.endsWith('/settings')));
});
test('Only confirmed disk readiness enables preview and failed retry remains actionable',async()=>{
 const h=harness(()=>({state:'ready',can_manage:true,nodes:[]}));await h.refreshDiskStatus();assert.ok(h.previewUrl.value);
 h.request=async()=>{throw {response:{data:{detail:'No eligible Media Node'}}}};await h.syncMedia();assert.equal(h.error.value,'No eligible Media Node');assert.equal(h.syncBusy.value,false);assert.equal(h.definition.value.schedule.preserved,true);
});
