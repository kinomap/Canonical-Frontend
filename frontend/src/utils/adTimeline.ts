export type Cue={id:string;kind:'pre'|'mid'|'post';at_sec:number;at_fraction?:number;creative_id?:string|null}
export function resolvedCues(cues:Cue[],duration=Infinity):Cue[]{
 return cues.map(c=>c.at_fraction?{...c,at_sec:Number.isFinite(duration)&&duration>0?Math.round(duration*c.at_fraction):Infinity}:c)
}
// All unseen crossed mid-rolls are queued chronologically, including forward seeks.
export function pendingCues(cues:Cue[],played:Set<string>,time:number,duration=Infinity):Cue[]{
 const resolved=resolvedCues(cues,duration)
 return resolved.filter(c=>c.kind==='mid'&&!played.has(c.id)&&c.at_sec<=time&&c.at_sec<duration).sort((a,b)=>a.at_sec-b.at_sec)
}
