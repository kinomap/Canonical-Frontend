import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const showcaseCss=readFileSync('src/styles/showcase.css','utf8')
describe('Cinematic image edge contracts',()=>{
 it('fades the top/bottom and both sides of the hero without masking semantic content',()=>{
  expect(showcaseCss).toContain('linear-gradient(180deg,#0B0D12 0%');expect(showcaseCss).toContain('linear-gradient(90deg,#0B0D12 0%')
  expect(showcaseCss).toContain('pointer-events:none;background:linear-gradient(180deg');expect(showcaseCss).toContain('#0B0D1200 88%')
 })
 it('masks only decorative footer images, with standard and WebKit support',()=>{
  for(const selector of ['.footer-mascot{','.footer-filmstrip{']){const rule=showcaseCss.split(selector)[1]?.split('}')[0];expect(rule).toContain('-webkit-mask-image:');expect(rule).toContain('mask-image:');expect(rule).toContain('mask-composite:intersect')}
  expect(showcaseCss).toContain('.cinema-footer{background:linear-gradient(180deg,#0B0D12 0px');expect(showcaseCss).toContain('#0B0D12;border-top:0;')
 })
})
