import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import PosterPlay from '../components/PosterPlay.vue'

describe('Poster play optical centering', () => {
  it('uses a font-independent SVG inside the decorative circle', () => {
    const wrapper = mount(PosterPlay)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('span > svg').attributes()).toMatchObject({ viewBox: '0 0 24 24', width: '32', height: '32', focusable: 'false' })
    expect(wrapper.text()).not.toContain('▶')
  })
  it('centers the solid triangle by its visual mass on both axes', () => {
    const wrapper = mount(PosterPlay)
    expect(wrapper.find('path').attributes('d')).toBe('M7 3L22 12L7 21Z')
    expect((7 + 22 + 7) / 3).toBe(12)
    expect((3 + 12 + 21) / 3).toBe(12)
  })
  it('shares the same overlay between movie and series cards', () => {
    for (const file of ['MovieCard.vue', 'SeriesCard.vue']) {
      const source = readFileSync('src/components/' + file, 'utf8')
      expect(source).toContain('<PosterPlay />')
      expect(source).not.toContain('<span>▶</span>')
    }
    const css = readFileSync('src/styles/showcase.css', 'utf8')
    expect(css).toContain('line-height:0}.poster-play-icon{display:block;width:32px;height:32px}')
  })
})
