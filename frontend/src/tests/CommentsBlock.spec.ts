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
