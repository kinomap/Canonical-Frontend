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
 // Only reviewed channel radio/panel and observed-popularity copy may differ. Schedule, timing and writers stay byte-identical.
 const block=s=>s.slice(s.indexOf('<p class="eyebrow">Б ·'),s.indexOf('</form>'));
 assert.ok(block(previous).length>1000);assert.equal(block(current).replace("<label class=\"check\"><input type=\"radio\" v-model=\"definition.reach.mode\" value=\"channels\" />Контент из выбранных каналов</label>",'').replace("     <div v-if=\"definition.reach.mode==='channels'\"><p class=\"muted\">Реклама на фильмах и сериях с активным источником хотя бы в одном выбранном канале. Фильм с несколькими источниками учитывается один раз. Охват обновляется автоматически с новыми доступными записями; чужие размещения защищены.</p><div class=\"genre-list\"><label class=\"check\" v-for=\"c in options.channels\" :key=\"c.id\"><input type=\"checkbox\" :value=\"c.id\" v-model=\"definition.reach.channel_ids\" />{{c.name}}{{c.active?'':' · канал выключен, показ не идёт'}}</label></div><p v-if=\"!options.channels?.length\" class=\"muted\">Нет каналов контента. Рекламные каналы не являются сегментами.</p></div>\n",'').replace('Автовыбор по фактическим просмотрам за 30 дней.','Автовыбор по запускам за 30 дней.'),block(previous));
 for(const name of ['save','resetPlacements','toggleUnlimited','checkDraft']) {
   const extract=s=>s.match(new RegExp('(?:async )?function '+name+'\\([^\\n]+'))?.[0];
   assert.ok(extract(previous));assert.equal(extract(current),extract(previous));
 }
 assert.ok(current.includes('Загрузить на Media Node')&&current.includes('/media-sync'));

});

test('Telegram source cards require explicit disk installation before the unchanged editor',()=>{
 const s=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');
 assert.ok(s.includes('<article v-for="c in creatives"'));
 assert.ok(s.includes('!analyticsMode&&editorUnlocked&&passport&&definition'));
 assert.ok(s.includes("diskStatus.value?.can_manage===true"));
 assert.ok(s.includes('Открыть ролик →')&&s.includes('Удалить с Media Node'));
 assert.ok(s.includes('Карточка и оригинал в Telegram останутся'));
 assert.ok(s.includes("result?.pending_nodes?.length"));
 assert.ok(!s.includes('Расписание можно настроить и сохранить уже сейчас'));
});

test('Telegram originals and installed media use separate preview routes in a shared detail player',()=>{
 const s=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');
 assert.ok(s.includes("?'source-preview':'preview'"));
 const fn=s.slice(s.indexOf('async function previewSource'),s.indexOf('const snapshot'));
 assert.ok(!fn.includes('media-sync')&&!fn.includes('media_requested'));
 assert.ok(s.includes('<AdMediaPreview v-if="sourcePreviews[cid]"'));
 const player=readFileSync(new URL('../src/components/AdMediaPreview.vue',import.meta.url),'utf8');
 assert.ok(player.includes('controls playsinline')&&player.includes('20000')&&player.includes('onBeforeUnmount(clear)'));
 assert.ok(s.includes('download_total_bytes')&&s.includes('transfer_phase')&&s.includes('<progress'));
 assert.ok(s.includes('← Все ролики')&&s.includes('v-if="!cid&&!analyticsMode"'));
});
