import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import CommentsBlock from '@/components/CommentsBlock.vue'
import {useAuthStore} from '@/stores/auth'
import {apiClient} from '@/api/client'
vi.mock('@/api/client',()=>({apiClient:{getComments:vi.fn(),postComment:vi.fn(),getCurrentUser:vi.fn(),updateComment:vi.fn(),deleteComment:vi.fn()}}))
const auth=useAuthStore();let w:any
const person={id:'fixture-user',username:'',display_name:'Тест',email:'',role:'user',status:'active',created_at:'2026-01-01'}
beforeEach(()=>{vi.clearAllMocks();auth.setToken(null);vi.mocked(apiClient.getComments).mockResolvedValue([])})
afterEach(()=>{w?.unmount();auth.setToken(null)})
describe('Comments for cookie-session users',()=>{
 it.each(['movie','series'] as const)('renders and submits without public username: %s',async(targetType)=>{
  auth.setToken('cookie-session');auth.user.value={...person};w=mount(CommentsBlock,{props:{targetId:'fixture-video',targetType}});await flushPromises()
  expect(w.get('.comment-avatar.me').text()).toBe('Т')
  const saved={id:'c',movie_id:'fixture-video',user:{id:person.id,username:''},text:'Проверка 😊',created_at:'2026-01-01',updated_at:'2026-01-01'}
  vi.mocked(apiClient.postComment).mockResolvedValue(saved);await w.get('.comment-input').setValue(saved.text);await w.get('.post-btn').trigger('click');await flushPromises()
  expect(apiClient.postComment).toHaveBeenCalledWith('fixture-video',targetType,saved.text);expect(w.get('.comment-text').text()).toBe(saved.text);expect((w.get('.comment-input').element as HTMLInputElement).value).toBe('')
 })
 it('reacts to login, delayed hydration and logout',async()=>{
  w=mount(CommentsBlock,{props:{targetId:'v',targetType:'movie'}});await flushPromises();expect(w.find('.comment-input').exists()).toBe(false)
  auth.setToken('cookie-session');await flushPromises();expect(w.get('.comment-avatar.me').text()).toBe('?')
  auth.user.value={...person,username:'normal',display_name:''};await flushPromises();expect(w.get('.comment-avatar.me').text()).toBe('N');auth.setToken(null);await flushPromises();expect(w.find('.comment-input').exists()).toBe(false)
 })
 it('renders listed author without username',async()=>{
  auth.setToken('cookie-session');auth.user.value={...person,username:'normal'}
  vi.mocked(apiClient.getComments).mockResolvedValue([{id:'c',movie_id:'v',user:{id:'other',username:''},text:'Existing',created_at:'2026-01-01',updated_at:'2026-01-01'}]);w=mount(CommentsBlock,{props:{targetId:'v',targetType:'movie'}});await flushPromises();expect(w.get('.comment-text').text()).toBe('Existing');expect(w.find('.comment-input').exists()).toBe(true)
 })
})
describe('Comment avatars and anti-spam',()=>{
 const listed=(id:string,user:Record<string,unknown>,text:string)=>({id,movie_id:null,series_id:'s',user,text,created_at:'2026-01-01',updated_at:'2026-01-01'})
 it('draws every author with UserAvatar: picture, preset or initial',async()=>{
  auth.setToken('cookie-session');auth.user.value={...person,avatar_url:'/media/avatars/me.png'} as any
  vi.mocked(apiClient.getComments).mockResolvedValue([
   listed('c1',{id:'u1',username:'sherlock',display_name:'Шерлок',avatar_url:'/media/avatars/u1.png'},'Первый'),
   listed('c2',{id:'u2',username:'watson',display_name:null,avatar_preset:2},'Второй'),
   listed('c3',{id:'u3',username:''},'Третий')] as any)
  w=mount(CommentsBlock,{props:{targetId:'s',targetType:'series'}});await flushPromises()
  expect(w.get('.comment-avatar.me img').attributes('src')).toBe('/media/avatars/me.png')
  const avatars=w.findAll('.comment-item .comment-avatar')
  expect(avatars).toHaveLength(3)
  for(const avatar of avatars)expect(avatar.classes()).toContain('user-avatar')
  expect(avatars[0]!.get('img').attributes('src')).toBe('/media/avatars/u1.png')
  expect(avatars[1]!.get('img').attributes('src')).toBe('/avatars/2.svg')
  expect(avatars[2]!.find('img').exists()).toBe(false);expect(avatars[2]!.text()).toBe('?')
  // Profile name first, then @username; nothing for an account without either.
  expect(w.findAll('.comment-author').map((a: any)=>a.text())).toEqual(['Шерлок','@watson'])
 })
 it('allows one new comment per 4 seconds and counts the wait down on the button',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','Date']})
  try{
   auth.setToken('cookie-session');auth.user.value={...person}
   vi.mocked(apiClient.postComment).mockImplementation((async(...args:any[])=>listed(String(args[2]),{id:person.id,username:''},String(args[2]))) as any)
   w=mount(CommentsBlock,{props:{targetId:'v',targetType:'movie'}});await flushPromises()
   await w.get('.comment-input').setValue('Первый');await w.get('.post-btn').trigger('click');await flushPromises()
   await w.get('.comment-input').setValue('Второй')
   expect(w.get('.post-btn').attributes('disabled')).toBeDefined()
   expect(w.get('.post-cooldown').text()).toBe('· 4')
   await w.get('.comment-input').trigger('keyup',{key:'Enter'});await flushPromises()
   expect(apiClient.postComment).toHaveBeenCalledTimes(1)
   vi.advanceTimersByTime(4000);await flushPromises()
   expect(w.find('.post-cooldown').exists()).toBe(false);expect(w.get('.post-btn').attributes('disabled')).toBeUndefined()
   await w.get('.post-btn').trigger('click');await flushPromises()
   expect(apiClient.postComment).toHaveBeenCalledTimes(2)
   expect(w.findAll('.comment-text').map((x: any)=>x.text())).toEqual(['Второй','Первый'])
  }finally{vi.useRealTimers()}
 })
})
