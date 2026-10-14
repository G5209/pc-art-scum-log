import {describe,it,expect} from 'vitest';
import {parseFileLine} from './dispatch';
import {parseDocument} from './document';

const stamp='2026.10.13-10.34.18: ';
const steam='90000098000000001',target='90000098000000002';

describe('stage 19 death records',()=>{
 it.each(['Committed suicide','Comitted suicide','Suicide','Killed self','Killed himself','Killed themselves'])('recognizes %s with a trailing punctuation mark',reason=>{
  const e=parseFileLine(stamp+`${reason}. User: PlayerA (25, ${steam}), [ProfileA]. Location: X=-100.125 Y=100.125 Z=100.125.`,'kill_test.log',1,{});
  expect(e.event_type).toBe('player_death');
  expect(e).toMatchObject({actor_steam_id:steam,target_steam_id:steam,actor_char_id:'25',target_char_id:'25',x:-100.125,y:100.125,z:100.125});
  expect(e.metadata).toMatchObject({death_kind:'suicide',death_reason:'suicide',suicide:true,user_label:'ProfileA',weapon:null,distance_m:null,distance_source:null,headshot:null});
  expect(Number.isFinite(e.z)).toBe(true);
 });
 it('preserves the exact 16-digit identity supplied by a record',()=>{
  const id='9000009929250154';
  const e=parseFileLine(stamp+`Committed suicide. User: PlayerA (25, ${id}), [ProfileA]. Location: X=0 Y=0 Z=0.`,'kill_test.log',1,{});
  expect(e.actor_steam_id).toBe(id);expect(e.target_steam_id).toBe(id);
 });
 it('keeps NPC identity separate and captures both coordinates from the text',()=>{
  const e=parseFileLine(stamp+`Died: PlayerA (${steam}), Killer: BP_Guard_Lvl_3_C_123 (NPC) Weapon: Weapon_M1911_C [Projectile] S:[KillerLoc : 10, 20, 30 VictimLoc: 40, 50, 60, Distance: 0 m]`,'kill_test.log',1,{});
  expect(e.actor_steam_id).toBeNull();
  expect(e.metadata).toMatchObject({death_kind:'npc',weapon_type:'firearm',weapon_delivery:'projectile',distance_m:0,distance_source:'log',killer_location:{x:10,y:20,z:30},victim_location:{x:40,y:50,z:60}});
 });
 it('classifies explicit environment information without inventing a specific cause',()=>{
  const record={Killer:{UserId:'Environment',ProfileName:'Environment'},Victim:{UserId:steam,ProfileName:'PlayerA'},Weapon:'Environment'};
  const e=parseFileLine(stamp+JSON.stringify(record),'kill_test.log',1,{});
  expect(e.metadata).toMatchObject({death_kind:'environment',weapon_type:'environment'});
  expect(e.metadata.death_reason).toBeUndefined();
 });
 it.each([['Weapon_M82A1_C [Projectile]','firearm'],['Default__Weapon_RPG7_C [Explosion]','explosive'],['Weapon_AK47_C_123 [Melee]','melee'],['2H_La_Hacha_Axe_C_123 [Throwing]','melee']])('uses explicit damage class for %s', (weapon,type)=>{
  const e=parseFileLine(stamp+JSON.stringify({Killer:{UserId:steam,ProfileName:'PlayerA'},Victim:{UserId:target,ProfileName:'PlayerB'},Weapon:weapon}),'kill_test.log',1,{});
  expect(e.metadata.weapon_type).toBe(type);
 });
 it('leaves an empty weapon empty and does not fabricate environmental death',()=>{
  const e=parseFileLine(stamp+JSON.stringify({Killer:{UserId:steam,ProfileName:'PlayerA'},Victim:{UserId:target,ProfileName:'PlayerB'},Weapon:''}),'kill_test.log',1,{});
  expect(e.metadata).toMatchObject({weapon:'',weapon_recorded_empty:true,death_kind:'player',weapon_type:null,headshot:null});
 });
 it('retains damage data when a normal kill record has the same source identity on both sides',()=>{
  const e=parseFileLine(stamp+`Died: PlayerA (${steam}), Killer: PlayerA (${steam}) Weapon: Claymore [Explosion] S:[KillerLoc : 0, 0, 0 VictimLoc: 300, 400, 0, Distance: 5 m]`,'kill_test.log',1,{});
  expect(e.metadata).toMatchObject({death_kind:'suicide',death_reason:'suicide',weapon:'Claymore [Explosion]',distance_m:5,distance_source:'log'});
  expect(e.metadata.suicide).toBeUndefined();
 });
 it('marks a deliberately blank weapon field rather than treating it as parser omission',()=>{
  const e=parseFileLine(stamp+`Died: PlayerB (${target}), Killer: PlayerA (${steam}) Weapon:  S:[KillerLoc : 0, 0, 0 VictimLoc: 300, 400, 0, Distance: 5 m]`,'kill_test.log',1,{});
  expect(e.metadata).toMatchObject({weapon:'',weapon_recorded_empty:true,death_kind:'player',distance_m:5,distance_source:'log'});
 });
 it('keeps a text and JSON companion as one event for a 16-digit player',()=>{
  const id='9000009929250154';
  const text=stamp+`Died: PlayerB (${target}), Killer: PlayerA (${id}) Weapon: Weapon_AK47_C [Projectile] S:[KillerLoc : 0, 0, 0 VictimLoc: 300, 400, 0, Distance: 5 m]`;
  const json=stamp+JSON.stringify({Killer:{UserId:id,ProfileName:'PlayerA'},Victim:{UserId:target,ProfileName:'PlayerB'},Weapon:'Weapon_AK47_C [Projectile]'});
  const result=parseDocument(Buffer.from(text+'\n'+json,'utf16le'),'kill_test.log');
  expect(result.events).toHaveLength(1);expect(result.events[0].actor_steam_id).toBe(id);expect(result.events[0].metadata.source_line_nos).toEqual([1,2]);
 });
});

