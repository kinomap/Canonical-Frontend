import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const studio=read('../src/views/AdStudio.vue'),app=read('../src/App.vue');
const sha=s=>createHash('sha256').update(s).digest('hex');
// Reviewed baseline updated for storage readiness and in-dialog upload errors.
test('Ad Studio visual release preserves script and template contract',()=>assert.equal(sha(studio.split('<style scoped>')[0]),'ac74b263fa821be56b5587a7eaafdc7e59a30a473e0bc0b5aca722739418211b'));
test('Ad Studio sidebar theme preserves admin shell behavior',()=>assert.equal(sha(app.split('<style>')[0]),'8ebefcf398f9a3b8c31cb5dc0ed524213803413c5302aba4b96ef1e6045c6014'));
test('Ad Studio analytics keeps a readable internally scrolling table',()=>{assert.match(studio,/\.table-scroll>table\{min-width:800px/);assert.match(studio,/\.table-scroll\{[^}]*overflow-x:auto/)});
test('Ad Studio provides mobile scroll offsets and reduced-motion support',()=>{assert.match(studio,/scroll-margin-top:84px/);assert.match(studio,/prefers-reduced-motion:reduce/);assert.match(studio,/focus-visible/)});
test('Admin-wide theme replaces the former route-only sidebar',()=>{assert.match(app,/@import '.\/admin-theme.css'/);assert.doesNotMatch(app,/admin-layout:has/)});
