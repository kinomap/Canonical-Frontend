import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import Player from '@/components/TorrentPlayer.vue'
const options={global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}}
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
 it('keeps checking, failed access and PRO waiting in the same viewport',async()=>{
  const w=mount(Player,{...options,props:{access:null,accessError:false,kind:'tv'}})
  expect(w.text()).toContain('Проверяем доступ')
  await w.setProps({accessError:true});expect(w.find('[role="alert"]').exists()).toBe(true)
  await w.find('button').trigger('click');expect(w.emitted('retry')).toHaveLength(1)
  await w.setProps({access:true,accessError:false});expect(w.text()).toContain('ещё не подключено')
  expect(w.find('.subscription-player').exists()).toBe(false)
  expect(w.findAll('[data-testid="torrent-player"]')).toHaveLength(1);w.unmount()
 })
})
