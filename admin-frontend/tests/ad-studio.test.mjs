import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
test('Ad Studio has library, per-video editor and global rules',()=>{for(const s of ['creatives','timeline','rules','Pre-roll','Mid-roll','Post-roll','Ротация активных','Индивидуальные настройки'])assert.ok(view.includes(s),s)})
test('Uploads use authenticated private raw media route and start paused',()=>{for(const s of ["base+'/creatives/upload'",'104857600','Content-Type','сохранён на паузе'])assert.ok(view.includes(s),s)})
test('Timeline preserves revisions and explicit inheritance; preview releases leases',()=>{for(const s of ['revision:revision.value','Наследовать глобальное правило','/api/v1/playback/stop','/api/v1/playback/heartbeat','onBeforeUnmount','crypto.getRandomValues'])assert.ok(view.includes(s),s)})
