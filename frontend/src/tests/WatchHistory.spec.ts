import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import {createMemoryHistory,createRouter} from 'vue-router'
import {createHistoryWriter,historyCapacity} from '@/api/watchHistory'
import WatchHistoryPanel from '@/components/WatchHistoryPanel.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import {setLanguage} from '@/i18n'
const mocks=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('@/api/client',()=>({adRequest:mocks.request}))
let wrappers:any[]=[]
beforeEach(()=>{vi.clearAllMocks();setLanguage('ru');mocks.request.mockResolvedValue({items:[],total:0,total_pages:0,page:1,page_size:1})})
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];vi.restoreAllMocks()})
describe('Watch history persistence',()=>{
 it('posts exact source-local position, sequence and exit keepalive without local storage',async()=>{
  const send=vi.fn().mockResolvedValue({}),writer=createHistoryWriter(send)
  await writer('session-a',123.75,400);await writer('session-a',80.5,400,false,true)
  const bodies=send.mock.calls.map(c=>JSON.parse(c[1].body))
  expect(bodies).toEqual([{session_id:'session-a',sequence:1,position:123.75,duration:400,ended:false},{session_id:'session-a',sequence:2,position:80.5,duration:400,ended:false}])
  expect(send.mock.calls[1][1].keepalive).toBe(true)
 })
 it('ignores invalid or unknown duration and bounds position',async()=>{
  const send=vi.fn().mockResolvedValue({}),writer=createHistoryWriter(send)
  await writer('s',1,NaN);await writer('s',Infinity,10);await writer('',1,10);expect(send).not.toHaveBeenCalled()
  await writer('s',20,10,true);expect(JSON.parse(send.mock.calls[0][1].body).position).toBe(10)
 })
 it('reports failed delivery and allows a newer retry',async()=>{
  const send=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({}),writer=createHistoryWriter(send)
  await expect(writer('s',20,100)).rejects.toThrow('offline');await writer('s',21,100)
  expect(JSON.parse(send.mock.calls[1][1].body).sequence).toBe(2)
 })
 it.each([[300,450,4],[700,450,8],[140,180,1],[1000,700,18]])('fits cards into %sx%s', (w,h,n)=>{expect(historyCapacity(w,h).size).toBe(n)})
 it('displays an empty state and never invents historical watches',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})
  const w=mount(WatchHistoryPanel,{global:{plugins:[router]}});wrappers.push(w);await flushPromises()
  expect(w.text()).toContain('Здесь будут ваши фильмы');expect(w.findAll('.history-card')).toHaveLength(0)
 })
 it('shows Continue watching, multipart source metadata and server pagination',async()=>{
  const item={movie:{id:'film',title:'Палмер',year:2021},source_id:'part-two',position:123.5,duration:500,completed:false,available:true,part_number:2,part_total:2,last_watched_at:'2026-10-29T12:00:00Z'}
  mocks.request.mockResolvedValue({items:[item],total:3,total_pages:3,page:1,page_size:1})
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})
  const w=mount(WatchHistoryPanel,{global:{plugins:[router]}});wrappers.push(w);await flushPromises()
  expect(w.text()).toContain('Продолжить просмотр');expect(w.text()).toContain('Часть 2/2');expect(w.text()).toContain('00:02:03')
  expect(w.get('.history-watch').attributes('href')).toBe('/movies/film?watch=1')
  await w.get('[aria-label="Следующая страница"]').trigger('click');await flushPromises()
  expect(mocks.request).toHaveBeenCalledWith('/account/history?page=2&page_size=1',{cache:'no-store'})
 })
 it('offers retry on loading failure',async()=>{
  mocks.request.mockRejectedValueOnce(new Error('offline'))
  const w=mount(WatchHistoryPanel,{global:{stubs:{RouterLink:true}}});wrappers.push(w);await flushPromises();expect(w.text()).toContain('Не удалось загрузить историю')
  await w.get('[role=alert] button').trigger('click');await flushPromises();expect(w.text()).toContain('Здесь будут ваши фильмы')
 })
 it('does not record opening or metadata; saves actual play, pause, end and restores initial position',async()=>{
  const w=mount(VideoPlayer,{props:{src:'https://example.test/movie.mp4',historySessionId:'session',initialPosition:123.75},global:{stubs:{AdPlaybackContainer:{template:'<div />',methods:{end:async()=>{},tick:()=>{}}}}}});wrappers.push(w)
  const v=w.get('video').element as HTMLVideoElement
  Object.defineProperty(v,'duration',{configurable:true,value:600})
  await w.get('video').trigger('loadedmetadata');expect(v.currentTime).toBe(123.75);expect(mocks.request).not.toHaveBeenCalled()
  await w.get('video').trigger('playing');await flushPromises()
  expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body).position).toBe(123.75)
  v.currentTime=130.25;await w.get('video').trigger('pause');await flushPromises()
  expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body).position).toBe(130.25)
  v.currentTime=600;await w.get('video').trigger('ended');await flushPromises();expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body).ended).toBe(true)
 })
})
