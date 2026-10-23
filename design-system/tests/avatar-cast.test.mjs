import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const profile=readFileSync(new URL('../../frontend/src/views/ProfileView.vue',import.meta.url),'utf8');
test('eight stable preset URLs contain distinct optimized portraits',()=>{
 const hashes=new Set();
 for(let i=0;i<8;i++){
  const svg=readFileSync(new URL(`../../frontend/public/avatars/${i}.svg`,import.meta.url),'utf8');
  assert.match(svg,/viewBox="0 0 256 256"/);
  const data=Buffer.from(svg.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/)[1],'base64');
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');assert.ok(data.length<20000);
  hashes.add(createHash('sha256').update(data).digest('hex'));
 }
 assert.equal(hashes.size,8);
});
test('existing selection and upload actions retained',()=>{
 assert.ok(profile.includes('@click="preset(n-1)"'));
 assert.ok(profile.includes(':aria-pressed="!account.avatar_url&&account.avatar_preset===n-1"'));
 assert.equal((profile.match(/@change="upload"/g)||[]).length,2);
 assert.ok(profile.includes("api('/account/avatar/preset','PUT',{preset:n})"));
});
test('chooser CSS provides narrow grid, touch targets, focus and reduced motion',()=>{
 assert.match(profile,/@media\(max-width:1280px\)\{\.avatar-card \.preset-gallery\{grid-template-columns:repeat\(4,minmax\(44px,64px\)\)/);
 assert.ok(profile.includes('.avatar-card .preset-gallery button:focus-visible'));
 assert.ok(profile.includes('.avatar-card .preset-gallery button:disabled'));
 assert.ok(profile.includes('@media(prefers-reduced-motion:reduce){.avatar-card .preset-gallery button'));
});
