import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { listingHistoryBack, catalogPage, returnToListing, createCatalogScrollBehavior } from '@/router/catalogNavigation'

const route = (name: string) => ({ name } as any)
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })
describe('movie return navigation', () => {
 it('keeps full listing URL including page, filters and query', () => {
  expect(listingHistoryBack('/movies?page=3&genre=drama&sort=newest&q=space')).toBe('/movies?page=3&genre=drama&sort=newest&q=space')
  expect(listingHistoryBack('/')).toBe('/')
 })
 it.each([null, undefined, '', '//evil.example', 'https://evil.example', '/movies/another-film', '/login', '/profile', '/movies-extra'])('rejects non-listing back target %s', back => expect(listingHistoryBack(back)).toBeNull())
 it('uses native back instead of pushing home and retains browser history', () => {
  const router = {back:vi.fn(),push:vi.fn()};const e = new MouseEvent('click',{button:0,cancelable:true})
  returnToListing(router as any,e,'/movies?page=2');expect(e.defaultPrevented).toBe(true);expect(router.back).toHaveBeenCalledOnce();expect(router.push).not.toHaveBeenCalled()
 })
 it('falls back to Movies for a directly opened film', () => {
  const router={back:vi.fn(),push:vi.fn()};returnToListing(router as any,new MouseEvent('click',{cancelable:true}),null)
  expect(router.push).toHaveBeenCalledWith('/movies');expect(router.back).not.toHaveBeenCalled()
 })
 it('preserves modified clicks for new tabs', () => {
  const router={back:vi.fn(),push:vi.fn()};const e=new MouseEvent('click',{ctrlKey:true,cancelable:true});returnToListing(router as any,e,'/movies');expect(e.defaultPrevented).toBe(false);expect(router.back).not.toHaveBeenCalled();expect(router.push).not.toHaveBeenCalled()
 })
 it('restores valid page numbers and resets missing/invalid pages', () => {
  expect(catalogPage('3')).toBe(3);for(const x of [null,undefined,'-1','0','abc','2.5','Infinity'])expect(catalogPage(x)).toBe(1)
 })
 it('waits for async movie rows before returning exact saved scroll position', async () => {
  document.body.innerHTML='<div class="catalog-page" data-catalog-ready="false"></div>'
  const behavior=createCatalogScrollBehavior();const saved={left:0,top:1847};let resolved=false
  const p=Promise.resolve(behavior(route('catalog'),route('movie-details'),saved)).then(x=>{resolved=true;return x});await nextTick();await Promise.resolve();expect(resolved).toBe(false)
  document.querySelector('.catalog-page')!.setAttribute('data-catalog-ready','true');expect(await p).toEqual(saved)
 })
 it('cancels old async restore when another page is opened', async () => {
  const behavior=createCatalogScrollBehavior();const p=behavior(route('catalog'),route('movie-details'),{left:0,top:2500});await nextTick()
  expect(await behavior(route('movie-details'),route('catalog'),null)).toEqual({left:0,top:0});expect(await p).toBe(false)
 })
 it('bounds waiting on an unavailable catalogue', async () => {
  vi.useFakeTimers();const behavior=createCatalogScrollBehavior();const p=behavior(route('catalog'),route('movie-details'),{left:0,top:100});await nextTick();await vi.advanceTimersByTimeAsync(10001);expect(await p).toEqual({left:0,top:100})
 })
})
