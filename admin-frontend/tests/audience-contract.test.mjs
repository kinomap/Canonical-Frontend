import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/views/Audience.vue',import.meta.url),'utf8')
const router=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')

test('audience is a private admin route with authenticated API requests',()=>{
 assert.match(router,/path:\s*['"]\/audience['"]/)
 assert.match(router,/Audience\.vue/)
 assert.match(source,/\/api\/v1\/admin\/audience/)
 assert.match(source,/Authorization:/)
 assert.match(source,/headers:headers\(\)/)
})
test('campaign queue requires fresh frozen-audience preview and human confirmation',()=>{
 assert.match(source,/campaigns\/\$\{c\.id\}\/preview/)
 assert.match(source,/window\.confirm/)
 assert.match(source,/confirm:true,expected_audience:count/)
 assert.doesNotMatch(source,/onMounted\([^\n]*queue/)
})
test('arbitrary entitlement registry and plans are editable without VIP hardcode',()=>{
 assert.match(source,/config_json:JSON\.parse/)
 assert.match(source,/\/entitlements\/\$\{encodeURIComponent/)
 assert.match(source,/\/plans\/\$\{encodeURIComponent/)
 assert.match(source,/max_redemptions/)
 assert.doesNotMatch(source,/is_vip/)
})
test('campaign markup is not injected into the admin DOM and operational states are visible',()=>{
 assert.doesNotMatch(source,/v-html/)
 for(const label of ['Пользователи','Сегменты и рассылки','Подписки и права'])assert.ok(source.includes(label))
 assert.match(source,/deliveries/)
 assert.match(source,/worker/)
 assert.match(source,/bot_blocked_at|can_send_telegram_msg/)
})

test('editing an existing plan strips read-only response fields from the strict write body',()=>{
 assert.doesNotMatch(source,/plan=\{\.\.\.p,/)
 assert.match(source,/plan=\{code:p.code,title:p.title/)
})
