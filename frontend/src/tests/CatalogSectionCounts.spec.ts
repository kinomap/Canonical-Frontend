import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CatalogView from '@/views/CatalogView.vue'
import SeriesCatalogView from '@/views/SeriesCatalogView.vue'
import QuickCategories from '@/components/QuickCategories.vue'
import CinemaFooter from '@/components/CinemaFooter.vue'
import { NEW_RELEASES_URL, TOP_RATED_URL, movieCatalogYear } from '@/router/catalogSections'
import { apiClient } from '@/api/client'
vi.mock('@/api/client', () => ({apiClient:{listGenres:vi.fn(),listMovies:vi.fn(),searchMovies:vi.fn(),listSeries:vi.fn()}}))
const mounted: any[] = []
afterEach(()=>{ mounted.forEach(w=>w.unmount());mounted.length=0 })
const item = {id:'a',title:'Card',genres:[]}
const response = (total:number) => ({items:[item],total,page:1,page_size:20,total_pages:Math.ceil(total/20)})
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(apiClient.listGenres).mockResolvedValue([])
 vi.mocked(apiClient.listMovies).mockResolvedValue(response(4311) as any)
 vi.mocked(apiClient.listSeries).mockResolvedValue(response(65) as any)
})
async function at(path:string, series=false){
 const View=series?SeriesCatalogView:CatalogView
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/movies',component:View},{path:'/series',component:View}]})
 await router.push(path);await router.isReady()
 const w=mount(View,{global:{plugins:[router],stubs:{MovieCard:{template:'<div class="test-card" />'},PlayNoticeModal:true}}});mounted.push(w)
 await flushPromises();return {w,router}
}
describe('section totals and matching populations',()=>{
 it.each([NEW_RELEASES_URL,'/movies?sort=newest'])('scopes new and legacy Novinki URL %s to 2026',async path=>{
  vi.mocked(apiClient.listMovies).mockResolvedValue(response(60) as any)
  const {w,router}=await at(path)
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({year:2026,sort:'newest',page:1}),expect.any(AbortSignal))
  expect(w.find('h1').text()).toBe('Новинки 2026 года');expect(w.find('.catalog-count').text()).toBe('Доступно фильмов: 60')
  await w.findAll('.page-btn')[1].trigger('click');await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({year:'2026',sort:'newest',page:'2'})
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({year:2026,page:2}),expect.any(AbortSignal))
  expect(apiClient.listMovies).toHaveBeenCalledTimes(2)
 })
 it('keeps all films independent and removes scope after section navigation',async()=>{
  const {w,router}=await at(NEW_RELEASES_URL)
  await router.push('/movies');await flushPromises()
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({year:undefined,sort:'recently_added',page:1}),expect.anything())
  expect(w.find('.catalog-count').text()).toBe('Доступно фильмов: 4311')
 })
 it('preserves explicit older year rather than overriding it with release edition',async()=>{
  const {w}=await at('/movies?year=2020&sort=newest')
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({year:2020}),expect.anything())
  expect(w.find('h1').text()).toContain('2020')
 })
 it('retains rating threshold in high-rated collection and pagination',async()=>{
  const {w}=await at(TOP_RATED_URL)
  expect(w.find('h1').text()).toBe('Высокий рейтинг')
  await w.findAll('.page-btn')[1].trigger('click');await flushPromises()
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({min_rating:0.1,sort:'rating_desc',page:2}),expect.anything())
 })
 it('preserves genre population filters through pagination',async()=>{
  const {w}=await at('/movies?genre=drama&year=2021&min_rating=7')
  await w.findAll('.page-btn')[1].trigger('click');await flushPromises()
  expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({genre:'drama',year:2021,min_rating:7,page:2}),expect.anything())
 })
 it('labels global search as matches rather than pretending all results are films',async()=>{
  vi.mocked(apiClient.searchMovies).mockResolvedValue(response(43) as any)
  const {w}=await at('/movies?q=lupen')
  expect(w.find('.catalog-count').text()).toBe('Найдено: 43')
  expect(movieCatalogYear({q:'lupen',sort:'newest'})).toBe('')
 })
 it('series search uses paginated server total, not length of a 20-row search result',async()=>{
  const {w,router}=await at('/series?q=lupen&page=3&genre=drama&year=2021',true)
  expect(apiClient.listSeries).toHaveBeenLastCalledWith(expect.objectContaining({q:'lupen',page:3,year:2021,genre:'drama'}),expect.anything())
  expect(w.find('.catalog-count').text()).toBe('Доступно сериалов: 65')
  expect(w.find('.page-info').text()).toContain('3');expect(w.find('.page-info').text()).toContain('4')
  await router.push('/series');await flushPromises()
  expect(apiClient.listSeries).toHaveBeenLastCalledWith(expect.objectContaining({q:undefined,year:undefined,page:1}),expect.anything())
 })
 it.each([false,true])('ignores late success/error and hides stale count during navigation (series=%s)',async series=>{
  const fn=series?apiClient.listSeries:apiClient.listMovies
  let finish:any
  vi.mocked(fn).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}) as any)
  const {w,router}=await at(series?'/series':'/movies',series)
  expect(w.find('.catalog-count').text()).toBe('Загрузка…')
  vi.mocked(fn).mockResolvedValueOnce(response(7) as any)
  await router.push(series?'/series?year=2021':'/movies?year=2021');await flushPromises()
  expect(w.find('.catalog-count').text()).toContain('7')
  finish(response(999));await flushPromises()
  expect(w.find('.catalog-count').text()).not.toContain('999')
  vi.mocked(fn).mockRejectedValueOnce(new Error('offline'))
  await router.push(series?'/series?year=2022':'/movies?year=2022');await flushPromises()
  expect(w.find('.catalog-count').text()).toBe('Количество недоступно')
 })
 it('every category/footer Novinki entry shares explicit scope',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]})
  await router.push('/');await router.isReady()
  for(const C of [QuickCategories,CinemaFooter]){
   const w=mount(C,{global:{plugins:[router]}});mounted.push(w)
   const link=w.findAll('a').find(a=>a.text()==='Новинки')!
   expect(link.attributes('href')).toBe(NEW_RELEASES_URL)
  }
 })
})
