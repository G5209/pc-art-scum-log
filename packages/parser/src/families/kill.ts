import type { Event } from '@scum/shared';
import { base, parseLineParts, num } from '../helpers';
import type { ParseCtx } from '../types';

const identity=/^\d{16,17}$/;
const human=/^Died:\s*(?<victim>.*?)\s*\((?<victimSteam>\d{16,17})\),\s*Killer:\s*(?<killer>.*?)\s*\((?<killerSteam>\d{16,17}|NPC)\)\s+Weapon:\s*(?<weapon>.*?)\s+S(?:\[|:).*?VictimLoc:\s*(?<x>-?\d+(?:\.\d+)?),\s*(?<y>-?\d+(?:\.\d+)?),\s*(?<z>-?\d+(?:\.\d+)?),\s*Distance:\s*(?<distance>\d+(?:\.\d+)?)\s*m/;

// SCUM writes suicide records separately from the normal Died/Killer form.
// Keep the user's identity in both actor and target so downstream joins and
// death counters remain consistent, while explicitly recording the cause.
// A few server builds have emitted the common one-m typo "Comitted suicide";
// accept it as the same explicit self-death record.
const suicide=/^(?<reason>Committed suicide|Comitted suicide|Suicide|Killed self|Killed himself|Killed themselves)\.?\s+User:\s*(?<name>.*?)\s*\((?<char>\d+),\s*(?<steam>\d{16,17})\)(?:,\s*\[(?<label>[^\]]*)\])?\.?\s*(?:Location:\s*X\s*=\s*(?<x>-?\d+(?:\.\d+)?)\s*Y\s*=\s*(?<y>-?\d+(?:\.\d+)?)\s*Z\s*=\s*(?<z>-?\d+(?:\.\d+)?))?\.?\s*$/i;

function suicideEvent(p:ReturnType<typeof parseLineParts>,ctx:ParseCtx):Event|null {
 const m=suicide.exec(p.body); if(!m?.groups)return null;
 const g=m.groups, x=num(g.x), y=num(g.y), z=num(g.z);
 const location=x!=null&&y!=null&&z!=null?{x,y,z}:null;
 return {
  ...base(ctx,p,'player_death',{
   death_kind:'suicide', death_reason:'suicide', suicide:true,
   ...(g.label?{user_label:g.label}:{}),
   weapon:null, distance_m:null, distance_source:null, headshot:null,
   ...(location?{killer_location:location,victim_location:location}:{}),
  }),
  actor_steam_id:g.steam, actor_name:g.name, actor_char_id:g.char,
  target_steam_id:g.steam, target_name:g.name, target_char_id:g.char,
  x, y, z, message:p.body,
 };
}

export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line);
 const self=suicideEvent(p,ctx); if(self)return self;
 if(p.body.trim().startsWith('{')) {
  try {
   const j=JSON.parse(p.body); const k=j.Killer,v=j.Victim;
   if(!k||!v||typeof v.UserId!=='string'||!identity.test(v.UserId)||typeof j.Weapon!=='string')return null;
   return {...base(ctx,p,'player_death',{weapon:j.Weapon,...(j.Weapon===''?{weapon_recorded_empty:true}:{}),time_of_day:j.TimeOfDay,json_companion:j}),actor_steam_id:typeof k.UserId==='string'&&identity.test(k.UserId)?k.UserId:null,actor_name:k?.ProfileName,target_steam_id:v?.UserId,target_name:v?.ProfileName,x:v?.ServerLocation?.X??null,y:v?.ServerLocation?.Y??null,z:v?.ServerLocation?.Z??null};
  } catch { return null; }
 }
 const m=human.exec(p.body); if(!m?.groups)return null;
 const g=m.groups;
 const killerLoc=/KillerLoc\s*:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(p.body);
 return {...base(ctx,p,'player_death',{weapon:g.weapon,...(g.weapon===''?{weapon_recorded_empty:true}:{}),distance_m:num(g.distance),killer_location:killerLoc?{x:Number(killerLoc[1]),y:Number(killerLoc[2]),z:Number(killerLoc[3])}:null,victim_location:{x:num(g.x),y:num(g.y),z:num(g.z)},...(g.killerSteam==='NPC'?{death_kind:'npc'}:{})}),actor_steam_id:g.killerSteam==='NPC'?null:g.killerSteam,actor_name:g.killer,target_steam_id:g.victimSteam,target_name:g.victim,x:num(g.x),y:num(g.y),z:num(g.z)};
}
