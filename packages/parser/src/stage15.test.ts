import {it,expect} from 'vitest';
import {parseFileLine} from './dispatch';
import {parseDocument} from './document';
import {gameplayComplete} from '@scum/shared';
const actor='90000098000000001',victim='90000098000000002';
const stamp='2026.10.06-10.00.00: ';
it('promotes JSON kill fields without inventing absent victim flags or character ids',()=>{
 const json={Killer:{UserId:actor,ProfileName:'玩家',ServerLocation:{X:0,Y:0,Z:0},ClientLocation:{X:1,Y:2,Z:3},IsInGameEvent:false,HasImmortality:false},Victim:{UserId:victim,ProfileName:'玩家',ServerLocation:{X:300,Y:400,Z:0},ClientLocation:{X:4,Y:5,Z:6},IsInGameEvent:true},Weapon:'ImprovisedMine_C_123 [Explosion]'};
 const e=parseFileLine(stamp+JSON.stringify(json),'kill_test.log',1,{});
 expect(e.metadata).toMatchObject({killer_in_game_event:false,victim_in_game_event:true,killer_has_immortality:false,victim_has_immortality:null,killer_client_location:{x:1,y:2,z:3},victim_client_location:{x:4,y:5,z:6},distance_m:5,distance_source:'coordinates',headshot:null,weapon_type:'explosive',death_kind:'player'});
 expect(e.actor_char_id).toBeUndefined();expect(e.metadata.killer_region).toBeUndefined();
 json.Killer.UserId=victim;expect(parseFileLine(stamp+JSON.stringify(json),'kill_test.log',1,{}).metadata.death_kind).toBe('suicide');
});
it('keeps false success and zero failures; classifies explicit N/A as system ownership for lockpick',()=>{
 const raw=stamp+`[LogMinigame] [LockpickingMinigame_C] User: 玩家 (1, ${actor}). Success: No. Elapsed time: 0.80. Failed attempts: 0. Target object: Rager_Item_Container_C(ID: N/A). Lock type: VeryEasy. User owner: N/A. Location: X=0 Y=-1 Z=2`;
 const e=parseFileLine(raw,'gameplay_test.log',1,{});
 expect(e.metadata).toMatchObject({success:false,failed_attempts:0,owner_token:'N/A',owner_status:'system',target_object_id:'N/A',lock_type:'VeryEasy'});expect(e.x).toBe(0);
});
it('does not duplicate a merged kill text/JSON event',()=>{
 const text=stamp+`Died: 受害者 (${victim}), Killer: 玩家 (${actor}) Weapon: Weapon_MosinNagant_C [Projectile] S: test VictimLoc: 0, 0, 0, Distance: 0 m`;
 const json=stamp+JSON.stringify({Killer:{UserId:actor,ProfileName:'玩家',IsInGameEvent:false},Victim:{UserId:victim,ProfileName:'受害者'},Weapon:'Weapon_MosinNagant_C [Projectile]'});
 const events=parseDocument(Buffer.from(text+'\n'+json,'utf16le'),'kill_test.log').events;
 expect(events).toHaveLength(1);expect(events[0].metadata).toMatchObject({distance_m:0,distance_source:'log',source_line_nos:[1,2],weapon_type:'firearm'});
});

