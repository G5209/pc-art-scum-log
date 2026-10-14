import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {initDb} from '@scum/parser/dist/ingest';
import {reparseHistory} from './reparse-stage19';
import {classifyFields} from './coverage';
const stamp='2026.10.13-10.00.00: ',steam='90000098000000001';
const header=stamp+'Wall Cement (42), {X=0 Y=1 Z=2|P=0 Y=0 R=0}:';
const contribution=stamp+steam+' (1, 玩家). C4_C. 400.000000.';
function insert(db:Database.Database,id:number,no:number,raw:string,key?:string,epoch=1){
 key??=crypto.createHash('sha1').update(`base_building_destruction_test.log\0${no}\0${raw}`).digest('hex');
 db.prepare("INSERT INTO events(id,event_key,ts,server_id,family,event_type,metadata,raw,source_file,source_line_no,created_at) VALUES (?,?,'2026-10-13T10:00:00Z','default','base_building_destruction','unknown',?,?,'base_building_destruction_test.log',?,'2026-10-13T10:00:01Z')").run(id,key,JSON.stringify({datasource_epoch:epoch}),raw,no);
 return key;
}
it('reparses historical split building records atomically without losing raw, keys, epochs or cursors',()=>{
 const db=new Database(':memory:');initDb(db);
 try{
  const initialKey=insert(db,1,20,header);insert(db,2,21,contribution);insert(db,3,22,stamp+'. TNT_C. 200.000000.');
  db.exec("CREATE TABLE files_state(remote_path TEXT,generation INTEGER,local_offset INTEGER);INSERT INTO files_state VALUES('base_building_destruction_test.log',0,2048)");
  expect(reparseHistory(db)).toMatchObject({before:3,after:1,merged_rows:2,remaining_unknown:0});
  const e=db.prepare('SELECT * FROM events').get() as any;
  expect(e).toMatchObject({id:1,event_key:initialKey,source_line_no:20,event_type:'base_building',raw:[header,contribution,stamp+'. TNT_C. 200.000000.'].join('\n')});
  expect(JSON.parse(e.metadata)).toMatchObject({datasource_epoch:1,source_line_nos:[20,21,22],contributions:[{steam_id:steam,source_line_no:21,recorded_value:400},{steam_id:null,source_line_no:22,recorded_value:200}]});
  expect(classifyFields(e)).toBe('full');expect(db.prepare('SELECT local_offset FROM files_state').get()).toEqual({local_offset:2048});
  expect(reparseHistory(db)).toMatchObject({before:1,after:1,corrected:0,merged_rows:0});
 }finally{db.close();}
});
it('proves generations beyond one hundred without merging different truncations',()=>{
 const db=new Database(':memory:');initDb(db);
 try{
  const key=(g:number,no:number)=>crypto.createHash('sha1').update(`tail\0base_building_destruction_test.log\0${g}\0${no}`).digest('hex');
  insert(db,1,20,header,key(101,20));insert(db,2,21,contribution,key(102,21));
  insert(db,3,30,header,key(102,30));insert(db,4,31,contribution,key(102,31));
  db.exec("CREATE TABLE files_state(remote_path TEXT,generation INTEGER);INSERT INTO files_state VALUES('base_building_destruction_test.log',102)");
  expect(reparseHistory(db)).toMatchObject({before:4,after:3,merged_rows:1,ambiguous_source_rows:0});
  expect(JSON.parse((db.prepare('SELECT metadata FROM events WHERE id=2').get() as any).metadata).orphan_contribution).toBe(true);
  const paired=db.prepare('SELECT raw,metadata FROM events WHERE id=3').get() as any;
  expect(paired.raw).toBe(header+'\n'+contribution);expect(JSON.parse(paired.metadata).source_line_nos).toEqual([30,31]);
  expect(reparseHistory(db)).toMatchObject({before:3,after:3,corrected:0,merged_rows:0});
 }finally{db.close();}
});
it('verifies million-wide source epoch namespaces with bounded hashing and safe historical fallback',()=>{
 const db=new Database(':memory:');initDb(db);
 const key=(g:number,no:number)=>crypto.createHash('sha1').update(`tail\0base_building_destruction_test.log\0${g}\0${no}`).digest('hex');
 insert(db,1,20,header,key(3000000,20),3);insert(db,2,21,contribution,key(3000000,21),3);
 insert(db,3,30,header,key(2999999,30),2);insert(db,4,31,contribution.replace('10.00.00','10.00.01'),key(3000000,31),3);
 insert(db,5,40,header,key(2000000,40),2);insert(db,6,41,contribution,key(2000000,41),2);
 insert(db,7,50,header,key(1800000,50),2);insert(db,8,51,contribution,key(1800001,51),2);
 db.exec("CREATE TABLE files_state(remote_path TEXT,generation INTEGER);INSERT INTO files_state VALUES('base_building_destruction_test.log',3000000)");
 const hash=vi.spyOn(crypto,'createHash');
 try{
  expect(reparseHistory(db)).toMatchObject({before:8,after:6,merged_rows:2,ambiguous_source_rows:2});
  // Enforce constant work rather than a flaky elapsed-time threshold. The
  // namespace must not trigger three million SHA-1 attempts per source row.
  expect(hash.mock.calls.length).toBeLessThan(1000);
  for(const id of [4,8])expect(JSON.parse((db.prepare('SELECT metadata FROM events WHERE id=?').get(id) as any).metadata).orphan_contribution).toBe(true);
  expect((db.prepare('SELECT raw FROM events WHERE id=7').get() as any).raw).toBe(header);
  hash.mockClear();expect(reparseHistory(db)).toMatchObject({before:6,after:6,corrected:0,merged_rows:0});
  expect(hash.mock.calls.length).toBeLessThan(1000);
 }finally{hash.mockRestore();db.close();}
});
it.each(['missing file state','unknown fingerprints'])('reparses %s independently and preserves all source evidence',mode=>{
 const db=new Database(':memory:');initDb(db);
 try{
  const key=(g:number,no:number)=>mode==='missing file state'?crypto.createHash('sha1').update(`tail\0base_building_destruction_test.log\0${1000+g}\0${no}`).digest('hex'):`unproven-key-${g}`;
  const firstKey=key(1,20),secondKey=key(2,21);
  insert(db,1,20,header,firstKey);insert(db,2,21,contribution,secondKey);
  if(mode==='unknown fingerprints')db.exec("CREATE TABLE files_state(remote_path TEXT,generation INTEGER);INSERT INTO files_state VALUES('base_building_destruction_test.log',2)");
  expect(reparseHistory(db)).toMatchObject({before:2,after:2,merged_rows:0,ambiguous_source_rows:2});
  expect(db.prepare('SELECT id,event_key,raw,source_line_no FROM events ORDER BY id').all()).toEqual([{id:1,event_key:firstKey,raw:header,source_line_no:20},{id:2,event_key:secondKey,raw:contribution,source_line_no:21}]);
  expect(JSON.parse((db.prepare('SELECT metadata FROM events WHERE id=2').get() as any).metadata).orphan_contribution).toBe(true);
  expect(reparseHistory(db)).toMatchObject({before:2,after:2,corrected:0,merged_rows:0});
 }finally{db.close();}
});
it('never associates a contribution across source epochs or truncated generations',()=>{
 const db=new Database(':memory:');initDb(db);
 try{
  const key=(g:number,no:number)=>crypto.createHash('sha1').update(`tail\0base_building_destruction_test.log\0${g}\0${no}`).digest('hex');
  insert(db,1,20,header,key(1,20),1);insert(db,2,21,contribution,key(2,21),1);
  insert(db,3,22,contribution,'key-3',2);
  db.exec("CREATE TABLE files_state(remote_path TEXT,generation INTEGER);INSERT INTO files_state VALUES('base_building_destruction_test.log',2)");
  expect(reparseHistory(db)).toMatchObject({before:3,after:3,merged_rows:0});
  const e=db.prepare('SELECT metadata FROM events WHERE id=2').get() as any;expect(JSON.parse(e.metadata).orphan_contribution).toBe(true);
 }finally{db.close();}
});
it('counts source-explicit suicide and absent login coordinates without requiring invented values',()=>{
 const base={ts:'2026-10-13T10:00:00Z',actor_steam_id:steam,actor_name:'玩家',actor_char_id:'1'};
 const self={...base,event_type:'player_death',target_steam_id:steam,target_name:'玩家',metadata:{death_kind:'suicide',death_reason:'suicide',suicide:true,weapon:null,distance_m:null}};
 expect(classifyFields({...self,x:0,y:1,z:2})).toBe('full');
 expect(classifyFields(self)).toBe('partial');
 expect(classifyFields({...base,event_type:'player_leave',metadata:{ip:'192.0.2.1',action:'logged out',location_available:false}})).toBe('full');
 expect(classifyFields({...base,event_type:'player_leave',metadata:{ip:'192.0.2.1',action:'logged out'}})).toBe('partial');
});
it('rebuilds player aggregates for exact sixteen and seventeen digit source identities',()=>{
 const db=new Database(':memory:');initDb(db);
 try{
  const identities=['9000009929250154',steam],file='kill_test.log';
  const insert=db.prepare("INSERT INTO events(event_key,ts,server_id,family,event_type,metadata,raw,source_file,source_line_no,created_at) VALUES (?,'2026-10-13T10:00:00Z','default','kill','unknown','{}',?,?,?,'2026-10-13T10:00:01Z')");
  for(let i=0;i<identities.length;i++){
   const raw=stamp+`Committed suicide. User: 玩家${i+1} (${i+1}, ${identities[i]}). Location: X=0 Y=1 Z=2`;
   insert.run(crypto.createHash('sha1').update(`${file}\0${i+1}\0${raw}`).digest('hex'),raw,file,i+1);
  }
  expect(reparseHistory(db)).toMatchObject({before:2,after:2,remaining_unknown:0});
  expect(db.prepare('SELECT steam_id,name,kill_count,death_count FROM players ORDER BY steam_id').all()).toEqual(identities.map((steam_id,i)=>({steam_id,name:`玩家${i+1}`,kill_count:0,death_count:1})).sort((a,b)=>a.steam_id.localeCompare(b.steam_id)));
  expect(reparseHistory(db)).toMatchObject({before:2,after:2,corrected:0});
 }finally{db.close();}
});
