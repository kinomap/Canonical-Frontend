import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ReactionsBlock from '../components/ReactionsBlock.vue'
import movieSource from '../views/MovieDetailsView.vue?raw'
import reactionSource from '../components/ReactionsBlock.vue?raw'
import {apiClient} from '@/api/client'
vi.mock('@/api/client',()=>({apiClient:{getReactions:vi.fn(),toggleReaction:vi.fn()}}))
vi.mock('@/stores/auth',async()=>{const {ref}=await import('vue');return {useAuthStore:()=>({isAuthenticated:ref(true)})}})
describe('separate reaction cards',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(apiClient.getReactions).mockResolvedValue(['❤️','👍','💩','🔥','😂'].map(reaction_type=>({reaction_type,count:0,user_reacted:false})));vi.mocked(apiClient.toggleReaction).mockResolvedValue({status:'ok',action:'added'})})
 it('removes the full-width fill while retaining each card background',()=>{const bar=movieSource.match(/\.reactions-bar\s*\{([^}]+)\}/)?.[1];expect(bar).toContain('background: transparent;');expect(reactionSource.match(/\.reaction-btn\s*\{([^}]+)\}/)?.[1]).toContain('background: var(--ui-raised);')})
 for(const targetType of ['movie','series'] as const)it(`preserves five clickable cards and ${targetType} API calls`,async()=>{const wrapper=mount(ReactionsBlock,{props:{targetId:'qa-visual-only',targetType}});await flushPromises();const buttons=wrapper.findAll('button.reaction-btn');expect(buttons).toHaveLength(5);const emoji=buttons[0]!.find('.reaction-emoji').text();await buttons[0]!.trigger('click');await flushPromises();expect(apiClient.toggleReaction).toHaveBeenCalledWith('qa-visual-only',targetType,emoji);expect(buttons[0]!.classes()).toContain('active');expect(buttons[0]!.find('.reaction-count').text()).toBe('1');wrapper.unmount()})
})