it('preserves the chest operator separately from its owner, including absent operator',()=>{
 const raw=stamp+`[LogChest] [Bury] ChestId: 42 Owner: ${victim} (2, 物主) Location: X=0 Y=1 Z=2 Burier: ${actor} (1, 操作者)`;
 const e=parseFileLine(raw,'gameplay_test.log',1,{});
 expect(e.actor_steam_id).toBe(actor);expect(e.actor_name).toBe('操作者');expect(e.metadata).toMatchObject({actor_role:'burier',owner_steam_id:victim,owner_char_id:'2',owner_status:'player',chest_id:'42'});
 expect(parseFileLine(raw.replace(/ Burier:.*$/,''),'gameplay_test.log',1,{}).actor_steam_id).toBeNull();
});
it('recognizes both exact bomb defusal aliases and retains tail, system ownership and false/zero',()=>{
 for(const kind of ['BombDefusalMinigame_C','BP_BombDefusalMinigame_C']){
 const e=parseFileLine(stamp+`[LogMinigame] [${kind}] User: 玩家 (1, ${actor}). Success: No. Elapsed time: 5.68. Failed attempts: 0. Target object: ImprovisedMine_C_123. User owner: 0(). Location: X=0 Y=1 Z=2`,'gameplay_test.log',1,{});
 expect(e.metadata).toMatchObject({minigame:kind,success:false,failed_attempts:0,elapsed_time_sec:5.68,target_object:'ImprovisedMine_C_123',target_object_id:null,target_instance_suffix:'123',target_instance_suffix_source:'object_instance_name',owner_status:'system',owner_token:'0()'});expect(e.x).toBe(0);
 expect(gameplayComplete(e,e.metadata)).toBe(true);
 }
});
it('routes lock-bomb aliases and future Defusal classes to disarm without matching negative names',()=>{
 for(const kind of ['BP_LockBombDefusalMinigame_C','LockBombDefusalMinigame_C','FutureDefusalMinigame_C','NotBombDefusalMinigame_C']){
  const e=parseFileLine(stamp+`[LogMinigame] [${kind}] User: 玩家 (1, ${actor}). Success: Yes. Elapsed time: 1.2. Failed attempts: 0. Target object: Mine_01_C_42. User owner: 0(). Location: X=0 Y=1 Z=2`,'gameplay_test.log',1,{});
  expect(e.event_type).toBe(kind.startsWith('Not')?'gameplay_event':'disarm');
 }
});
it('parses lock-bomb target, absent ID, basic lock and explicit world ownership',()=>{
 const e=parseFileLine(stamp+`[LogMinigame] [BP_LockBombDefusalMinigame_C] User: PlayerA (1, ${actor}). Success: No. Elapsed time: 3.5. Failed attempts: 0. Target object: BP_KillboxSmallDoors_01_C (ID: N/A). Lock type: Basic. User owner: 0(World). Location: X=0 Y=-1 Z=2`,'gameplay_test.log',1,{});
 expect(e).toMatchObject({event_type:'disarm',actor_name:'PlayerA',actor_char_id:'1',actor_steam_id:actor,x:0,y:-1,z:2});
 expect(e.metadata).toMatchObject({success:false,failed_attempts:0,elapsed_time_sec:3.5,target_object:'BP_KillboxSmallDoors_01_C',target_object_id:null,target_object_id_token:'N/A',lock_type:'Basic',owner_token:'0(World)',owner_status:'system',owner_name:null,owner_steam_id:null,owner_char_id:null});
 expect(gameplayComplete(e,e.metadata)).toBe(true);
 expect(gameplayComplete(e,{...e.metadata,target_object_id_token:undefined})).toBe(false);
});
it('requires exact instance-name evidence rather than guessing IDs from any numeric suffix',()=>{
 const parse=(target:string)=>parseFileLine(stamp+`[LogMinigame] [BP_BombDefusalMinigame_C] User: PlayerA (1, ${actor}). Success: No. Elapsed time: 3.5. Failed attempts: 0. Target object: ${target}. User owner: 0(). Location: X=0 Y=1 Z=2`,'gameplay_test.log',1,{});
 const className=parse('Foo_01');
 expect(className.metadata.target_object_id).toBeNull();expect(className.metadata).not.toHaveProperty('target_instance_suffix');
 expect(gameplayComplete(className,className.metadata)).toBe(false);
 expect(gameplayComplete(className,{...className.metadata,target_instance_suffix:'01',target_instance_suffix_source:'object_instance_name'})).toBe(false);
 const instance=parse('Mine_01_C_123');
 expect(instance.metadata).toMatchObject({target_object:'Mine_01_C_123',target_object_id:null,target_instance_suffix:'123',target_instance_suffix_source:'object_instance_name'});
 expect(gameplayComplete(instance,instance.metadata)).toBe(true);
 expect(gameplayComplete(instance,{...instance.metadata,target_instance_suffix:'456'})).toBe(false);
 expect(gameplayComplete(instance,{...instance.metadata,target_instance_suffix_source:undefined})).toBe(false);
 const absent=parse('Mine_01_C_123 (ID: N/A)');
 expect(absent.metadata).toMatchObject({target_object_id:null,target_object_id_token:'N/A'});expect(absent.metadata).not.toHaveProperty('target_instance_suffix');
 expect(gameplayComplete(absent,absent.metadata)).toBe(true);
 const explicit=parse('Mine_01_C_123 (ID: 456)');
 expect(explicit.metadata).toMatchObject({target_object_id:'456',target_object_id_token:'456'});expect(explicit.metadata).not.toHaveProperty('target_instance_suffix');
 expect(gameplayComplete(explicit,explicit.metadata)).toBe(true);
 expect(gameplayComplete(explicit,{...explicit.metadata,target_object_id_token:undefined})).toBe(false);
});
it('parses explicit suicide records as a self-targeted death with cause and location',()=>{
 const steam='90000099292501542';
 const e=parseFileLine(stamp+`Committed suicide. User: 甜甜滋 (25, ${steam}), [严晶晶]. Location: X=-12.5 Y=30 Z=450.25`,'kill_test.log',1,{});
 expect(e).toMatchObject({event_type:'player_death',actor_steam_id:steam,target_steam_id:steam,actor_name:'甜甜滋',target_name:'甜甜滋',actor_char_id:'25',target_char_id:'25',x:-12.5,y:30,z:450.25});
 expect(e.metadata).toMatchObject({death_kind:'suicide',death_reason:'suicide',suicide:true,weapon:null,distance_m:null,headshot:null});
});
it('keeps bunker fields unknown when absent and distinguishes system deletion from administrator records',()=>{
 const e=parseFileLine(stamp+`[LogMinigame] [AbandonedBunkerSlaveSwitchboardMinigame_01_C] User: 玩家 (1, ${actor}). Success: Yes. Elapsed time: 2.21. Failed attempts: 0.`,'gameplay_test.log',1,{});
 expect(e.metadata).toMatchObject({success:true,failed_attempts:0});expect(e.metadata).not.toHaveProperty('room');expect(e.x).toBeNull();
 const del=parseFileLine(stamp+`Deleted player '${actor} (玩家)' that last logged in 7 days ago`,'admin_test.log',1,{});
 expect(del.metadata).toMatchObject({deletion_kind:'system',maintenance:true});expect(del.actor_steam_id).toBeUndefined();expect(del.target_steam_id).toBe(actor);
});
