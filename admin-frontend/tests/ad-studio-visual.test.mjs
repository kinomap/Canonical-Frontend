import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const studio=read('../src/views/AdStudio.vue'),app=read('../src/App.vue');
const sha=s=>createHash('sha256').update(s).digest('hex');
// This visual-only release deliberately preserves workflow code and every binding.
test('Ad Studio visual release preserves script and template contract',()=>assert.equal(sha(studio.split('<style scoped>')[0]),'f5cd9ed44f29702f2402cc54c147788126d6de7e3667d6587ee60c0d75ec34b2'));
test('Ad Studio sidebar theme preserves admin shell behavior',()=>assert.equal(sha(app.split('<style>')[0]),'8ebefcf398f9a3b8c31cb5dc0ed524213803413c5302aba4b96ef1e6045c6014'));
test('Ad Studio analytics keeps a readable internally scrolling table',()=>{assert.match(studio,/\.table-scroll>table\{min-width:800px/);assert.match(studio,/\.table-scroll\{[^}]*overflow-x:auto/)});
test('Ad Studio provides mobile scroll offsets and reduced-motion support',()=>{assert.match(studio,/scroll-margin-top:84px/);assert.match(studio,/prefers-reduced-motion:reduce/);assert.match(studio,/focus-visible/)});
test('New sidebar styles are confined to the Ad Studio route',()=>{const overrides=app.split('The reference sidebar theme is deliberately limited to Ad Studio.')[1];assert.ok(overrides);for(const selector of overrides.matchAll(/([^{}]+)\{/g)){const value=selector[1].trim();if(value.startsWith('@'))continue;assert.ok(value.includes('.admin-layout:has(.studio)'),value)}});
