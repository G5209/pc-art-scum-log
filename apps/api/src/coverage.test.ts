import {it,expect} from 'vitest';
import {classifyFields,summarizeFields} from './coverage';
const base={ts:'2026-10-06T10:00:00Z',family:'gameplay',event_type:'gameplay_event',actor_steam_id:'90000098000000001',actor_name:'玩家',actor_char_id:'1',x:0,y:1,z:2};
it('treats false, zero and observed N/A tokens as valid, while absent fields are partial',()=>{
 const e={...base,metadata:{operation:'lockpick',success:false,elapsed_time_sec:0,failed_attempts:0,lock_type:'VeryEasy',target_object:'Container_C',target_object_id:'N/A',owner_token:'N/A',owner_status:'unknown'}};
 expect(classifyFields(e)).toBe('full');expect(classifyFields({...e,metadata:{...e.metadata,failed_attempts:null}})).toBe('partial');
});
it('never promotes a broad gameplay prefix or unsupported minigame to full',()=>{
 expect(classifyFields({...base,metadata:{operation:'Triggered. User',subfamily:'LogTrap',details:'anything'}})).toBe('partial');
 expect(classifyFields({...base,metadata:{operation:'minigame',minigame:'Unconfirmed_C',success:true,elapsed_time_sec:1,failed_attempts:0}})).toBe('partial');
});
it('separates unknown denominator from recognized completeness, including empty groups',()=>{
 const rows=[{...base,event_type:'server_event',metadata:{operation:'game_version',game_version:'1.0'}},{...base,metadata:{}},{...base,event_type:'unknown',metadata:{}}];
 expect(summarizeFields(rows)).toMatchObject({full_count:1,partial_count:1,unknown_count:1,full_rate:0.5,partial_rate:0.5,unknown_rate:1/3,coverage_basis:'current_events'});
 expect(summarizeFields([]).full_rate).toBe(0);
});
it('does not require unobserved bunker room fields or optional bank currency, preserves negative balances',()=>{
 expect(classifyFields({...base,x:null,y:null,z:null,metadata:{operation:'minigame',minigame:'AbandonedBunkerSlaveSwitchboardMinigame_01_C',success:false,elapsed_time_sec:2.21,failed_attempts:0}})).toBe('full');
 expect(classifyFields({...base,family:'economy',event_type:'economy_tx',metadata:{operation:'balance_snapshot',phase:'before',trader:'Trader',cash:0,account_balance:-20,gold:0,trader_funds:0}})).toBe('full');
 expect(classifyFields({...base,family:'loot',event_type:'server_event',metadata:{operation:'loot_initialization'}})).toBe('full');
});
it('accepts explicit source-empty weapons but still detects genuinely missing weapon extraction',()=>{
 const e={...base,family:'kill',event_type:'player_death',target_steam_id:'90000098000000002',target_name:'玩家乙',metadata:{death_kind:'player',weapon:'',weapon_recorded_empty:true,distance_m:0,distance_source:'log'}};
 expect(classifyFields(e)).toBe('full');
 expect(classifyFields({...e,metadata:{...e.metadata,weapon_recorded_empty:false}})).toBe('partial');
 expect(classifyFields({...e,metadata:{...e.metadata,weapon:null}})).toBe('partial');
});
it('accepts identity-backed self-deaths without discarding recorded weapon evidence',()=>{
 const e={...base,family:'kill',event_type:'player_death',target_steam_id:base.actor_steam_id,target_name:'玩家',metadata:{death_kind:'suicide',death_reason:'suicide',weapon:'Claymore [Explosion]',distance_m:5,distance_source:'log'}};
 expect(classifyFields(e)).toBe('full');
 expect(classifyFields({...e,actor_steam_id:'90000098000000002'})).toBe('partial');
});
