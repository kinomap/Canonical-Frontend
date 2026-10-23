import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const s=readFileSync(new URL('../../frontend/src/components/AppHeader.vue',import.meta.url),'utf8');
test('header uses an opaque dark background',()=>{assert.match(s,/\.app-header\s*\{[^}]*background: #0d0e12;/);assert.ok(!s.includes('rgba(13, 14, 18, 0.88)'))});
test('header portrait fills a single unadorned 44px target',()=>{assert.ok(s.includes(':size="44"'));for(const name of ['profile-btn','avatar-circle']){const css=s.match(new RegExp('\\.'+name+' \\{([^}]+)'))[1];for(const rule of ['width: 44px','height: 44px','padding: 0','border: 0','background: none','box-shadow: none'])assert.ok(css.includes(rule),name+rule)}assert.ok(s.includes('.profile-btn:focus-visible'))});
test('header business script remains byte-identical',()=>{assert.equal(createHash('sha256').update(s.split('</script>')[0]).digest('hex'),'e40b8d5413809b562785b2dc1c564372567fdc508d9f857a1fb5a35e115e83d4')});
