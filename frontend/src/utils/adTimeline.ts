export type Cue={id:string;kind:'pre'|'mid'|'post';at_sec:number;creative_id?:string|null}
// All unseen crossed mid-rolls are queued chronologically, including forward seeks.
export function pendingCues(cues:Cue[],played:Set<string>,time:number,duration=Infinity):Cue[]{
 return cues.filter(c=>c.kind==='mid'&&!played.has(c.id)&&c.at_sec<=time&&c.at_sec<duration).sort((a,b)=>a.at_sec-b.at_sec)
}
