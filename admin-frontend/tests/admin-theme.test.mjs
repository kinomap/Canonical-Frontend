import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const css=readFileSync(new URL('../src/admin-theme.css',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('./admin-behavior-prefixes.json',import.meta.url),'utf8'));
test('Workflow script/template prefixes remain identical after presentation redesign',()=>{
 for(const [p,h] of Object.entries(manifest)) {const s=readFileSync(new URL('../../'+p.replace('admin-frontend/','admin-frontend/'),import.meta.url),'utf8').split('<style')[0];assert.equal(createHash('sha256').update(s).digest('hex'),h,p)}
});
test('admin theme has one scope, accessible focus and mobile offsets',()=>{assert.match(css,/#app \.sidebar/);assert.match(css,/outline:3px solid var\(--ui-focus\)/);assert.match(css,/scroll-margin-top:84px/);assert.match(css,/prefers-reduced-motion:reduce/)});
test('payment groups have explicit separation and neutral readable controls',()=>{assert.match(css,/\.billing-settings form \{display:grid;gap:16px/);assert.match(css,/#app button \{[^}]*color:var\(--ui-text\)/);assert.match(css,/button:disabled[^}]*opacity:1/)});
function lum(hex){let a=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a.reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)}
const color=name=>css.match(new RegExp('--ui-'+name+':(#[a-f0-9]{6})'))[1];
for(const [name,fg,bg] of [['body','text','surface'],['muted','muted','raised'],['primary','on-primary','primary'],['primary hover','on-primary','primary-hover'],['warning','warning','warning-bg'],['success','success','success-bg'],['danger','danger','danger-bg']])test('Actual light theme AA contrast: '+name,()=>assert.ok((Math.max(lum(color(fg)),lum(color(bg)))+.05)/(Math.min(lum(color(fg)),lum(color(bg)))+.05)>=4.5));
test('Light presentation isolated from public theme with constrained route frame',()=>{assert.match(css,/color-scheme: light/);assert.match(css,/--ui-content-max:1152px/);assert.match(css,/workspace-bar/);assert.match(css,/--ui-shadow-card:/)});
test('Ad library tiles do not stretch into two giant columns',()=>{const s=readFileSync(new URL('../src/views/AdStudio.vue',import.meta.url),'utf8');assert.match(s,/auto-fill,minmax\(min\(100%,230px\)/);assert.match(s,/max-width:290px/);assert.match(s,/min-height:112px/)});
