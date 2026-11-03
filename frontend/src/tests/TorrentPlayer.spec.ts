import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
const api=vi.hoisted(()=>({playbackTicket:vi.fn()}))
vi.mock('@/api/torrents',async(orig)=>({...(await orig<typeof import('@/api/torrents')>()),torrentPlaybackApi:api}))
import Player from '@/components/TorrentPlayer.vue'
const options={global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}}
beforeEach(()=>{api.playbackTicket.mockReset()})
describe('actual torrent player viewport',()=>{
 it('places the sole PRO paywall inside the player without stealing focus',()=>{
  const w=mount(Player,{...options,props:{access:false,accessError:false,kind:'movie'}})
  expect(w.findAll('[data-testid="torrent-player"]')).toHaveLength(1)
  expect(w.find('[data-testid="torrent-player"] .subscription-player').exists()).toBe(true)
  expect(w.findAll('.subscription-player')).toHaveLength(1)
  expect(w.text()).toContain('Фильмы из раздела «Торренты» доступны только с подпиской PRO')
  expect(w.find('h1,h2').attributes('tabindex')).toBeUndefined()
  expect(w.find('video').exists()).toBe(false);w.unmount()
 })
 it('keeps checking and failed access in the viewport and renders no stub for PRO without a ready source',async()=>{
  const w=mount(Player,{...options,props:{access:null,accessError:false,kind:'tv'}})
  expect(w.text()).toContain('Проверяем доступ')
  await w.setProps({accessError:true});expect(w.find('[role="alert"]').exists()).toBe(true)
  await w.find('button').trigger('click');expect(w.emitted('retry')).toHaveLength(1)
  await w.setProps({access:true,accessError:false,torrentStatus:'loading'})
  expect(w.find('[data-testid="torrent-player"]').exists()).toBe(false)
  expect(w.text()).not.toContain('ещё не подключено')
  expect(w.find('.subscription-player').exists()).toBe(false);w.unmount()
 })
 it('offers an in-browser fallback only for a ready source and streams the selected choice',async()=>{
  api.playbackTicket.mockResolvedValue({stream_url:'https://media.example/stream/1.mp4',expires_at:'2026-11-03T12:00:00Z'})
  const choice={source_id:'s-1080',season:1,episode:2}
  const w=mount(Player,{...options,props:{access:true,accessError:false,kind:'tv',tmdbId:42,ready:true,choice}})
  const play=w.find('.browser-play')
  expect(play.text()).toBe('▶ Смотреть в браузере')
  expect(w.text()).toContain('KINOSOTA Player')
  await play.trigger('click');await flushPromises()
  expect(api.playbackTicket).toHaveBeenCalledWith('tv',42,choice)
  expect(w.find('video').attributes('src')).toBe('https://media.example/stream/1.mp4')
  await w.setProps({choice:{source_id:'s-720',season:1,episode:2}})
  expect(w.find('video').exists()).toBe(false)
  await w.setProps({ready:false})
  expect(w.find('[data-testid="torrent-player"]').exists()).toBe(false);w.unmount()
 })
 it('shows a readable error when the ticket cannot be issued',async()=>{
  api.playbackTicket.mockRejectedValue(new Error('409'))
  const w=mount(Player,{...options,props:{access:true,accessError:false,kind:'movie',tmdbId:155,torrentStatus:'playable'}})
  await w.find('.browser-play').trigger('click');await flushPromises()
  expect(w.find('[role="alert"]').text()).toContain('Не удалось получить ссылку')
  expect(w.find('video').exists()).toBe(false);w.unmount()
 })
})
