import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
test('One creative tab contains its entire lifecycle and separate measured analytics',()=>{for(const s of ['role="tablist"','role="tabpanel"','Удалить рекламный ролик','Расписание показа этого ролика','Где показывать этот ролик','Какие фильмы затрагивает сейчас','Аналитика трафика','Сохранить настройки ролика'])assert.ok(view.includes(s),s)})
test('Direct upload only to Media Node; backend receives signed metadata',()=>{for(const s of ['upload-ticket','upload-complete','axios.put(url,f','104857600','withCredentials:false',"status:'active'",'sha256','nodeMediaUrl(t.upload_url)'])assert.ok(view.includes(s),s);assert.ok(!view.includes("base+'/creatives/upload'"))})
test('Conflicts disable saving; owner-only detach, confirmation and lease cleanup',()=>{for(const s of ['conflict_count','revision:revision.value','?confirm=true','/targets/','/api/v1/playback/stop','/api/v1/playback/heartbeat','modalKey','onBeforeUnmount'])assert.ok(view.includes(s),s)})
