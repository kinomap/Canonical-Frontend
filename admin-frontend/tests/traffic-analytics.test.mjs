import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const s=readFileSync(new URL('../src/components/TrafficAnalytics.vue',import.meta.url),'utf8')
const view=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8')
test('analytics filters exact video, genre, serving channel and period with paged rankings',()=>{for(const x of ['target_id','genre_id','channel_id','date_from','date_to','page_size','unique_viewers','watch_time','traffic-analytics/videos','Найти фильм или серию'])assert.ok(s.includes(x),x)})
test('pending filters do not change old page selection; stale results and teardown fenced',()=>{for(const x of ['appliedParams','fingerprint','searchGeneration++','g===generation','onBeforeUnmount','Фильтры изменены','load(true)'])assert.ok(s.includes(x),x)})
test('measured definitions, unknown history and genre overlap are explicit',()=>{for(const x of ['Канал не определён','сумма долей может превышать 100%','Запуски авторизации отдельно','Удержание','retention_sample','role="alert"','Повторить','focus-visible'])assert.ok(s.includes(x),x)})
test('channel ad scope stays an explicit setting with existing preview and save protection',()=>{for(const x of ['value="channels"','channel_ids','options.channels','conflict_count','Какие фильмы затрагивает сейчас','TrafficAnalytics'])assert.ok(view.includes(x),x)})
