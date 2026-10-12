import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate } from '@vue/compiler-sfc'

const page = readFileSync(fileURLToPath(new URL('../src/views/MediaNodes.vue', import.meta.url)), 'utf8')
const wizard = readFileSync(fileURLToPath(new URL('../src/components/AddMediaNodeWizard.vue', import.meta.url)), 'utf8')
const { descriptor } = parse(page)

test('Add Media Node is the sole user-facing creation flow', () => {
  assert.equal((descriptor.template.content.match(/Add Media Node/g) || []).length, 2)
  assert.doesNotMatch(page, /Register Node|showCreateModal|createdToken|createNode\s*=/)
  assert.match(page, /<AddMediaNodeWizard/)
  assert.match(wizard, /axios\.post\('\/api\/v1\/admin\/media\/nodes'/)
  assert.match(wizard, /axios\.post\(`\/api\/v1\/admin\/media\/nodes\/\$\{nodeId\}\/deploy`/)
  assert.match(wizard, /region:\s*region\.value\.trim\(\)/)
  assert.match(wizard, /v-model="region"/)
  assert.match(wizard, /for_provisioning:\s*true/)
  assert.doesNotMatch(wizard, /mediaPublicUrl|media_endpoint:\s*publicUrl|public_url:\s*publicUrl/)
  assert.match(wizard, /Media URL is derived by the backend/)
  assert.doesNotMatch(wizard, /axios\.patch\(`\/api\/v1\/admin\/media\/nodes\/\$\{nodeId\}`,\s*\{[^}]*media_endpoint:/)
  assert.doesNotMatch(wizard, /`http:\/\/\$\{(?:canonicalHost|host\.value)\}`/)
  assert.match(wizard, /const canGoStep3 = computed\(\(\) => Boolean\(selectedVersion\.value\)\)/)
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'MediaNodes.vue', id: 'nodes' }).errors, [])
})
