import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/views/Audience.vue',import.meta.url),'utf8')
const router=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')
test('audience is private and authenticated, with explicit version mismatch errors',()=>{
 assert.match(router,/path:\s*['"]\/audience['"]/);assert.match(router,/Audience\.vue/)
 assert.match(source,/\/api\/v1\/admin\/audience/);assert.match(source,/Authorization:/);assert.match(source,/headers:\s*headers\(\)/)
 assert.match(source,/status === 404/);assert.match(source,/данные не подменяются пустым списком/)
})
test('queue uses a fresh preview and explicit confirmation with an audience guard',()=>{
 assert.match(source,/campaigns\/\$\{c\.id\}\/preview/);assert.match(source,/confirmAction\.value =/)
 assert.match(source,/confirm:\s*true,\s*expected_audience:\s*p.total/)
 assert.doesNotMatch(source,/onMounted\([^\n]*queue/)
})
test('human registry, plan checkboxes, catalog selection and visual buttons replace raw JSON',()=>{
 assert.match(source,/crm \+ '\/modules'/);assert.match(source,/type="checkbox" :value="m.code"/)
 assert.match(source,/\/genres/);assert.match(source,/movieMatches/);assert.match(source,/campaign.buttons.push/)
 assert.doesNotMatch(source,/JSON\.parse|is_vip|<select[^>]*multiple/)
 assert.match(source,/max_redemptions/)
})
test('safe Telegram preview, user controls and subscription lifecycle are visible',()=>{
 assert.doesNotMatch(source,/v-html/)
 for(const label of ['Пользователи','Сегменты и рассылки','Подписки, модули и контент','Бессрочно','Сбросить все сессии','Причина блокировки','Тестовая отправка себе'])assert.ok(source.includes(label),label)
 assert.match(source,/can_send_telegram_msg/);assert.match(source,/maxlength="3500"/)
 assert.match(source,/role="dialog"/);assert.match(source,/role="alert"/)
})
test('plan writes whitelist editable fields, cloning entitlement selection',()=>{
 assert.match(source,/p \? \{ code: p.code, title: p.title/)
 assert.match(source,/entitlements: \[\.\.\.p.entitlements\]/)
 assert.doesNotMatch(source,/plan.value\s*=\s*\{\s*\.\.\.p[,}]/)
})
test('single PRO tariff: 1/6/12-month periods, shared modules incl. feature:no_ads, no legacy Premium card',()=>{
 assert.match(source,/PRO_CODES = \['pro_1m', 'pro_6m', 'pro_12m'\]/)
 assert.match(source,/v-for="p in visiblePlans"/);assert.doesNotMatch(source,/v-for="p in plans"/)
 assert.match(source,/const activePlans = computed\(\(\) => visiblePlans\.value\.filter/)
 assert.match(source,/toggleProRight\(m\.code/);assert.match(source,/for \(const p of proPlans\.value\)/)
 assert.ok(source.includes('Возможности тарифа PRO'));assert.doesNotMatch(source,/Только Premium/)
 assert.match(source,/v-if="!proPlans\.length" class="primary" @click="editPlan\(\)"/)
})
test('torrent stream access switch is persisted on the backend, PRO-only by default',()=>{
 assert.match(source,/base \+ '\/platform-settings'/);assert.match(source,/torrents_public: value/)
 assert.ok(source.includes('Доступ к торрент-стримам'));assert.ok(source.includes('Только подписчикам PRO'));assert.ok(source.includes('Доступно всем пользователям (Free)'))
 assert.match(source,/:checked="torrentsPublic === false"/);assert.match(source,/:disabled="busy \|\| torrentsPublic === null"/)
})
