import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import {createMemoryHistory,createRouter} from 'vue-router'
import MovieDetailsView from '@/views/MovieDetailsView.vue'
const mocks=vi.hoisted(()=>({getMovie:vi.fn(),getResume:vi.fn(),startPlayback:vi.fn(),stopPlayback:vi.fn().mockResolvedValue({}),heartbeatPlayback:vi.fn()}))
vi.mock('@/api/watchHistory',()=>({getResume:mocks.getResume}))
vi.mock('@/api/client',()=>({apiClient:{...mocks,getAudioTracks:vi.fn().mockResolvedValue([])},ApiError:class extends Error{status=500}}))
vi.mock('@/stores/auth',()=>({useAuthStore:()=>({user:ref({id:'viewer'}),isAuthenticated:ref(true),token:ref('cookie-session'),fetchCurrentUser:vi.fn()})}))
let wrapper:any
beforeEach(()=>{vi.clearAllMocks();mocks.getMovie.mockResolvedValue({id:'film',title:'Палмер',status:'available',genres:[],parts:[{source_id:'p1',number:1,total:2},{source_id:'p2',number:2,total:2}]});mocks.getResume.mockResolvedValue({item:{available:true,completed:false,source_id:'p2',position:123.75}});mocks.startPlayback.mockResolvedValue({session_id:'session',media_url:'https://media.example.test/source'})})
afterEach(()=>wrapper?.unmount())
async function open(query=''){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/movies/:id',component:MovieDetailsView}]});await router.push('/movies/film'+query);await router.isReady()
 wrapper=mount(MovieDetailsView,{global:{plugins:[router],stubs:{VideoPlayer:{name:'VideoPlayer',props:['src','initialPosition','historySessionId'],template:'<div class="stub-video" />'},ReactionsBlock:true,CommentsBlock:true}}});await flushPromises()
}
describe('Account history to real playback',()=>{
 it('does not open playback or record a watch on an ordinary detail visit',async()=>{await open();expect(mocks.startPlayback).not.toHaveBeenCalled();expect(mocks.getResume).not.toHaveBeenCalled()})
 it('explicit Continue uses the stored real part and exact initial position',async()=>{await open('?watch=1');expect(mocks.startPlayback).toHaveBeenCalledWith('film','p2');expect(wrapper.findComponent({name:'VideoPlayer'}).props()).toMatchObject({initialPosition:123.75,historySessionId:'session'})})
 it('Watch again starts at the first part, never the final part of a completed movie',async()=>{mocks.getResume.mockResolvedValue({item:{available:true,completed:true,source_id:'p2',position:0}});await open('?watch=1');expect(mocks.startPlayback).toHaveBeenCalledWith('film','p1');expect(wrapper.findComponent({name:'VideoPlayer'}).props('initialPosition')).toBe(0)})
 it('does not silently restart from zero if the resume request fails',async()=>{mocks.getResume.mockRejectedValue(new Error('Resume temporarily unavailable'));await open('?watch=1');expect(mocks.startPlayback).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Resume temporarily unavailable')})
})
