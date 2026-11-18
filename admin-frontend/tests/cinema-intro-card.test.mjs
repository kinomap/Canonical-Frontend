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
