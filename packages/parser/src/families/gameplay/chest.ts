import type { Event } from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc,ownerFields} from './helpers';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
const p=parseLineParts(line),m=/^\[(?<sub>[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups||m.groups.sub!=='LogChest')return null;const {sub,details}=m.groups;
 if(sub==='LogChest'){
  const q=/^\[(?<operation>Bury|Unbury)\]\s+ChestId:\s*(?<chest>\d+)\s+Owner:\s*(?<steam>\d+)\s+\((?<char>\d+),\s*(?<name>.*?)\)\s+(?<tail>Location:.*?)(?:\s+(?<role>Burier|Unburier):\s*(?<bsteam>\d+)\s+\((?<bchar>\d+),\s*(?<bname>.*?)\))?$/.exec(details);
  if(q?.groups){const g=q.groups,c=coords.exec(g.tail)?.groups??{};return {...base(ctx,p,'chest_action',{subfamily:sub,operation:g.operation.toLowerCase(),chest_id:g.chest,owner_name:g.name,owner_steam_id:g.steam,owner_char_id:g.char,owner_status:/^\d{17}$/.test(g.steam)?'player':'unknown',actor_role:g.role?.toLowerCase()??null,location:loc(c)}),actor_steam_id:g.bsteam??null,actor_name:g.bname??null,actor_char_id:g.bchar??null,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}
 }
return null;
}
