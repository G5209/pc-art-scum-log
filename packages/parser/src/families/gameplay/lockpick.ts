import {isLockpickMinigame,lockpickFields,type Event} from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc} from './helpers';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
const p=parseLineParts(line),m=/^\[(?<sub>[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups||m.groups.sub!=='LogMinigame')return null;const {sub,details}=m.groups;
 const kind=/^\[([^\]]+)\]/.exec(details)?.[1];
 if(kind&&isLockpickMinigame(kind)){
  const q=/^\[(?<kind>[^\]]+)\]\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+Success:\s*(?<success>Yes|No)\.\s+Elapsed time:\s*(?<elapsed>[\d.]+)\.\s+Failed attempts:\s*(?<failed>\d+)\.\s+Target object:\s*(?<target>[^\s(]+)(?:\s*\(ID:\s*(?<targetId>[^)]+)\))?\.\s+Lock type:\s*(?<lock>[^.]+)\.\s+User owner:\s*(?<owner>.*?)\.(?:\s+(?<tail>Location:.*))?\s*$/.exec(details);
  if(q?.groups){const g=q.groups,c=coords.exec(g.tail??'')?.groups??{};return {...base(ctx,p,'lockpick',{subfamily:sub,details,operation:'lockpick',minigame:g.kind,success:g.success==='Yes',elapsed_time_sec:num(g.elapsed),failed_attempts:Number(g.failed),target_object:g.target,target_object_id:g.targetId??null,lock_type:g.lock.trim(),...lockpickFields(g.lock.trim(),g.target,g.owner),...(g.tail?{location:loc(c)}:{})}),actor_name:g.name,actor_steam_id:g.steam,actor_char_id:g.char,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}
 }
return null;
}
