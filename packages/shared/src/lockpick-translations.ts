/** Stage 22 user contract, corroborated by rz observations; never infer quality from target tiers. */
export const LOCK_TYPE_MAPPING:Record<string,{category:string;quality:string|null}>={
 Basic:{category:'挂锁',quality:'铁锁'},Medium:{category:'挂锁',quality:'银锁'},
 Advanced:{category:'挂锁',quality:'金锁'},VeryEasy:{category:'挂锁',quality:'简易锁'},
 DialLock:{category:'密码锁',quality:null},'N/A':{category:'未知',quality:'未知'},
};
export const LOCK_QUALITY_FROM_TYPE:Record<string,string>={Basic:'Iron',Medium:'Silver',Advanced:'Gold',VeryEasy:'Basic'};
export const LOCK_QUALITIES:Record<string,string>={Basic:'简易锁',Iron:'铁锁',Silver:'银锁',Gold:'金锁'};
export const LOCK_DIFFICULTIES:Record<string,string>={Basic:'基础',VeryEasy:'非常简单',Easy:'简单',Medium:'普通',Hard:'困难',VeryHard:'非常困难',Advanced:'高级'};
export const LOCKPICK_TARGETS:Record<string,string>={
 BPLockpick_Weapon_Locker_Military_C:'军用武器柜',
 BPLockpick_Weapon_Locker_Police_C:'警用武器柜',
 BPLockpick_Weapon_Locker_Military_Tier_1_C:'军用武器柜（一阶）',
 BPLockpick_TV_Base_Weapon_Locker_Military_Tear_2_C:'军用武器柜（型号 Tear 2）',
 BPLockpick_TV_Base_Weapon_Locker_Military_Tear_3_C:'军用武器柜（型号 Tear 3）',
 BPLockpick_TV_Base_Weapon_Locker_Military_Tear_4_C:'军用武器柜（型号 Tear 4）',
 Rager_Item_Container_C:'Rager 物品容器',Laika_Item_Container_C:'Laika 物品容器',
 Barba_Item_Container_C:'Barba 物品容器',Wolfswagen_Item_Container_C:'Wolfswagen 物品容器',
 BP_KillBoxRoomMeshDoor_C:'击杀箱房间网格门',Improvised_Metal_Chest_C:'简易金属箱',
 Improvised_Wooden_Chest_C:'简易木箱',BP_ToolShed_Doors_C:'工具棚门',
 BPLockpick_CargoDrop_01_ArmoryBox_C:'空投武器箱',
 BPLockpick_Medical_Container_TEC01_C:'医疗容器',
 BPLockpick_NPP_DepletedUraniumStorage_01_C:'核电站贫铀储存柜',
 BPLockpick_Hazmat_Suit_Locker_01_C:'防化服柜（一号）',
 BPLockpick_Hazmat_Suit_Locker_02_C:'防化服柜（二号）',
 BP_StoneStable_A_Door_L_C:'石厩左门',Asian_Chest_Metal_C:'中式金属宝箱',
};
/** Only these targets are eligible for the stage 21/22 historical name update. */
export const STAGE21_TARGET_TOKENS=['Rager_Item_Container_C','Laika_Item_Container_C','Barba_Item_Container_C','BP_StoneStable_A_Door_L_C','BP_ToolShed_Doors_C','Improvised_Wooden_Chest_C','Wolfswagen_Item_Container_C','Asian_Chest_Metal_C','BPLockpick_Hazmat_Suit_Locker_01_C','BPLockpick_Hazmat_Suit_Locker_02_C','BPLockpick_Medical_Container_TEC01_C'];
export function isLockpickMinigame(kind:string){return /^(?:BP_)?(?:Lockpicking|DialLock)Minigame_C$/.test(kind);}
export function lockpickOwnership(token:string){
 const value=token.trim();
 const player=/^(?<char>\d+)\(\[(?<steam>\d{17})\]\s*(?<name>.+?)\)$/.exec(value)?.groups
  ?? /^(?<name>.+?)\s*\((?<char>\d+),\s*(?<steam>\d{17})\)$/.exec(value)?.groups;
 const status=player?'player':value==='N/A'?'system':/^0\((?:World)?\)$/i.test(value)?'world':'unknown';
 return {owner_token:token,owner_status:status,owner_kind:player?'player':value==='N/A'?'system':value==='0()'?'world_object':/^0\(World\)$/i.test(value)?'world_lock':'unknown',owner_name:player?.name??null,owner_char_id:player?.char??null,owner_steam_id:player?.steam??null};
}
export function lockpickFields(lock:string,target:string,owner:string){
 const mapped=LOCK_TYPE_MAPPING[lock],quality=LOCK_QUALITY_FROM_TYPE[lock]??(mapped?.quality===null?null:'unknown');
 return {lock_category:lock==='DialLock'?'combination':LOCK_QUALITY_FROM_TYPE[lock]?'padlock':'unknown',lock_category_name:mapped?.category??'未知',
  lock_quality:quality,lock_quality_name:mapped?.quality??(mapped?.quality===null?null:'未知'),
  lock_difficulty:LOCK_DIFFICULTIES[lock]?lock:null,lock_difficulty_name:LOCK_DIFFICULTIES[lock]??null,
  target_object_name:LOCKPICK_TARGETS[target]??null,...lockpickOwnership(owner)};
}
