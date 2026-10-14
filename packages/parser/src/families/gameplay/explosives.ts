import type {Event} from '@scum/shared';
import {base,num,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc} from './helpers';

/** Only the three phases actually present in local SCUM logs are accepted. */
export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line);
 const g=/^\[LogExplosives\]\s+(?<phase>Pin pulled|Detonated|Ignited)\.\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)\.\s+(?<label>Grenade name|Ignitable explosive name):\s*(?<item>.*?)\.\s+(?<tail>Location:.*)$/.exec(p.body)?.groups;
 if(!g)return null;
 const c=coords.exec(g.tail)?.groups??{};
 return {...base(ctx,p,'gameplay_event',{subfamily:'LogExplosives',operation:({ 'Pin pulled':'pin_pulled',Detonated:'detonated',Ignited:'ignited'} as Record<string,string>)[g.phase],explosive_name:g.item,explosive_source_label:g.label,location:loc(c)}),actor_name:g.name,actor_char_id:g.char,actor_steam_id:g.steam,x:num(c.x),y:num(c.y),z:num(c.z),message:p.body};
}
