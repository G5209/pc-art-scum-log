import {EventEmitter} from 'node:events';import type Database from 'better-sqlite3';
export interface OnlinePlayer{steam_id:string;name:string;char_id:string|null;joined_at:string;last_seen_at:string;last_event_type:string}
export class OnlineRegistry extends EventEmitter{
 players=new Map<string,OnlinePlayer>();source:'tail'|'rebuilt'='rebuilt';ts=new Date().toISOString();private day=this.ts.slice(0,10);
 constructor(readonly timeoutSec=Number(process.env.ONLINE_TIMEOUT_SEC)||300){super();}
 private key(){return [...this.players.keys()].sort().join(',');}
 private publish(before:string,now:number){this.ts=new Date(now).toISOString();if(before!==this.key())this.emit('change',this.snapshot());}
 consume(events:any[],now=Date.now()){const before=this.key();this.rollover(now);for(const e of events){if(!e.ts||Date.parse(e.ts)>now+60000)continue;if(e.family==='login'&&e.event_type==='server_event'&&e.metadata?.operation==='game_version'){for(const [id,p] of this.players)if(e.ts>p.joined_at)this.players.delete(id);continue;}for(const [id,name,char] of [[e.actor_steam_id,e.actor_name,e.actor_char_id],[e.target_steam_id,e.target_name,e.target_char_id]]){
 if(!id||!/^\d{16,17}$/.test(id))continue;const prior=this.players.get(id);if(prior&&e.ts<prior.last_seen_at)continue;
 if(e.event_type==='player_leave'&&id===e.actor_steam_id){this.players.delete(id);continue;}
 if(e.event_type==='player_join'&&id===e.actor_steam_id&&e.ts.slice(0,10)===this.day&&now-Date.parse(e.ts)<this.timeoutSec*1000)this.players.set(id,{steam_id:id,name:name??id,char_id:char??null,joined_at:e.ts,last_seen_at:e.ts,last_event_type:e.event_type});
 else if(prior&&e.event_type!=='server_event'){prior.last_seen_at=e.ts;prior.last_event_type=e.event_type;if(name)prior.name=name;if(char)prior.char_id=char;}
 }}this.source='tail';this.expire(now,false);this.publish(before,now);}
 private rollover(now:number){const day=new Date(now).toISOString().slice(0,10);if(day!==this.day){for(const [id,p] of this.players)if(!p.joined_at.startsWith(day))this.players.delete(id);this.day=day;}}
 expire(now=Date.now(),notify=true){const before=this.key();this.rollover(now);for(const [id,p] of this.players)if(now-Date.parse(p.last_seen_at)>this.timeoutSec*1000)this.players.delete(id);if(notify)this.publish(before,now);}
 rebuild(db:Database.Database,now=Date.now()){const before=this.key();this.players.clear();this.day=new Date(now).toISOString().slice(0,10);const since=this.day+'T00:00:00.000Z';const epoch=(db.prepare("SELECT 1 FROM sqlite_master WHERE name='datasource_state'").get()?(db.prepare('SELECT epoch FROM datasource_state').get() as any)?.epoch:0)??0;const scope=epoch>1?` AND json_extract(metadata,'$.datasource_epoch')=${Number(epoch)}`:'';const events=db.prepare("SELECT ts,event_type,family,actor_steam_id,actor_name,actor_char_id,target_steam_id FROM events WHERE ts>=? AND ts<=? AND (event_type!='server_event' OR (family='login' AND json_extract(metadata,'$.operation')='game_version')) ORDER BY ts,id".replace(" ORDER BY",scope+" ORDER BY")).all(since,new Date(now).toISOString());
 // Replay without expiring a join before later evidence in the SAME replay has been applied.
 for(const e of events as any[]){if(e.family==='login'&&e.event_type==='server_event'){this.players.clear();continue;}const id=e.actor_steam_id;if(e.event_type==='player_join'&&id)this.players.set(id,{steam_id:id,name:e.actor_name??id,char_id:e.actor_char_id??null,joined_at:e.ts,last_seen_at:e.ts,last_event_type:e.event_type});else if(e.event_type==='player_leave'&&id)this.players.delete(id);else for(const pId of [id,e.target_steam_id]){const p=this.players.get(pId);if(p){p.last_seen_at=e.ts;p.last_event_type=e.event_type;if(pId===id&&e.actor_name)p.name=e.actor_name;}}}
 for(const [id,p] of this.players){const closed=db.prepare('SELECT leave_ts FROM sessions WHERE steam_id=? AND join_ts=? AND leave_ts IS NOT NULL').get(id,p.joined_at);if(closed)this.players.delete(id);}
 this.expire(now,false);this.source='rebuilt';this.publish(before,now);return this.snapshot();}
 snapshot(){return {source:this.source,ts:this.ts,count:this.players.size,players:[...this.players.values()].sort((a,b)=>a.steam_id.localeCompare(b.steam_id))};}
}
