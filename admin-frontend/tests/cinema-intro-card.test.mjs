import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const card=read('../src/components/CinemaIntroCard.vue'),studio=read('../src/views/AdStudio.vue');
test('Ad Studio mounts the prestart intro card only on the library screen',()=>{
 assert.match(studio,/import CinemaIntroCard from '\.\.\/components\/CinemaIntroCard\.vue'/);
 assert.match(studio,/<CinemaIntroCard v-if="!cid&&!analyticsMode" \/>/);
});
test('Intro card talks only to the admin intro endpoint with all CRUD verbs',()=>{
 assert.match(card,/const endpoint = '\/api\/v1\/admin\/cinema\/intro'/);
 for(const verb of ['get','post','patch','delete'])assert.match(card,new RegExp('axios\\.'+verb+'(<[^>]+>)?\\(endpoint'));
});
test('Intro card validates type and size client-side before uploading',()=>{
 assert.match(card,/video\/mp4', 'video\/webm'/);
 assert.match(card,/file\.size > maxBytes\.value/);
 assert.match(card,/form\.append\('video', file, file\.name\)/);
});
test('Intro card polls while the server transcodes and stops polling afterwards',()=>{
 assert.match(card,/setInterval\(\(\) => void load\(\), 2000\)/);
 assert.match(card,/!view\.value\?\.processing && poll\) \{ clearInterval\(poll\)/);
 assert.match(card,/onBeforeUnmount\(\(\) => \{ disposed = true; if \(poll\) clearInterval\(poll\) \}\)/);
});
test('Reset is confirmed and disabled when already on the stock intro',()=>{
 assert.match(card,/window\.confirm\(/);
 // Stock intro already shown on every target: nothing to reset.
 assert.match(card,/\(!view\.is_custom && allOn\)/);
});
test('Smart TV targets: six intro targets, TV ones inherit their browser counterpart',()=>{
 assert.match(card,/type IntroTarget = 'browser_telegram' \| 'player_telegram' \| 'browser_torrents' \| 'player_torrents' \| 'tv_telegram' \| 'tv_torrent'/);
 assert.match(card,/\{ key: 'tv_telegram', label: 'Smart TV: Telegram-стримы' \}/);
 assert.match(card,/\{ key: 'tv_torrent', label: 'Smart TV: Торрент-стримы' \}/);
 assert.match(card,/TV_TARGET_PARENTS: Partial<Record<IntroTarget, IntroTarget>> = \{ tv_telegram: 'browser_telegram', tv_torrent: 'browser_torrents' \}/);
});
test('ZERO MEDIA: the preview plays only from a Media Node and the node sync status is shown',()=>{
 assert.match(card,/const previewable = computed\(\(\) => !!view\.value\?\.video_url && view\.value\.video_url\.startsWith\('https:\/\/'\)\)/);
 assert.match(card,/<video v-if="view && previewable"/);
 assert.match(card,/data-testid="intro-nodes"/);
 assert.match(card,/view\.value\?\.is_custom \? nodes\.value\.custom_ready : nodes\.value\.default_ready/);
 assert.match(card,/data-testid="intro-node-errors"/);
 assert.doesNotMatch(card,/\/cinema\/intro\/|\/media\/cinema-intro\//);
});
test('Ad Studio offers the Smart TV surfaces, inheriting the browser surface when unset',()=>{
 assert.match(studio,/\{key:'tv_telegram',label:'Telegram-стримы: Smart TV'\},\{key:'tv_torrent',label:'Торрент-стримы: Smart TV'\}\] as const/);
 assert.match(studio,/TV_SURFACE_PARENTS:Record<string,string>=\{tv_telegram:'telegram_browser',tv_torrent:'torrent_browser'\}/);
 assert.match(studio,/\(typeof p\[x\.key\]==='boolean'\?p\[x\.key\]:p\[TV_SURFACE_PARENTS\[x\.key\]\]\)!==false/);
});
