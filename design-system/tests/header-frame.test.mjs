import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=n=>readFileSync(new URL('../../frontend/src/'+n,import.meta.url),'utf8');
test('header and public content consume the same frame contract',()=>{const app=read('App.vue'),header=read('components/AppHeader.vue');assert.ok(app.includes('max-width:var(--page-frame-max)'));assert.ok(app.includes('padding-inline:var(--page-frame-gutter)'));assert.ok(header.includes('max-width: var(--page-frame-max, 1440px)'));assert.ok(header.includes('padding: 12px var(--page-frame-gutter, 16px)'));for(const size of ['1600px','1400px','1280px','1200px'])assert.ok(app.includes('--page-frame-max:'+size))});
test('brand and avatar regions are not shrink-to-content',()=>{const s=read('components/AppHeader.vue');assert.ok(s.includes('flex: 0 0 176px'));assert.ok(s.includes('min-width: 64px'));assert.ok(s.includes('min-width: 160px'));assert.ok(s.includes('justify-content: flex-end'));assert.ok(s.includes('flex: 1 0 auto'))});
test('both business scripts and all template bindings are byte-identical',()=>{const expected={'App.vue': 'a5fe02dee7bd271fa7e777212c731d27cd30784fd4ea8c13ca5c2a3618623cec', 'components/AppHeader.vue': '95214630c6d228d8bccceb0870e7d78eff9543d2cf89dbb79e770af2e65f4a62'};for(const [n,h]of Object.entries(expected))assert.equal(createHash('sha256').update(read(n).split('<style')[0]).digest('hex'),h,n)});
