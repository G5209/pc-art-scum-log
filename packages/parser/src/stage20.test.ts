import {it,expect} from 'vitest';
import {lockpickFields,lockpickOwnership,LOCK_QUALITIES,LOCK_TYPE_MAPPING} from '@scum/shared';
import {parseFileLine} from './dispatch';

it('stage 22 quality is explicitly mapped from raw lock type, never inferred from target tiers',()=>{
 for(const [token,mapped] of Object.entries(LOCK_TYPE_MAPPING))expect(lockpickFields(token,'unknown','N/A')).toMatchObject({lock_category_name:mapped.category,lock_quality_name:mapped.quality});
 for(const [token,quality] of [['Basic','Iron'],['Medium','Silver'],['Advanced','Gold'],['VeryEasy','Basic']])expect(lockpickFields(token,'unknown','N/A')).toMatchObject({lock_category:'padlock',lock_quality:quality,lock_quality_name:LOCK_QUALITIES[quality],lock_difficulty:token});
 expect(lockpickFields('N/A','unknown','N/A')).toMatchObject({lock_category:'unknown',lock_quality:'unknown',lock_difficulty:null,target_object_name:null});
 expect(lockpickFields('Unobserved','Locker_Tier_3_C','N/A').lock_quality).toBe('unknown');
});
it('exact target dictionary translates evidence tokens while keeping unverified objects absent',()=>{
 expect(lockpickFields('Basic','BPLockpick_Weapon_Locker_Military_C','N/A').target_object_name).toBe('军用武器柜');
 expect(lockpickFields('Basic','BPLockpick_Weapon_Locker_Military_Unobserved_C','N/A').target_object_name).toBeNull();
});
it('ownership distinguishes player, system, world object and world lock without guessing',()=>{
 for(const token of ['12([90000098000000001] 玩家一)','玩家一 (12, 90000098000000001)'])expect(lockpickOwnership(token)).toMatchObject({owner_status:'player',owner_name:'玩家一',owner_char_id:'12',owner_steam_id:'90000098000000001'});
 expect(lockpickOwnership('N/A')).toMatchObject({owner_status:'system',owner_kind:'system'});
 expect(lockpickOwnership('0()')).toMatchObject({owner_status:'world',owner_kind:'world_object'});
 expect(lockpickOwnership('0(World)')).toMatchObject({owner_status:'world',owner_kind:'world_lock'});
 expect(lockpickOwnership('opaque')).toMatchObject({owner_status:'unknown',owner_token:'opaque',owner_name:null});
});
it('parser adds labels and ownership while retaining false, zero and original tokens',()=>{
 const line='2026.10.13-01.02.03: [LogMinigame] [LockpickingMinigame_C] User: 玩家一 (12, 90000098000000001). Success: No. Elapsed time: 0.0. Failed attempts: 0. Target object: BPLockpick_Weapon_Locker_Military_C (ID: N/A). Lock type: Basic. User owner: 0(World). Location: X=0 Y=1 Z=2';
 const e=parseFileLine(line,'gameplay_test.log',42,{});
 expect(e).toMatchObject({event_type:'lockpick',source_line_no:42,raw:line});
 expect(e.metadata).toMatchObject({lock_type:'Basic',lock_category:'padlock',lock_quality:'Iron',lock_quality_name:'铁锁',target_object:'BPLockpick_Weapon_Locker_Military_C',target_object_name:'军用武器柜',owner_status:'world',owner_kind:'world_lock',success:false,failed_attempts:0,elapsed_time_sec:0});
});
