import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {parseDocument} from './document';
import type {Event} from '@scum/shared';
export const SCHEMA=`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,event_key TEXT UNIQUE,ts TEXT,server_id TEXT NOT NULL,family TEXT NOT NULL,event_type TEXT NOT NULL,actor_steam_id TEXT,actor_name TEXT,actor_char_id TEXT,target_steam_id TEXT,target_name TEXT,target_char_id TEXT,message TEXT,x REAL,y REAL,z REAL,metadata TEXT NOT NULL,raw TEXT NOT NULL,source_file TEXT NOT NULL,source_line_no INTEGER NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS players(steam_id TEXT PRIMARY KEY,name TEXT,last_seen TEXT,join_count INTEGER NOT NULL DEFAULT 0,kill_count INTEGER NOT NULL DEFAULT 0,death_count INTEGER NOT NULL DEFAULT 0,chat_count INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,steam_id TEXT NOT NULL,join_ts TEXT NOT NULL,leave_ts TEXT,duration_sec INTEGER);CREATE TABLE IF NOT EXISTS daily_stats(day TEXT PRIMARY KEY,joins INTEGER DEFAULT 0,leaves INTEGER DEFAULT 0,kills INTEGER DEFAULT 0,deaths INTEGER DEFAULT 0,chats INTEGER DEFAULT 0,unique_players INTEGER DEFAULT 0,event_count INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS ingest_files(path TEXT PRIMARY KEY,size INTEGER NOT NULL,mtime INTEGER NOT NULL,sha1 TEXT NOT NULL,processed_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS unknown_lines(id INTEGER PRIMARY KEY,source_file TEXT NOT NULL,line_no INTEGER NOT NULL,raw TEXT NOT NULL,created_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_steam_id);CREATE INDEX IF NOT EXISTS idx_events_target ON events(target_steam_id);CREATE INDEX IF NOT EXISTS idx_events_family ON events(family);`;
// Bump when classification rules change so existing source files are parsed again.
export const PARSER_VERSION='19.1.0';
export function initDb(db:Database.Database){
 db.exec(SCHEMA);db.pragma('journal_mode = WAL');
 const columns=(db.prepare('PRAGMA table_info(ingest_files)').all() as {name:string}[]).map(c=>c.name);
 for(const [name,type] of Object.entries({parser_version:'TEXT',family:'TEXT',physical_lines:'INTEGER DEFAULT 0',nonempty_lines:'INTEGER DEFAULT 0',blank_lines:'INTEGER DEFAULT 0',unknown_lines:'INTEGER DEFAULT 0',event_count:'INTEGER DEFAULT 0'}))if(!columns.includes(name))db.exec(`ALTER TABLE ingest_files ADD COLUMN ${name} ${type}`);
}
function rebuildAggregates(db:Database.Database){
 db.exec('DELETE FROM players;DELETE FROM sessions;DELETE FROM daily_stats;');
 const rows=db.prepare('SELECT * FROM events ORDER BY ts,id').all() as Event[];
 const players=new Map<string,{name:string|null;last:string|null;join:number;kill:number;death:number;chat:number}>();
 const pending=new Map<string,{id:number;ts:string}>();
 const insertSession=db.prepare('INSERT INTO sessions(steam_id,join_ts) VALUES (?,?)');
 for(const e of rows){
  if(e.event_type==='server_event')continue;
  for(const [steam,name] of [[e.actor_steam_id,e.actor_name],[e.target_steam_id,e.target_name]]){
   if(!steam||!/^\d{16,17}$/.test(steam))continue;
   let p=players.get(steam);if(!p){p={name:null,last:null,join:0,kill:0,death:0,chat:0};players.set(steam,p);}
   if(e.ts&&(!p.last||e.ts>=p.last)){p.last=e.ts;if(name)p.name=name;}
  }
  const actor=e.actor_steam_id?players.get(e.actor_steam_id):undefined,target=e.target_steam_id?players.get(e.target_steam_id):undefined;
  if(e.event_type==='player_join'&&actor){actor.join++;if(e.ts&&e.actor_steam_id){const r=insertSession.run(e.actor_steam_id,e.ts);pending.set(e.actor_steam_id,{id:Number(r.lastInsertRowid),ts:e.ts});}}
  if(e.event_type==='player_leave'&&e.actor_steam_id&&e.ts){const p=pending.get(e.actor_steam_id);if(p){const duration=(Date.parse(e.ts)-Date.parse(p.ts))/1000;if(duration>=0)db.prepare('UPDATE sessions SET leave_ts=?,duration_sec=? WHERE id=?').run(e.ts,duration,p.id);pending.delete(e.actor_steam_id);}}
  if(e.event_type==='player_chat'&&actor)actor.chat++;
  if(e.event_type==='player_death'){if(actor&&e.actor_steam_id!==e.target_steam_id)actor.kill++;if(target)target.death++;}
 }
 const insert=db.prepare('INSERT INTO players(steam_id,name,last_seen,join_count,kill_count,death_count,chat_count) VALUES (?,?,?,?,?,?,?)');
 for(const [id,p] of players)insert.run(id,p.name,p.last,p.join,p.kill,p.death,p.chat);
 db.exec(`INSERT INTO daily_stats(day,joins,leaves,kills,deaths,chats,unique_players,event_count) SELECT substr(ts,1,10),SUM(event_type='player_join'),SUM(event_type='player_leave'),SUM(event_type='player_death' AND actor_steam_id IS NOT NULL AND actor_steam_id!=target_steam_id),SUM(event_type='player_death'),SUM(event_type='player_chat'),0,COUNT(*) FROM events WHERE ts IS NOT NULL GROUP BY substr(ts,1,10);
 UPDATE daily_stats SET unique_players=(SELECT COUNT(DISTINCT steam) FROM (SELECT actor_steam_id steam,substr(ts,1,10) day FROM events WHERE event_type!='server_event' UNION ALL SELECT target_steam_id,substr(ts,1,10) FROM events WHERE event_type!='server_event') WHERE day=daily_stats.day AND steam IS NOT NULL);`);
}
export function ingestDir(dir:string,dbPath:string){
 fs.mkdirSync(path.dirname(dbPath),{recursive:true});const db=new Database(dbPath);initDb(db);
 const columns=['ts','server_id','family','event_type','actor_steam_id','actor_name','actor_char_id','target_steam_id','target_name','target_char_id','message','x','y','z','metadata','raw','source_file','source_line_no','created_at'];
 const insert=db.prepare(`INSERT INTO events(event_key,${columns.join(',')}) VALUES (@event_key,${columns.map(c=>'@'+c).join(',')})`);
 let count=0,unknownCount=0,processed=0;
 try{db.transaction(()=>{
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.log')).sort()){
   const full=path.join(dir,name),stat=fs.statSync(full),bytes=fs.readFileSync(full),sha1=crypto.createHash('sha1').update(bytes).digest('hex');
   if(db.prepare('SELECT 1 FROM ingest_files WHERE path=? AND sha1=? AND parser_version=?').get(name,sha1,PARSER_VERSION))continue;
   const parsed=parseDocument(bytes,name);db.prepare('DELETE FROM events WHERE source_file=?').run(name);db.prepare('DELETE FROM unknown_lines WHERE source_file=?').run(name);
   for(const e of parsed.events){const params:Record<string,unknown>={};for(const c of columns)params[c]=(e as unknown as Record<string,unknown>)[c]??null;params.metadata=JSON.stringify(e.metadata);params.created_at=new Date().toISOString();params.event_key=crypto.createHash('sha1').update(`${name}\0${e.source_line_no}\0${e.raw}`).digest('hex');insert.run(params);if(e.event_type==='unknown')db.prepare('INSERT INTO unknown_lines(source_file,line_no,raw,created_at) VALUES (?,?,?,?)').run(name,e.source_line_no,e.raw,params.created_at);}
   db.prepare('INSERT OR REPLACE INTO ingest_files(path,size,mtime,sha1,processed_at,parser_version,family,physical_lines,nonempty_lines,blank_lines,unknown_lines,event_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(name,stat.size,Math.floor(stat.mtimeMs),sha1,new Date().toISOString(),PARSER_VERSION,parsed.events[0]?.family??'unknown',parsed.physical_lines,parsed.nonempty_lines,parsed.blank_lines,parsed.unknown_lines,parsed.events.length);
   count+=parsed.events.length;unknownCount+=parsed.unknown_lines;processed++;
  }
  if(processed)rebuildAggregates(db);
 })();
 const families=db.prepare('SELECT family,SUM(physical_lines) physical_lines,SUM(nonempty_lines) nonempty_lines,SUM(blank_lines) blank_lines,SUM(unknown_lines) unknown_lines,SUM(event_count) event_count,1.0*SUM(unknown_lines)/MAX(SUM(nonempty_lines),1) unknown_ratio FROM ingest_files GROUP BY family').all();
 return {count,unknownCount,processed,total:(db.prepare('SELECT COUNT(*) count FROM events').get() as {count:number}).count,families};
 }finally{db.close();}
}
