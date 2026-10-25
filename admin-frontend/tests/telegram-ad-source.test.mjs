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
test('Approved schedule/reach/timing blocks and mutation functions remain byte-identical',()=>{
 const path='admin-frontend/src/views/AdStudio.vue';
 const previous=execFileSync('git',['show','3f8077e31ae34f130aacd28b3bc25b957d506d19:'+path],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
 const current=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');
 // New source inventory and disk delivery panel are additive. B/V/G is unchanged.
 const block=s=>s.slice(s.indexOf('<p class="eyebrow">Б ·'),s.indexOf('</form>'));
 assert.ok(block(previous).length>1000);assert.equal(block(current),block(previous));
 for(const name of ['save','resetPlacements','toggleUnlimited','checkDraft']) {
   const extract=s=>s.match(new RegExp('(?:async )?function '+name+'\\([^\\n]+'))?.[0];
   assert.ok(extract(previous));assert.equal(extract(current),extract(previous));
 }
 assert.ok(current.includes('Загрузить на Media Node')&&current.includes('/media-sync'));

});

test('Telegram source cards require explicit disk installation before the unchanged editor',()=>{
 const s=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');
 assert.ok(s.includes('<article v-for="c in telegramCreatives"'));
 assert.ok(s.includes('!analyticsMode&&editorUnlocked&&passport&&definition'));
 assert.ok(s.includes("diskStatus.value?.can_manage===true"));
 assert.ok(s.includes('Настроить рекламу →')&&s.includes('Удалить с Media Node'));
 assert.ok(s.includes('Карточка и оригинал в Telegram останутся'));
 assert.ok(s.includes("result?.pending_nodes?.length"));
 assert.ok(!s.includes('Расписание можно настроить и сохранить уже сейчас'));
});

test('Telegram source preview is independent of install and remains on the source card',()=>{
 const s=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');
 assert.ok(s.includes('/source-preview')&&s.includes('<video v-if="sourcePreviews[c.id]"'));
 const fn=s.slice(s.indexOf('async function previewSource'),s.indexOf('function sourcePreviewFailed'));
 assert.ok(!fn.includes('media-sync')&&!fn.includes('media_requested'));
 assert.ok(s.includes('controls playsinline preload="metadata"'));
});
