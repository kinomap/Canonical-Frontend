// Lite TV portal CSS contract (TV_MULTI_EPOCH_PORTAL_SPEC.md §4.1.4): safe for WebKit 537 / Mali-400 TVs.
import {readFileSync} from 'node:fs'
const css = readFileSync('public/assets/tv-lite.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Lite TV portal CSS', () => {
  it('has no GPU-heavy filters and no modern CSS functions', () => {
    expect(css).not.toMatch(/backdrop-filter/)
    expect(css).not.toMatch(/\b(clamp|min|max)\(/)
    expect(css).not.toMatch(/var\(--/)
  })

  it('uses dark translucent plates and hardware transforms instead', () => {
    expect(css).toMatch(/rgba\(10, 13, 20, 0\.94\)/)
    expect(css).toMatch(/translate3d\(0, 0, 0\)/)
    expect(css).toMatch(/scale\(1\.06\)/)
  })
})
