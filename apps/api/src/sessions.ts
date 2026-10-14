import type Database from 'better-sqlite3';
export function repairSessions(db:Database.Database,now=Date.now()){
 let repaired=0;db.transaction(()=>{const rows=db.prepare('SELECT * FROM sessions WHERE leave_ts IS NULL ORDER BY steam_id,join_ts,id').all() as any[];
 for(const s of rows){
 const next=db.prepare('SELECT MIN(join_ts) ts FROM sessions WHERE steam_id=? AND join_ts>?').get(s.steam_id,s.join_ts) as any;
 const leave=db.prepare("SELECT MIN(ts) ts FROM events WHERE actor_steam_id=? AND event_type='player_leave' AND ts>=?").get(s.steam_id,s.join_ts) as any;
 const restart=db.prepare("SELECT MIN(ts) ts FROM events WHERE family='login' AND event_type='server_event' AND json_extract(metadata,'$.operation')='game_version' AND ts>?").get(s.join_ts) as any;
 const last=db.prepare("SELECT MAX(ts) ts FROM events WHERE (actor_steam_id=? OR target_steam_id=?) AND event_type!='server_event' AND ts>=? AND ts<?").get(s.steam_id,s.steam_id,s.join_ts,next.ts??new Date(now+1).toISOString()) as any;
 let end:string|null=null,reason:string|null=null;
 for(const [ts,r] of [[leave.ts,'explicit_leave'],[next.ts,'next_join'],[restart.ts,'server_restart']] as const)if(ts&&Date.parse(ts)<=now&&(!end||ts<end)){end=ts;reason=r;}
 if(!end&&now-Date.parse(last.ts??s.join_ts)>=86400000){end=last.ts??s.join_ts;reason='inactive_24h';}
 if(end&&end>=s.join_ts){db.prepare('UPDATE sessions SET leave_ts=?,duration_sec=?,repair_reason=? WHERE id=?').run(end,Math.max(0,(Date.parse(end)-Date.parse(s.join_ts))/1000),reason,s.id);repaired++;}
 }
 })();return repaired;
}
