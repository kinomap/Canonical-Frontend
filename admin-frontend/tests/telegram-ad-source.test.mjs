import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync(new URL('../src/views/Telegram.vue',import.meta.url),'utf8');
test('Ad Source is selectable in add and edit Telegram source dialogs',()=>{
 assert.equal(source.split('Канал с рекламными роликами (Ad Source)').length-1,2);
 assert.match(source,/is_ad_channel: newChannelIsAd.value/);
 assert.match(source,/is_ad_channel: editingIsAd.value/);
 assert.match(source,/AD SOURCE/);assert.match(source,/channel.current_ads/);
});
test('Approved AdStudio UI A/B/V/G is byte-identical to pre-Telegram integration',()=>{
 const path='admin-frontend/src/views/AdStudio.vue';
 const previous=execFileSync('git',['show','3f8077e31ae34f130aacd28b3bc25b957d506d19:'+path],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
 assert.equal(readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8'),previous);
});
