import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/views/SeriesGarbage.vue', import.meta.url), 'utf8')
test('unsupported bundle keeps null episode and explains manual review', () => {
 assert.match(source, /episode_number: item\.episode_number,/)
 assert.doesNotMatch(source, /episode_number: item\.episode_number \|\|/)
 assert.match(source, /item\.episode_number == null/)
 assert.match(source, /отдельные серии не поддерживаются/)
 assert.match(source, /source\.review_reason/)
 assert.match(source, /source\.episode_count === 0/)
})
