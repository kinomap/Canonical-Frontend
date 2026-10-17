import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('local API proxy preserves the browser Host port for cookie/CSRF auth', () => {
  const config = readFileSync(new URL('../../nginx.local.conf', import.meta.url), 'utf8')
  const api = config.match(/location \/api\/\s*\{([^}]+)\}/)?.[1]
  assert.ok(api)
  assert.match(api, /proxy_set_header Host \$http_host;/)
  assert.doesNotMatch(api, /proxy_set_header Host \$host;/)
})
