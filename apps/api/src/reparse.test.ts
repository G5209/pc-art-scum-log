import Database from 'better-sqlite3';
import {it,expect} from 'vitest';
import {initDb} from '@scum/parser/dist/ingest';
import {reparseEvents} from './reparse';
it('reparses chest in place, preserves sessions/cursors and source keys, and is idempotent',()=>{
 const db=new Database(':memory:');initDb(db);
 const owner='90000098000000002',actor='90000098000000001';
 const raw=`2026.10.06-10.00.00: [LogChest] [Bury] ChestId: 42 Owner: ${owner} (2, 物主) Location: X=0 Y=1 Z=2 Burier: ${actor} (1, 操作者)`;
 db.prepare(`INSERT INTO events(id,event_key,ts,server_id,family,event_type,actor_steam_id,actor_name,metadata,raw,source_file,source_line_no,created_at) VALUES (1,'stable-key','2026-10-06T10:00:00Z','default','gameplay','gameplay_event',?,'物主',?,?,'gameplay_test.log',99,'2026-10-06T10:00:01Z')`).run(owner,JSON.stringify({subfamily:'LogChest',datasource_epoch:5}),raw);
 db.prepare('INSERT INTO sessions(steam_id,join_ts) VALUES (?,?)').run(actor,'2026-10-06T09:00:00Z');
 db.exec('CREATE TABLE files_state(remote_path TEXT,local_offset INTEGER); INSERT INTO files_state VALUES (\'/gameplay.log\',200)');
 try{
  expect(reparseEvents(db)).toMatchObject({corrected:1,actor_changed:1,before:1,after:1});
  const e=db.prepare('SELECT * FROM events').get() as any;
  expect(e).toMatchObject({id:1,event_key:'stable-key',actor_steam_id:actor,source_line_no:99,raw});
  expect(JSON.parse(e.metadata)).toMatchObject({owner_steam_id:owner,actor_role:'burier',source_line_nos:[99],datasource_epoch:5});
  expect(db.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({n:1});expect(db.prepare('SELECT local_offset FROM files_state').get()).toEqual({local_offset:200});
  expect(db.prepare('SELECT unique_players FROM daily_stats').get()).toEqual({unique_players:1});
  expect(reparseEvents(db).corrected).toBe(0);
 }finally{db.close();}
});
