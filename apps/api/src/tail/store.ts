import crypto from 'node:crypto';
import {cachedPrepare} from '../performance';
const prepares=new WeakMap<Database.Database,ReturnType<typeof cachedPrepare>>();
import type Database from 'better-sqlite3';import type {Event} from '@scum/shared';
import {repairSessions} from '../sessions';
export function storeEvents(db:Database.Database,events:Event[],generation=0){
 const prepare=prepares.get(db)??cachedPrepare(db);prepares.set(db,prepare);
 const columns=['ts','server_id','family','event_type','actor_steam_id','actor_name','actor_char_id','target_steam_id','target_name','target_char_id','message','x','y','z','metadata','raw','source_file','source_line_no','created_at'];
 const changed:any[]=[],actors=new Set<string>(),days=new Set<string>();
 for(const e of events){
 const key=crypto.createHash('sha1').update(`tail\0${e.source_file}\0${generation}\0${e.source_line_no}`).digest('hex');
 const prior=(prepare('SELECT * FROM events WHERE event_key=?').get(key)??(generation===0?prepare('SELECT * FROM events WHERE source_file=? AND source_line_no=?').get(e.source_file,e.source_line_no):undefined)) as any;
 let metadata=e.metadata;
 // Offline merging records removed row IDs; later live previews must retain
 // that audit evidence only for the exact same source fingerprint.
 if(prior?.event_key===key){let previous:any;try{previous=JSON.parse(prior.metadata);}catch{}
  if(Array.isArray(previous?.merged_event_ids)){
   const ids=[...new Set([...previous.merged_event_ids,...(Array.isArray(metadata.merged_event_ids)?metadata.merged_event_ids:[])].filter(id=>Number.isSafeInteger(id)&&id>0))];
   metadata={...metadata,merged_event_ids:ids};
  }
 }
 if(prior&&prior.raw===e.raw&&prior.metadata===JSON.stringify(metadata))continue;
 const params:any={event_key:key};for(const c of columns)params[c]=(e as any)[c]??null;params.created_at=prior?.created_at??new Date().toISOString();params.metadata=JSON.stringify(metadata);
 if(prior){params.id=prior.id;prepare(`UPDATE events SET event_key=@event_key,${columns.map(c=>c+'=@'+c).join(',')} WHERE id=@id`).run(params);}
 else params.id=Number(prepare(`INSERT INTO events(event_key,${columns.join(',')}) VALUES (@event_key,${columns.map(c=>'@'+c).join(',')})`).run(params).lastInsertRowid);
 // Unknown evidence is append-only for live ingest: truncation may reuse a line number.
 if(e.event_type==='unknown'&&!prepare('SELECT 1 FROM unknown_lines WHERE source_file=? AND line_no=? AND raw=?').get(e.source_file,e.source_line_no,e.raw))prepare('INSERT INTO unknown_lines(source_file,line_no,raw,created_at) VALUES (?,?,?,?)').run(e.source_file,e.source_line_no,e.raw,params.created_at);
 if(e.ts)days.add(e.ts.slice(0,10));for(const id of [e.actor_steam_id,e.target_steam_id])if(id&&/^\d{16,17}$/.test(id))actors.add(id);
 if(e.event_type==='player_join'&&e.actor_steam_id&&e.ts&&!prepare('SELECT 1 FROM sessions WHERE steam_id=? AND join_ts=?').get(e.actor_steam_id,e.ts))prepare('INSERT INTO sessions(steam_id,join_ts) VALUES (?,?)').run(e.actor_steam_id,e.ts);
 changed.push({...params,metadata});
 }
 for(const id of actors){const latest=prepare("SELECT CASE WHEN actor_steam_id=@id THEN actor_name ELSE target_name END name,MAX(ts) ts FROM events WHERE (actor_steam_id=@id OR target_steam_id=@id) AND event_type!='server_event'").get({id}) as any;
 const n=prepare(`SELECT SUM(event_type='player_join' AND actor_steam_id=@id) joins,SUM(event_type='player_chat' AND actor_steam_id=@id) chats,SUM(event_type='player_death' AND actor_steam_id=@id AND actor_steam_id!=target_steam_id) kills,SUM(event_type='player_death' AND target_steam_id=@id) deaths FROM events WHERE actor_steam_id=@id OR target_steam_id=@id`).get({id}) as any;
 prepare('INSERT OR REPLACE INTO players VALUES (?,?,?,?,?,?,?)').run(id,latest.name,latest.ts,n.joins??0,n.kills??0,n.deaths??0,n.chats??0);
 }
 for(const day of days){const from=day+'T00:00:00.000Z',to=new Date(Date.parse(from)+86400000).toISOString();prepare(`INSERT OR REPLACE INTO daily_stats SELECT @day,SUM(event_type='player_join'),SUM(event_type='player_leave'),SUM(event_type='player_death' AND actor_steam_id IS NOT NULL AND actor_steam_id!=target_steam_id),SUM(event_type='player_death'),SUM(event_type='player_chat'),(SELECT COUNT(DISTINCT steam) FROM (SELECT actor_steam_id steam FROM events WHERE ts>=@from AND ts<@to UNION SELECT target_steam_id FROM events WHERE ts>=@from AND ts<@to) WHERE steam IS NOT NULL),COUNT(*) FROM events WHERE ts>=@from AND ts<@to`).run({day,from,to});}

 if(events.some(e=>e.family==='login'))repairSessions(db);
 return changed;
}
