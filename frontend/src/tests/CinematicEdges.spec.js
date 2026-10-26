import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const css=readFileSync('src/styles/cinema-interior.css','utf8')
const files=JSON.parse(readFileSync('public/cinema/v3/manifest.json','utf8')).files
describe('Cinematic interior composition',()=>{
 it('ships genuine alpha artwork rather than rectangular mascot thumbnails',()=>{
  for(const file of files){
   const data=readFileSync('public/cinema/v3/'+file.file);expect(data.toString('ascii',0,4)).toBe('RIFF');expect(data.toString('ascii',8,12)).toBe('WEBP');expect(data.toString('ascii',12,16)).toBe('VP8X');expect(data[20]&0x10).toBe(0x10)
  }
  expect(files.find(f=>f.file==='mascot-160.webp').alpha).toBe(true)
 })
 it('uses text-free edge scenery for header, catalogue and footer',()=>{
  for(const art of ['header-atmosphere.webp','catalog-reel.webp'])expect(css).toContain('/cinema/v3/'+art)
  expect(css).toContain('.home-scene:before,.home-scene:after');expect(css).toContain('pointer-events:none')
  const footer=readFileSync('src/components/CinemaFooter.vue','utf8');expect(footer).toContain('footer-interior-2000.webp');expect(footer).not.toContain('footer-stage-projector');expect(footer).not.toContain('/cinema/v3/footer-scene');expect(footer).toContain('aria-hidden="true"');expect(footer).not.toContain('/cinema/v1/footer-mascot')
 })
 it('keeps Hero full-bleed and semantic controls separate from artwork',()=>{
  const home=readFileSync('src/views/MainCatalogView.vue','utf8');expect(home).toContain('<div class="home-scene">');expect(home.indexOf('<ShowcaseHero />')).toBeLessThan(home.indexOf('<div class="catalog-page">'))
  expect(css).toContain('margin:0;width:100%');expect(css).toContain('.footer-inner{position:relative;z-index:1');expect(css).toContain('mask-image:none')
 })
 it('uses one continuous desktop scene and versioned corrected Hero art',()=>{
  const footer=readFileSync('src/components/CinemaFooter.vue','utf8')
  expect(footer.match(/class="footer-interior"/g)).toHaveLength(1)
  expect(footer).toContain('(min-width: 1400px)')
  expect(css).toContain('.footer-filmstrip{display:none;')
  const manifest=JSON.parse(readFileSync('public/cinema/v4/manifest.json','utf8'))
  expect(manifest.files.find(f=>f.file==='footer-interior-2000.webp')).toMatchObject({width:2000,height:620,alpha:true})
  expect(readFileSync('src/components/ShowcaseHero.vue','utf8')).toContain('/cinema/v4/hero-1740.webp')
  expect(readFileSync('src/components/CinemaBrand.vue','utf8')).toContain('/cinema/v3/mascot')
 })
})
