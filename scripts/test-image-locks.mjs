import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for (const file of ['Dockerfile.frontend','Dockerfile.public-frontend','Dockerfile.admin-frontend']) {
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for (const line of source.split('\n').filter(x=>x.startsWith('FROM '))) {
  assert.match(line,/@sha256:[a-f0-9]{64}(?: AS [a-z-]+)?$/);
 }
 assert.ok(source.includes('RUN npm ci'));
 assert.ok(!source.includes('npm ci ||'));
}
for (const dir of ['frontend','admin-frontend']) {
 const lock=JSON.parse(readFileSync(new URL('../'+dir+'/package-lock.json',import.meta.url),'utf8'));
 assert.ok(lock.lockfileVersion>=2);
 for (const [name,entry] of Object.entries(lock.packages)) {
  if (!name || entry.link) continue;
  assert.ok(entry.version, name+' must have an exact resolved version');
 }
}
console.log('3 Dockerfiles digest-pinned; both npm locks complete; no install fallback');
