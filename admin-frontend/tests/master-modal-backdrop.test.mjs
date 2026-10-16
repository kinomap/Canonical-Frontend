import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for (const [file, overlay] of [['MasterSession.vue','ms-overlay'], ['MasterReplacement.vue','mr-overlay']]) {
 test(`${file}: backdrop cannot dismiss the session form`, () => {
  const source=readFileSync(new URL(`../src/components/${file}`, import.meta.url),'utf8');
  const tag=source.match(new RegExp(`<div[^>]*class="${overlay}"[^>]*>`));
  assert.ok(tag); assert.doesNotMatch(tag[0], /@click|v-on:click|@keydown/);
  assert.match(source, /Отменить и закрыть|Cancel/);
 });
}
