/** Evidence-backed contracts. Physical source remains family=gameplay. */
export const GAMEPLAY_TYPES=['lockpick','disarm','bunker_minigame','chest_action','trap_action','base_building','bunker_lock','gameplay_event'] as const;
/**
 * SCUM has emitted several names for the bomb/lock defusal mini-game over
 * time.  Keep this deliberately data-driven so a new Defusal class routes to
 * the disarm page without another parser release.  Test/fake names beginning
 * with `Not` are excluded to avoid classifying negative fixtures as events.
 */
export function isBombDefusalKind(kind: unknown): kind is string {
 const value=String(kind??'');
 return value.length>0 && !/^Not/i.test(value) && /(?:BombDefusal|Defusal)/i.test(value);
}
export function gameplayComplete(e:Record<string,any>,m:Record<string,any>):boolean {
 const has=(v:any)=>v!=null&&v!==''&&(typeof v!=='number'||Number.isFinite(v));
 const all=(...v:any[])=>v.every(has),steam=(v:any)=>typeof v==='string'&&/^\d{17}$/.test(v);
 const actor=steam(e.actor_steam_id)&&all(e.actor_name,e.actor_char_id),xyz=['x','y','z'].every(k=>typeof e[k]==='number'&&Number.isFinite(e[k]));
 switch(m.operation){
 case 'lockpick':return actor&&all(m.success,m.elapsed_time_sec,m.failed_attempts,m.lock_type,m.target_object,m.target_object_id,m.owner_token,m.owner_status)&&xyz;
 case 'minigame':{
  const common=actor&&all(m.minigame,m.success,m.elapsed_time_sec,m.failed_attempts);
  const explicitId=has(m.target_object_id)&&m.target_object_id===m.target_object_id_token;
  const explicitAbsent=m.target_object_id===null&&m.target_object_id_token==='N/A';
  const instanceSuffix=typeof m.target_object==='string'?/_C_(\d+)$/.exec(m.target_object)?.[1]:undefined;
  const instanceEvidence=m.target_object_id===null&&m.target_object_id_token==null&&instanceSuffix!==undefined&&m.target_instance_suffix===instanceSuffix&&m.target_instance_suffix_source==='object_instance_name';
  const targetId=explicitId||explicitAbsent||instanceEvidence;
  if(isBombDefusalKind(m.minigame))return common&&all(m.target_object,m.owner_token,m.owner_status)&&targetId&&xyz;
  if(m.minigame==='BP_DialLockMinigame_C')return common&&all(m.target_object,m.target_object_id,m.lock_type,m.owner_token,m.owner_status)&&xyz;
  return common&&['AbandonedBunkerSlaveSwitchboardMinigame_01_C','AbandonedBunkerMasterSwitchboardMinigame_01_C','AbandonedBunkerVoltageMatchingMinigame_C','AbandonedBunkerDialPadMinigame_C','BP_QuestBookMinigame_C','BP_MobilePhoneMinigame_C'].includes(m.minigame);
 }
 case 'dial_pad_guess':return actor&&all(m.minigame,m.guessed_combination,m.first_try,m.room_id)&&xyz&&['x','y','z'].every(k=>typeof m.dial_pad_location?.[k]==='number'&&Number.isFinite(m.dial_pad_location[k]))&&(m.first_try===true||has(m.elapsed_since_first_try_sec));
 case 'bury':case 'unbury':return actor&&all(m.actor_role,m.chest_id,m.owner_name,m.owner_char_id)&&steam(m.owner_steam_id)&&xyz;
 case 'crafted':case 'armed':case 'disarmed':return actor&&has(m.trap_name)&&xyz;
 case 'triggered':return actor&&has(m.trap_name)&&steam(m.owner_steam_id)&&all(m.owner_name,m.owner_char_id)&&xyz;
 case 'created':case 'destroyed':return all(m.object_type,m.flag_id,m.owner_name,m.owner_char_id)&&steam(m.owner_steam_id)&&xyz;
 case 'item_attached':return actor&&has(m.item_name)&&xyz;
 case 'pin_pulled':case 'detonated':case 'ignited':return actor&&has(m.explosive_name)&&xyz;
 case 'bunker_status':return all(m.region,m.status,m.elapsed_since)&&xyz&&(m.status!=='Locked'||has(m.next_activation));
 case 'activated':return all(m.region,m.elapsed_since);
 case 'deactivated':return has(m.region);
 default:return false;
 }
}
