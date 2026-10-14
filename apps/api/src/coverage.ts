import {GAMEPLAY_TYPES,gameplayComplete,isBombDefusalKind} from '@scum/shared';
import type Database from 'better-sqlite3';

type Row = Record<string, any>;
export type Completeness = 'full' | 'partial' | 'unknown';
const present=(v:any)=>v!==null&&v!==undefined&&v!==''&&(typeof v!=='number'||Number.isFinite(v));
const position=(v:any)=>v&&['x','y','z'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]));
// Preserve the exact identifier emitted by legacy SCUM builds, including 16-digit records.
const steam=(v:any)=>typeof v==='string'&&/^\d{16,17}$/.test(v);

/** Completeness of confirmed contracts, not an assertion that every optional field exists. */
export function classifyFields(e:Row):Completeness {
 if(e.event_type==='unknown')return 'unknown';
 let m:Row;try{m=typeof e.metadata==='string'?JSON.parse(e.metadata):e.metadata??{};}catch{return 'partial';}
 const all=(...values:any[])=>values.every(present),actor=steam(e.actor_steam_id)&&present(e.actor_name);
 const xyz=position(e),basic=present(e.ts)&&Number.isFinite(Date.parse(e.ts));
 if(!basic)return 'partial';
 let complete=false;
 switch(e.event_type){
 case 'server_event':
  complete=m.operation==='game_version'?present(m.game_version):['loot_initialization','bunker_header'].includes(m.operation)?true:m.operation==='maintenance'?present(m.details):m.operation==='raid_protection_config_load'?present(m.config_file):m.operation==='login_refused'?!!actor&&all(e.actor_char_id,m.ip,m.login_mode,m.reason):false;break;
 case 'player_join':case 'player_leave':complete=!!actor&&all(e.actor_char_id,m.ip,m.action)&&(xyz||m.location_available===false);break;
 case 'player_chat':complete=!!actor&&all(m.channel,e.message??m.message);break;
 case 'player_death':{
  const sameIdentity=steam(e.actor_steam_id)&&e.actor_steam_id===e.target_steam_id;
  // An explicit suicide has no weapon or distance fields. A normal kill with
  // the same source identity on both sides retains its recorded damage data.
  const self=m.death_kind==='suicide'&&m.death_reason==='suicide'&&sameIdentity;
  const weapon=present(m.weapon)||(m.weapon===''&&m.weapon_recorded_empty===true);
  complete=steam(e.target_steam_id)&&all(e.target_name,m.death_kind)&&(m.death_kind==='suicide'?self&&position(m.victim_location??e):weapon&&all(m.distance_m,m.distance_source)&&position(m.victim_location??e));break;
 }
 case 'admin_action':complete=!!actor&&all(m.operation,m.details);break;
 case 'violation':{
  const enforcement=['BanPlayerById','KickPlayer'].includes(m.violation_type);
  const typed=['LoadedAmmoSyncDataSizeMismatch','SuspiciousWeaponDistance','AmmoCountMismatch','ProjectileDamageToBBElementLocationMismatch','ProjectileDamageLocationsMismatch'].includes(m.violation_type);
  complete=enforcement?steam(e.actor_steam_id)&&present(m.action):typed?!!actor&&all(e.actor_char_id,m.description)&&m.details&&typeof m.details==='object'&&m.locations&&typeof m.locations==='object':!!actor&&all(e.actor_char_id,m.violation_type,m.action,m.description,m.distance_m)&&position(m.server_location)&&position(m.client_location);break;
 }
 case 'economy_tx':{
  const contracts:Record<string,string[]>={sale:['item','amount','trader','effective_users_online'],purchase:['item','amount','trader','effective_users_online'],balance_snapshot:['phase','trader','cash','account_balance','gold','trader_funds'],card_purchase:['account_number','card_type','free_renewal','account_balance','currency'],card_destroy:['account_number','target_account_number','card_type'],deposit:['account_number','target_account_number','amount','net_amount'],transfer:['account_number','source_account_number','source_steam_id','source_name','target_account_number','amount','removed_amount'],currency_conversion:['account_number','currency_from','currency_to','amount_from','amount_to','gold','account_balance']};
  const keys=contracts[m.operation];complete=!!actor&&!!keys&&keys.every(k=>present(m[k]))&&(!['card_purchase','card_destroy','deposit','transfer','currency_conversion'].includes(m.operation)||xyz)&&(!['deposit','transfer'].includes(m.operation)||steam(e.target_steam_id)&&present(e.target_name));break;
 }
 case 'fame_change':complete=!!actor&&present(m.amount)&&(present(m.reason)||all(m.total,m.duration_minutes)&&m.components&&typeof m.components==='object');break;
 case 'quest_update':complete=!!actor&&all(e.actor_char_id,m.status,m.quest_id);break;
 case 'chest_ownership':complete=!!actor&&all(m.chest_entity_id,m.operation)&&xyz&&(m.operation!=='changed'||steam(e.target_steam_id)&&all(e.target_name,e.target_char_id));break;
 case 'vehicle_event':complete=all(m.operation,m.vehicle_class,m.vehicle_id)&&xyz;break;
 case 'base_building':
  if(e.family==='base_building_destruction'){
   const contributions=Array.isArray(m.contributions)&&m.contributions.every((c:any)=>all(c.weapon,c.recorded_value,c.ts,c.source_line_no));
   complete=m.operation==='destroyed'?all(m.object,m.object_id)&&xyz&&position({x:m.rotation?.pitch,y:m.rotation?.yaw,z:m.rotation?.roll})&&contributions:m.operation==='contribution'&&m.orphan_contribution===true&&contributions&&m.contributions.length>0;
   break;
  }
  complete=gameplayComplete(e,m);break;
 case 'lockpick':case 'disarm':case 'bunker_minigame':case 'chest_action':case 'trap_action':case 'bunker_lock':
  complete=gameplayComplete(e,m);break;
 case 'gameplay_event':
  if(gameplayComplete(e,m)){complete=true;break;}
  switch(m.operation){
  case 'player_rename':complete=!!actor&&all(e.actor_char_id,m.old_name,m.new_name);break;
  case 'lockpick':complete=!!actor&&all(e.actor_char_id,m.success,m.elapsed_time_sec,m.failed_attempts,m.lock_type,m.target_object,m.target_object_id,m.owner_token,m.owner_status)&&xyz;break;
  case 'minigame':{
   const base=!!actor&&all(e.actor_char_id,m.minigame,m.success,m.elapsed_time_sec,m.failed_attempts);
  complete=['AbandonedBunkerSlaveSwitchboardMinigame_01_C','AbandonedBunkerMasterSwitchboardMinigame_01_C'].includes(m.minigame)?base:isBombDefusalKind(m.minigame)?base&&all(m.target_object,m.target_object_id,m.owner_token,m.owner_status)&&xyz:false;break;
  }
  case 'bury':case 'unbury':complete=!!actor&&all(e.actor_char_id,m.actor_role,m.chest_id,m.owner_name,m.owner_char_id)&&steam(m.owner_steam_id)&&xyz;break;
  case 'crafted':case 'armed':complete=!!actor&&all(e.actor_char_id,m.trap_name)&&xyz;break;
  case 'created':complete=!!actor&&all(e.actor_char_id,m.flag_id,m.object_type)&&xyz;break;
  case 'bunker_status':complete=all(m.region,m.status,m.locked_for,m.next_activation)&&xyz;break;
  default:complete=false;
  }break;
 }
 return complete?'full':'partial';
}
export function summarizeFields(rows:Row[]){
 const make=()=>({full_count:0,partial_count:0,unknown_count:0,full_rate:0,partial_rate:0,unknown_rate:0,event_count:0});
 const total=make(),families=new Map<string,ReturnType<typeof make>>();
 for(const e of rows){const f=families.get(e.family)??make();families.set(e.family,f);const key=(classifyFields(e)+'_count') as 'full_count'|'partial_count'|'unknown_count';total[key]++;f[key]++;total.event_count++;f.event_count++;}
 for(const f of [total,...families.values()]){const recognized=f.full_count+f.partial_count;f.full_rate=recognized?f.full_count/recognized:0;f.partial_rate=recognized?f.partial_count/recognized:0;f.unknown_rate=f.event_count?f.unknown_count/f.event_count:0;}
 return {...total,coverage_basis:'current_events',coverage_contract_version:'19.1.0',subfamilies:GAMEPLAY_TYPES.map(event_type=>{const selected=rows.filter(e=>e.family==='gameplay'&&e.event_type===event_type),f=make();for(const e of selected){f[(classifyFields(e)+'_count') as 'full_count'|'partial_count'|'unknown_count']++;f.event_count++;}const n=f.full_count+f.partial_count;f.full_rate=n?f.full_count/n:0;f.partial_rate=n?f.partial_count/n:0;f.unknown_rate=f.event_count?f.unknown_count/f.event_count:0;return {event_type,...f,sample_status:selected.length?'available':'insufficient'};}),families:[...families].sort(([a],[b])=>a.localeCompare(b)).map(([family,f])=>({family,...f}))};
}
export function fieldCoverage(db:Database.Database){return summarizeFields(db.prepare('SELECT ts,family,event_type,actor_steam_id,actor_name,actor_char_id,target_steam_id,target_name,target_char_id,x,y,z,message,metadata FROM events').all() as Row[]);}
