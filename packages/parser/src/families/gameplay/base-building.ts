import type { Event } from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc,ownerFields} from './helpers';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
const p=parseLineParts(line),m=/^\[(?<sub>[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups||m.groups.sub!=='LogBaseBuilding')return null;const {sub,details}=m.groups;
 const attached=/^Item attached\.\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+Grenade name:\s*(?<item>.*?)\.\s+(?<tail>Location:.*)$/.exec(details)?.groups;
 if(attached){const c=coords.exec(attached.tail)?.groups??{};return {...base(ctx,p,'base_building',{subfamily:sub,operation:'item_attached',item_name:attached.item,item_source_label:'Grenade name',location:loc(c)}),actor_name:attached.name,actor_char_id:attached.char,actor_steam_id:attached.steam,x:num(c.x),y:num(c.y),z:num(c.z),message:details};}
 if(sub==='LogBaseBuilding'){const q=/^\[(?<kind>[^\]]+)\]\s+(?<action>Created|Destroyed)\.\s+FlagId:\s*(?<flag>\d+)\.\s+Owner:\s*(?<steam>\d+)\s+\((?<char>\d+),\s*(?<name>.*?)\)\.\s+(?<tail>Location:.*)$/.exec(details);if(q?.groups){const g=q.groups,c=coords.exec(g.tail)?.groups??{};return {...base(ctx,p,'base_building',{subfamily:sub,operation:g.action.toLowerCase(),owner_name:g.name,owner_steam_id:g.steam,owner_char_id:g.char,owner_status:/^\d{17}$/.test(g.steam)?'player':'unknown',identity_role:'owner',object_type:g.kind,flag_id:g.flag,location:loc(c)}),x:num(c.x),y:num(c.y),z:num(c.z),message:details};}}
return null;
}
