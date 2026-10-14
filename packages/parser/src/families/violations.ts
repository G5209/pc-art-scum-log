import type { Event } from '@scum/shared'; import { base, parseLineParts, num } from '../helpers'; import type { ParseCtx } from '../types';
const re=/^\[(?<kind>[^\]]+)\].*?Action:\s*(?<action>[^,]+).*?Desc:\s*(?<desc>[^,]+).*?ServerLocation:\s*X=(?<sx>-?[\d.]+)\s+Y=(?<sy>-?[\d.]+)\s+Z=(?<sz>-?[\d.]+).*?ClientLocation:\s*X=(?<cx>-?[\d.]+)\s+Y=(?<cy>-?[\d.]+)\s+Z=(?<cz>-?[\d.]+).*?Distance:\s*(?<distance>[\d.]+)\s*m,\s*User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)/;
export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line),m=re.exec(p.body);
 if(m?.groups){const g=m.groups;return {...base(ctx,p,'violation',{violation_type:g.kind,action:g.action,description:g.desc,server_location:{x:num(g.sx),y:num(g.sy),z:num(g.sz)},client_location:{x:num(g.cx),y:num(g.cy),z:num(g.cz)},distance_m:num(g.distance)}),actor_steam_id:g.steam,actor_name:g.name,actor_char_id:g.char,x:num(g.sx),y:num(g.sy),z:num(g.sz)};}
 const enforcement=/^AConZGameMode::(?<action>BanPlayerById|KickPlayer): User id: '(?<steam>\d{17})'(?:, Reason: (?<reason>.+))?$/.exec(p.body)?.groups;
 if(enforcement)return {...base(ctx,p,'violation',{violation_type:enforcement.action,action:enforcement.action==='BanPlayerById'?'ban':'kick',reason:enforcement.reason??null}),actor_steam_id:enforcement.steam};
 // Explicit anti-cheat shapes seen in the server logs. Do not treat arbitrary bracketed lines as violations.
 const typed=/^\[(?<kind>LoadedAmmoSyncDataSizeMismatch|SuspiciousWeaponDistance|AmmoCountMismatch|ProjectileDamageToBBElementLocationMismatch|ProjectileDamageLocationsMismatch)\]\s*(?<details>.+)$/.exec(p.body)?.groups;
 if(!typed)return null;
 const user=/\bUser:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)/.exec(typed.details)?.groups;
 if(!user)return null;
 const locations:Record<string,{x:number,y:number,z:number}>={};
 for(const match of typed.details.matchAll(/(?<key>[A-Za-z]+Location):\s*X=(?<x>-?[\d.]+)\s+Y=(?<y>-?[\d.]+)\s+Z=(?<z>-?[\d.]+)/g)){
  const g=match.groups!;locations[g.key]={x:Number(g.x),y:Number(g.y),z:Number(g.z)};
 }
 const values:Record<string,string|number>={};
 for(const match of typed.details.matchAll(/(?:^|,\s*)(?<key>Loaded Ammo Count(?: Server)?|Internal Magazine Ammo Count(?: Server)?|Loaded Ammunition Item Class|Loaded Projectile Class|Count|AttackerDrift|VictimDrift):\s*(?<value>[^,]+)/g)){
  const g=match.groups!;values[g.key]=/^-?\d+(?:\.\d+)?$/.test(g.value)?Number(g.value):g.value.trim();
 }
 const weapon=/\b(?:Weapon|WeaponName):\s*([^,]+)/.exec(typed.details)?.[1]??null;
 const distance=/\bDistance:\s*([\d.]+)\s*m?\b/.exec(typed.details)?.[1];
 const location=locations.ServerAttackerLocation??locations.AttackerServerLocation??locations.AttackerLocation??locations.PrisonerLocation;
 return {...base(ctx,p,'violation',{violation_type:typed.kind,description:typed.details.split(':')[0],details:values,weapon,distance_m:num(distance),locations}),actor_name:user.name,actor_char_id:user.char,actor_steam_id:user.steam,...(location??{})};
}
