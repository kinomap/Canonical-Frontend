import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
test('Ad Studio has library, per-video editor and global rules',()=>{for(const s of ['creatives','timeline','rules','Pre-roll','Mid-roll','Post-roll','Ротация активных','Индивидуальные настройки'])assert.ok(view.includes(s),s)})
test('Direct upload uses only a node-scoped token and confirms signed metadata',()=>{for(const s of ["base+'/creatives/upload-ticket'","base+'/creatives/upload-complete'",'axios.put(url,f','104857600','withCredentials:false',"status:'active'",'sha256','nodeMediaUrl(t.upload_url)'])assert.ok(view.includes(s),s);assert.ok(!view.includes("base+'/creatives/upload'"))})
test('Timeline preserves revisions and explicit inheritance; preview releases leases',()=>{for(const s of ['revision:revision.value','Наследовать глобальное правило','/api/v1/playback/stop','/api/v1/playback/heartbeat','onBeforeUnmount','crypto.getRandomValues'])assert.ok(view.includes(s),s)})