describe('stage 19 vehicle lifecycle',()=>{
 it('classifies forbidden-zone expiry without inventing a responsible attacker',()=>{
  const e=parseFileLine(stamp+`[ForbiddenZoneTimerExpired] Dirtbike_ES. VehicleId: 19311579. Owner: ${steam} (231, PlayerA). Location: X=100.125 Y=-100.125 Z=238.989`,'vehicle_destruction_test.log',1,{});
  expect(e).toMatchObject({event_type:'vehicle_event',actor_steam_id:steam,actor_name:'PlayerA',x:100.125,y:-100.125,z:238.989});
  expect(e.metadata).toMatchObject({operation:'forbidden_zone_timer_expired',vehicle_class:'Dirtbike_ES',vehicle_id:'19311579',owner_steam_id:steam});
  expect(e.target_steam_id==null).toBe(true);
 });
});

describe('stage 19 economy records',()=>{
 it('parses both currency conversion directions with explicit currencies and resulting balances',()=>{
  const prefix=stamp+`[Currency Conversion] PlayerA(ID:${steam})(Account Number:123) `;
  const buy=parseFileLine(prefix+'purchased 50 gold for 58000 credits (new account balance is 944 gold/8675120 credits) at X=100.125 Y=-100.125 Z=345.170.','economy_test.log',1,{});
  expect(buy).toMatchObject({event_type:'economy_tx',actor_steam_id:steam,x:100.125,y:-100.125,z:345.17});
  expect(buy.metadata).toMatchObject({operation:'currency_conversion',conversion_action:'purchased',currency_from:'credits',currency_to:'gold',amount_from:58000,amount_to:50,gold:944,account_balance:8675120});
  const sold=parseFileLine(prefix+'sold 2 gold for 200 credits (new account balance is 0 gold/200 credits) at X=0 Y=0 Z=0.','economy_test.log',1,{});
  expect(sold.metadata).toMatchObject({currency_from:'gold',currency_to:'credits',amount_from:2,amount_to:200,gold:0});
 });
 it('preserves transfer operator, source and receiver without guessing a missing currency',()=>{
  const raw=stamp+`[Bank] Operator(ID:${steam})(Account Number:100) transferred 5000000(5100000 was removed) from Account Number: 200(Source)(90000098000000003) to Account Number: 300(Receiver)(${target}) at X=100.125 Y=-100.125 Z=345.160`;
  const e=parseFileLine(raw,'economy_test.log',1,{});
  expect(e).toMatchObject({event_type:'economy_tx',actor_name:'Operator',actor_steam_id:steam,target_name:'Receiver',target_steam_id:target});
  expect(e.metadata).toMatchObject({operation:'transfer',account_number:'100',source_account_number:'200',source_name:'Source',source_steam_id:'90000098000000003',target_account_number:'300',amount:5000000,removed_amount:5100000,currency:null});
  expect(e.metadata.fee).toBeUndefined();
 });
 it('recognizes an economy-log player rename by identity and keeps both names including same-name changes',()=>{
  for(const name of ['PlayerB','PlayerA']){
   const e=parseFileLine(stamp+`Player PlayerA (755, ${steam}) changed their name to ${name}.`,'economy_test.log',1,{});
   expect(e).toMatchObject({event_type:'gameplay_event',actor_name:name,actor_char_id:'755',actor_steam_id:steam});
   expect(e.metadata).toMatchObject({operation:'player_rename',old_name:'PlayerA',new_name:name});
  }
 });
});
