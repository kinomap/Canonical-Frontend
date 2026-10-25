import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/MasterReplacement.vue',import.meta.url),'utf8');
test('Auth UI exposes App type and real timeout, without claiming receipt',()=>{
 assert.match(source,/тип: SentCodeTypeApp/);assert.match(source,/SentCodeTypeSms/);
 assert.match(source,/Таймаут Telegram/);assert.match(source,/next_send_timeout == null/);
 assert.match(source,/Получение сообщения НЕ подтверждено/);assert.match(source,/d\.error_type/);
});
