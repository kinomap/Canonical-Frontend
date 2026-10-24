import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
describe('Route-independent public page frame',()=>{
 it('reserves scrollbar space globally, with a fallback, not only on account pages',()=>{
  const css=read('styles/pageFrame.css')
  expect(css).toContain('html { scrollbar-gutter: stable; }')
  expect(css).toContain('@supports not (scrollbar-gutter: stable)')
  expect(css).toContain('html { overflow-y: scroll; }')
  expect(css).toContain('body { min-width: 0; }')
 })
 it('never changes header geometry based on routed page children',()=>{
  const css=read('styles/pageFrame.css'),app=read('App.vue')
  expect(css).toContain('--page-frame-max: 1440px')
  expect(css).not.toContain(':has(')
  expect(app).not.toContain('--page-frame-max:')
  expect(read('components/AppHeader.vue')).toContain('max-width: var(--page-frame-max, 1440px)')
  expect(read('main.ts')).toContain("import './styles/pageFrame.css'")
 })
 for(const name of ['MainCatalogView','HomeView','CatalogView','SeriesCatalogView','GenresView','MovieDetailsView','SeriesDetailsView'])it(name+' uses the shared width and spacing in every state',()=>{
  const source=read('views/'+name+'.vue'),firstRule=source.slice(source.indexOf('<style')).split('}')[0]
  expect(firstRule).toContain('max-width: var(--page-frame-max)')
  expect(firstRule).toContain('padding: var(--page-frame-top) var(--page-frame-gutter) 64px')
  expect(firstRule).toContain('box-sizing: border-box')
 })
})

describe('Shared poster rhythm',()=>{
 const css=read('styles/pageFrame.css')
 it('has one responsive column count and gap for rails and catalogs',()=>{
  for(const value of ['--poster-columns: 2','--poster-columns: 3','--poster-columns: 4','--poster-columns: 5','--poster-gap: 16px','--poster-gap: 20px'])expect(css).toContain(value)
  expect(read('components/MovieRail.vue')).toContain('flex: 0 0 var(--poster-width)')
 })
 for(const name of ['CatalogView','SeriesCatalogView','GenresView'])it(name+' uses shared columns and gap',()=>{
  const source=read('views/'+name+'.vue')
  expect(source).toContain('grid-template-columns: repeat(var(--poster-columns), minmax(0, 1fr))')
  expect(source).toContain('gap: var(--poster-gap)')
  expect(source).not.toMatch(/grid-template-columns: repeat\(auto-fill, minmax\((170|190|210)px/)
 })
})
