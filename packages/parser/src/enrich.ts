import type {Event} from '@scum/shared';

/** Only explicit log fields are promoted. No geolocation service or grid inference. */
export function enrichEvent(e:Event):Event {
 const m=e.metadata as Record<string,any>;
 const body=e.raw.replace(/^\d{4}\.\d{2}\.\d{2}-[^ ]*\s*:\s*/, '');
 if(e.event_type==='server_event'||e.event_type==='unknown')return e;
 const region=/(?:Region|区域)\s*[:：=]\s*([A-Z][0-9])\b/i.exec(body);
 if(region)m.region=region[1].toUpperCase();
 const geography=/(?:IP归属地|IP 归属地|归属地|IPLocation)\s*[:：=]\s*(.+?)(?=\s*[;；|]|\s+(?:Region|区域|Location|坐标)\s*[:：=]|$)/i.exec(body);
 if(geography)m.ip_location=geography[1].trim();
 const ip=/(?:IP(?:地址)?|IP Address)\s*[:：=]\s*((?:\d{1,3}\.){3}\d{1,3})\b/i.exec(body);
 if(ip)m.ip=ip[1];
 if(e.x==null){const c=/\bX\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*[, ]+Y\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*[, ]+Z\s*[:=]\s*(-?\d+(?:\.\d+)?)/i.exec(body);if(c){[e.x,e.y,e.z]=c.slice(1).map(Number);}}
 if(e.family==='kill'){
  const j=m.json_companion;
  const location=(v:any)=>v&&[v.X,v.Y,v.Z].every(Number.isFinite)?{x:v.X,y:v.Y,z:v.Z}:null;
  if(j){
   for(const [role,person] of [['killer',j.Killer],['victim',j.Victim]] as const){
    m[role+'_location']=location(person?.ServerLocation);
    m[role+'_client_location']=location(person?.ClientLocation);
    m[role+'_in_game_event']=typeof person?.IsInGameEvent==='boolean'?person.IsInGameEvent:null;
    m[role+'_has_immortality']=typeof person?.HasImmortality==='boolean'?person.HasImmortality:null;
   }
  }
  // Preserve an explicit parser cause. A missing weapon alone cannot prove
  // drowning, hunger, illness or a vehicle impact.
  m.death_kind=m.death_kind??(e.actor_steam_id===e.target_steam_id&&e.actor_steam_id?'suicide':e.actor_steam_id?'player':/^(?:None|Environment|Fall|Drowning)$/i.test(String(m.weapon??''))||j?.Killer?.UserId==='Environment'?'environment':e.actor_name||j?.Killer?.UserId==='NPC'?'npc':'unknown');
  if(m.death_kind==='suicide')m.death_reason='suicide';
  else if(m.death_kind==='environment'&&/^(?:Fall|Drowning)$/i.test(String(m.weapon??'')))m.death_reason=String(m.weapon).toLowerCase();
  if(m.distance_m!=null)m.distance_source=m.distance_source??'log';
  else if(m.death_kind!=='suicide'&&m.killer_location&&m.victim_location){const a=m.killer_location,b=m.victim_location;m.distance_m=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/100;m.distance_source='coordinates';}
  const head=/(?:Headshot|爆头)\s*[:：=]\s*(Yes|No|True|False|是|否)\b/i.exec(body);
  m.headshot=head?/^(yes|true|是)$/i.test(head[1]):(typeof m.headshot==='boolean'?m.headshot:null);
  // Names cannot prove weapon class; unmatched models remain unknown.
  const w=String(m.weapon??'');
  const delivery=/ \[(Explosion|Projectile|Melee|Throwing)\]$/.exec(w)?.[1];
  if(delivery)m.weapon_delivery=delivery.toLowerCase();
  if(delivery==='Explosion')m.weapon_type='explosive';
  else if(delivery==='Melee')m.weapon_type='melee';
  else if(delivery==='Projectile'&&/^(?:Default__)?Weapon_(?:Improvised_Handgun|MosinNagant|TommyGun|M1911|M82A1|AK47|SDASS|M249)_C(?:_|\b)/.test(w))m.weapon_type='firearm';
  else if(delivery==='Throwing'&&/(?:Axe|Sword|Machete|Bayonet|Tomahawk|Faceroll_Smasher)/i.test(w))m.weapon_type='melee';
  m.weapon_type=m.weapon_type??(/^(?:AK[- ]?\d+|MP5|M\d+|Mosin|SVD|AWM|Barrett|TEC\d+|DEagle|Shotgun|Hunter)/i.test(w)?'firearm':/^(?:Knife|Sword|Axe|Bat|Spear|Katana)/i.test(w)?'melee':/^(?:Mine|Trap|Claymore)/i.test(w)?'trap':/^(?:Vehicle|Car)/i.test(w)?'vehicle':/^(?:None|Environment|Fall|Drowning)$/i.test(w)?'environment':null);
 }
 return e;
}
