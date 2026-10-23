import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const css=readFileSync(new URL('../src/admin-theme.css',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('./admin-behavior-prefixes.json',import.meta.url),'utf8'));
test('38 Vue script/template prefixes remain identical after style-only redesign',()=>{
 for(const [p,h] of Object.entries(manifest)) {const s=readFileSync(new URL('../../'+p.replace('admin-frontend/','admin-frontend/'),import.meta.url),'utf8').split('<style')[0];assert.equal(createHash('sha256').update(s).digest('hex'),h,p)}
});
test('admin theme has one scope, accessible focus and mobile offsets',()=>{assert.match(css,/#app \.sidebar/);assert.match(css,/outline:3px solid var\(--ui-focus\)/);assert.match(css,/scroll-margin-top:84px/);assert.match(css,/prefers-reduced-motion:reduce/)});
test('payment groups have explicit separation and neutral readable controls',()=>{assert.match(css,/\.billing-settings form \{display:grid;gap:16px/);assert.match(css,/#app button \{[^}]*color:var\(--ui-text\)/);assert.match(css,/button:disabled[^}]*opacity:1/)});
function lum(hex){let a=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a.reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)}
for(const [name,fg,bg] of [['body','#edf2fa','#181e29'],['muted','#a2b0c7','#202a39'],['primary','#ffffff','#2463c5'],['primary hover','#ffffff','#2d72df'],['disabled','#b1bdd0','#263244'],['danger','#ffb1bc','#3d2531']])test('AA button/text contrast: '+name,()=>assert.ok((Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)>=4.5));
