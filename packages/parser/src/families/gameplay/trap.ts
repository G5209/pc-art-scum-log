import type { Event } from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc,ownerFields} from './helpers';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
const p=parseLineParts(line),m=/^\[(?<sub>[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups||m.groups.sub!=='LogTrap')return null;const {sub,details}=m.groups;
 if(sub==='LogTrap'){const q=/^(?<operation>Crafted|Armed|Triggered|Disarmed)\.\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+Trap name:\s*(?<trap>.*?)\.\s+(?:Owner:\s*(?<ownerName>.*?)\s*\((?<ownerChar>\d+),\s*(?<ownerSteam>\d{17})\)\.\s+)?(?<tail>Location:.*)$/.exec(details);if(q?.groups){const g=q.groups,c=coords.exec(g.tail)?.groups??{};return {...base(ctx,p,'trap_action',{subfamily:sub,operation:g.operation.toLowerCase(),trap_name:g.trap,...(g.ownerSteam?{owner_name:g.ownerName,owner_char_id:g.ownerChar,owner_steam_id:g.ownerSteam,owner_status:'player'}:{}),location:loc(c)}),actor_steam_id:g.steam,actor_name:g.name,actor_char_id:g.char,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}}
return null;
}
