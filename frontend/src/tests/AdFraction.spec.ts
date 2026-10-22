import {describe,it,expect} from 'vitest'
import {pendingCues,resolvedCues,type Cue} from '@/utils/adTimeline'
describe('Mid-roll at half of actual stream duration',()=>{
 const cue:Cue={id:'half',kind:'mid',at_sec:0,at_fraction:0.5}
 it('resolves ahead-of-time prefetch at the actual midpoint',()=>expect(resolvedCues([cue],100)[0].at_sec).toBe(50))
 it('never runs before real metadata exists',()=>expect(pendingCues([cue],new Set(),100)).toEqual([]))
 it('runs at 50 percent of actual duration, not catalogue runtime',()=>{expect(pendingCues([cue],new Set(),49,100)).toEqual([]);expect(pendingCues([cue],new Set(),50,100)[0].at_sec).toBe(50)})
 it('is not replayed and keeps signed cue identity',()=>{expect(pendingCues([cue],new Set(['half']),99,100)).toEqual([]);expect(pendingCues([cue],new Set(),99,100)[0].id).toBe('half')})
})
