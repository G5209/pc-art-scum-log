import type { Event } from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc,ownerFields} from './helpers';
import {isBombDefusalKind,isLockpickMinigame,lockpickFields} from '@scum/shared';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
const p=parseLineParts(line),m=/^\[(?<sub>[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups||m.groups.sub!=='LogMinigame')return null;const {sub,details}=m.groups;
 if(sub==='LogMinigame'){
  // Guess records have no outcome. Keep combinations as text, including leading zeroes.
  const guess=/^\[DialPadMinigame\]\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+Location:\s*(?<position>X=.*?)\.\s+Guessed Combination:\s*(?<combination>\d+)\.\s+(?:First try\.|Elapsed time since first try:\s*(?<elapsed>[\d.]+)\.)\s+Room Id:\s*(?<room>.*?)\.\s+Dial Pad Location:\s*(?<pad>X=.*)$/.exec(details)?.groups;
  if(guess){const c=coords.exec(guess.position)?.groups??{},pad=coords.exec(guess.pad)?.groups??{};return {...base(ctx,p,'bunker_minigame',{subfamily:sub,operation:'dial_pad_guess',minigame:'DialPadMinigame',guessed_combination:guess.combination,first_try:guess.elapsed===undefined,elapsed_since_first_try_sec:num(guess.elapsed),room_id:guess.room,location:loc(c),dial_pad_location:loc(pad)}),actor_name:guess.name,actor_char_id:guess.char,actor_steam_id:guess.steam,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}
  const q=/^\[(?<kind>[^\]]+)\]\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+Success:\s*(?<success>Yes|No)\.\s+Elapsed time:\s*(?<elapsed>[\d.]+)\.\s+Failed attempts:\s*(?<failed>\d+)\.(?<tail>.*)$/.exec(details);
  if(q?.groups){
   const g=q.groups;
   const c=coords.exec(g.tail)?.groups??{};
   /* Target objects may carry an inline ID and lock type before the owner token. */
   const t=/Target object:\s*(?<target>\S+?)(?:\s*\(ID:\s*(?<targetId>[^)]+)\))?\.(?:\s+Lock type:\s*(?<lockType>[^.]+)\.)?\s+User owner:\s*(?<owner>.*?)\.(?:\s+(?:Location:|X=)|\s*$)/.exec(g.tail)?.groups;
   // Only `(ID: ...)` provides an explicit object id. An observed `_C_123`
   // instance-name suffix is separate evidence, never an interchangeable id.
   // Explicit IDs, including N/A, take precedence over suffix inspection.
   const token=t?.targetId?.trim();
   const instance=t?.target && token===undefined ? /_C_(\d+)$/.exec(t.target)?.[1] : undefined;
   const tid=token==='N/A'&&isBombDefusalKind(g.kind)?null:token??null;
   return {...base(ctx,p,isLockpickMinigame(g.kind)?'lockpick':isBombDefusalKind(g.kind)?'disarm':/^AbandonedBunker(?:(?:Slave|Master)Switchboard|VoltageMatching|DialPad)Minigame/.test(g.kind)?'bunker_minigame':'gameplay_event',{subfamily:sub,operation:isLockpickMinigame(g.kind)?'lockpick':'minigame',minigame:g.kind,success:g.success==='Yes',elapsed_time_sec:num(g.elapsed),failed_attempts:Number(g.failed),...(t?{target_object:t.target,target_object_id:tid,...(token!==undefined?{target_object_id_token:token}:{}),...(instance?{target_instance_suffix:instance,target_instance_suffix_source:'object_instance_name'}:{}),lock_type:t.lockType?.trim()??null,...(isLockpickMinigame(g.kind)?lockpickFields(t.lockType?.trim()??'N/A',t.target,t.owner):ownerFields(t.owner))}:{}),...(c.x?{location:loc(c)}:{})}),actor_name:g.name,actor_steam_id:g.steam,actor_char_id:g.char,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}
 }
return null;
}
