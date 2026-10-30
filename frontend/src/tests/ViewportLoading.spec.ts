import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {mount, type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import MovieCard from '@/components/MovieCard.vue'
import MovieRail from '@/components/MovieRail.vue'
const movie={id:'one',title:'A film',poster:'/media/posters/one.jpg',year:2021,status:'available',genres:[],rating:null} as any
let notify: (entries:any[])=>void
const observe=vi.fn(),unobserve=vi.fn(),disconnect=vi.fn()
const wrappers:VueWrapper[]=[]
const options={global:{stubs:{RouterLink:{template:'<a><slot/></a>'},PosterPlay:true}}}
beforeEach(()=>{vi.stubGlobal('IntersectionObserver',class {constructor(cb:any,opts:any){notify=cb;expect(opts.rootMargin).toBe('200px')}observe=observe;unobserve=unobserve;disconnect=disconnect});vi.clearAllMocks()})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.unstubAllGlobals()})
function card(eager=false){const w=mount(MovieCard,{...options,props:{movie,eager}});wrappers.push(w);return w}
describe('bounded viewport work',()=>{
 it('does not assign a remote poster until near either viewport axis',async()=>{const w=card();expect(w.find('img').attributes('src')).toBeUndefined();notify([{target:w.element,isIntersecting:false}]);await nextTick();expect(w.find('img').attributes('src')).toBeUndefined();notify([{target:w.element,isIntersecting:true}]);await nextTick();expect(w.find('img').attributes('src')).toBe(movie.poster);expect(unobserve).toHaveBeenCalledWith(w.element)})
 it('keeps eager first rail images immediate',()=>{const w=card(true);expect(w.find('img').attributes('src')).toBe(movie.poster);expect(observe).not.toHaveBeenCalled()})
 it('shares one observer and cleans up on navigation',()=>{const a=card(),b=card();a.unmount();b.unmount();expect(unobserve).toHaveBeenCalledTimes(2);expect(disconnect).toHaveBeenCalled() ;wrappers.length=0})
 it('keeps all titles/order and mounts off-screen slider cards on approach',async()=>{const movies=[movie,{...movie,id:'two',title:'Second'}];const w=mount(MovieRail,{...options,props:{movies,title:'Drama'}});wrappers.push(w);expect(w.find('h2').text()).toBe('Drama');expect(w.find('.rail-placeholder').exists()).toBe(true);expect(w.findAll('.movie-card')).toHaveLength(0);notify([{target:w.element,isIntersecting:true}]);await nextTick();expect(w.findAll('.movie-card')).toHaveLength(2);expect(w.findAll('.movie-title').map(n=>n.text())).toEqual(['A film','Second'])})
 it('has a functional fallback without IntersectionObserver',async()=>{vi.stubGlobal('IntersectionObserver',undefined);const w=card();await nextTick();expect(w.find('img').attributes('src')).toBe(movie.poster)})
})
