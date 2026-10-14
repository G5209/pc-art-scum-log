import type Database from 'better-sqlite3';

/** Durations come from paired login records, never from a player's display name. */
export function sessionFields(db:Database.Database){
 const join=db.prepare('SELECT * FROM sessions WHERE steam_id=? AND join_ts=? ORDER BY id DESC LIMIT 1');
 const leave=db.prepare('SELECT * FROM sessions WHERE steam_id=? AND leave_ts=? AND join_ts<=? ORDER BY join_ts DESC,id DESC LIMIT 1');
 return (e:Record<string,any>)=>{
  if(!['player_join','player_leave'].includes(e.event_type)||!e.actor_steam_id||!e.ts)return {};
  const s=(e.event_type==='player_join'?join.get(e.actor_steam_id,e.ts):leave.get(e.actor_steam_id,e.ts,e.ts)) as Record<string,any>|undefined;
  return {session_id:s?.id??null,duration_sec:s?.duration_sec??null,duration_source:s?'session_pair':null,
   duration_estimated:!!s?.repair_reason&&s.repair_reason!=='explicit_leave',session_repair_reason:s?.repair_reason??null};
 };
}
