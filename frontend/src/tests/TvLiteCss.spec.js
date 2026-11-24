// Lite TV portal CSS contract (TV_MULTI_EPOCH_PORTAL_SPEC.md §4.1.4): safe for WebKit 537 / Mali-400 TVs.
import {readFileSync} from 'node:fs'
const css = readFileSync('public/assets/tv-lite.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Lite TV portal CSS', () => {
  it('has no GPU-heavy filters and no modern CSS functions', () => {
    expect(css).not.toMatch(/backdrop-filter/)
    expect(css).not.toMatch(/\b(clamp|min|max)\(/)
    expect(css).not.toMatch(/var\(--/)
  })

  it('keeps the KINOSOTA palette: obsidian page, amber focus, no blue frames', () => {
    expect(css).toMatch(/#080b11/)
    expect(css).toMatch(/box-shadow: 0 0 0 3px #ffce21, 0 8px 24px rgba\(255, 206, 33, 0\.35\)/)
    expect(css).toMatch(/\.wordmark-honey \{ color: #ffce21; \}/)
    expect(css).not.toMatch(/#00d2ff|#1e3a5f|#06090e|rgba\(0, 210, 255/)
    expect(css).not.toMatch(/\.lite-badge \{/)
  })

  it('fades the borderless hero banner into the page', () => {
    const hero = css.slice(css.indexOf('.lite-hero {'), css.indexOf('.lite-hero-image'))
    expect(hero).not.toMatch(/border/)
    expect(css).toMatch(/linear-gradient\(90deg, rgba\(8, 11, 17, 0\.95\) 0%, rgba\(8, 11, 17, 0\.7\) 40%, rgba\(8, 11, 17, 0\) 100%\)/)
    expect(css).toMatch(/-webkit-line-clamp: 3/)
  })

  it('uses dark translucent plates and hardware transforms instead', () => {
    expect(css).toMatch(/rgba\(8, 11, 17, 0\.94\)/)
    expect(css).toMatch(/translate3d\(0, 0, 0\)/)
    expect(css).toMatch(/scale\(1\.04\)/)
  })
})
