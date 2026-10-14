import {it,expect} from 'vitest';
import {lockpickFields,LOCKPICK_TARGETS,STAGE21_TARGET_TOKENS,gameplayComplete} from '@scum/shared';
import {parseFileLine} from './dispatch';

const line=(kind='BP_DialLockMinigame_C',type='DialLock')=>`2026.10.13-16.37.30: [LogMinigame] [${kind}] User: PlayerA (69, 90000098000000001). Success: No. Elapsed time: 0.63. Failed attempts: 0. Target object: Improvised_Metal_Chest_C(ID: 19857253). Lock type: ${type}. User owner: 253([90000098000000002] PlayerB). Location: X=0 Y=1 Z=2`;
it.each(['BP_DialLockMinigame_C','DialLockMinigame_C'])('classifies %s as lockpick and keeps password locks without quality',kind=>{
 const e=parseFileLine(line(kind),'gameplay_fixture.log',4,{});
 expect(e.event_type).toBe('lockpick');expect(e.family).toBe('gameplay');
 expect(e.metadata).toMatchObject({operation:'lockpick',minigame:kind,lock_type:'DialLock',lock_category:'combination',lock_category_name:'密码锁',lock_quality:null,lock_quality_name:null,success:false,failed_attempts:0,owner_name:'PlayerB'});
 expect(gameplayComplete(e,e.metadata)).toBe(true);expect(e.raw).toBe(line(kind));
});
it('does not reinterpret unexpected types, N/A, or target tiers as quality',()=>{
 for(const token of ['N/A','Easy','Hard','VeryHard','Gold','NewLock']){
  const e=parseFileLine(line('LockpickingMinigame_C',token),'gameplay_fixture.log',1,{});
  expect(e.metadata).toMatchObject({lock_type:token,lock_category:'unknown',lock_category_name:'未知',lock_quality:'unknown',lock_quality_name:'未知'});
 }
 expect(lockpickFields('DialLock','Locker_Tear_4_C','N/A').lock_quality).toBeNull();
});
it('retains parsed outcomes when coordinates are absent instead of changing password game family',()=>{
 const e=parseFileLine(line().replace(/\. Location:.*$/,'.'),'gameplay_fixture.log',1,{});
 expect(e.event_type).toBe('lockpick');expect(e.x).toBeNull();expect(e.metadata.success).toBe(false);expect(gameplayComplete(e,e.metadata)).toBe(false);
});
it('translates all eleven requested tokens using neutral user-approved names',()=>{
 expect(STAGE21_TARGET_TOKENS.map(token=>LOCKPICK_TARGETS[token])).toEqual(['Rager 物品容器','Laika 物品容器','Barba 物品容器','石厩左门','工具棚门','简易木箱','Wolfswagen 物品容器','中式金属宝箱','防化服柜（一号）','防化服柜（二号）','医疗容器']);
 expect(Object.keys(LOCKPICK_TARGETS)).toHaveLength(21);
});
