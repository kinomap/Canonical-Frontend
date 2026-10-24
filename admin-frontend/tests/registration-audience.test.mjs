import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const helper=readFileSync(new URL('../../frontend/src/utils/registrationError.ts',import.meta.url),'utf8')
const sandbox={exports:{}};vm.runInNewContext(ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox)
for(const [status,expected] of [[409,'REGISTRATION_UNAVAILABLE'],[422,'REGISTRATION_INVALID'],[429,'REGISTRATION_RATE_LIMIT'],[500,'REGISTRATION_SERVICE_UNAVAILABLE'],[undefined,'REGISTRATION_SERVICE_UNAVAILABLE']])test('registration error '+status,()=>assert.equal(sandbox.exports.registrationErrorCode(status),expected))
test('registration displays fixed translated code rather than leaking raw errors',()=>{
 const register=readFileSync(new URL('../../frontend/src/views/RegisterView.vue',import.meta.url),'utf8');assert.match(register,/error.value = registrationErrorCode\(err\?\.status\)/)
 const dictionary=readFileSync(new URL('../../frontend/src/i18n.ts',import.meta.url),'utf8');assert.match(dictionary,/REGISTRATION_UNAVAILABLE:/);assert.match(dictionary,/Логин или email уже используется/)
})
test('staff registry has no audience action buttons',()=>{
 const view=readFileSync(new URL('../src/views/Audience.vue',import.meta.url),'utf8');const staff=view.split('class="panel staff-registry"')[1].split('</section>')[0]
 assert.match(view,/crm\+'\/administrators'/);assert.match(staff,/Администрирование · не зритель/);assert.doesNotMatch(staff,/extendUser|setAccount|openUser|revoke\(/)
 assert.doesNotMatch(view,/Реальные аккаунты, включая администраторов/)
})
