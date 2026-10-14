import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';import request from 'supertest';import {it,expect} from 'vitest';
import {initDb} from '@scum/parser/dist/ingest';import {parseFileLine} from '@scum/parser/dist/dispatch';
import {reparseLockpickStage22} from './reparse-lockpick-stage22';import {createApp} from './app';import {initializeTenancy} from './tenancy';
const raw=(token='DialLock',target='Asian_Chest_Metal_C')=>`2026.10.13-01.02.03: [LogMinigame] [${token==='DialLock'?'BP_DialLockMinigame_C':'LockpickingMinigame_C'}] User: PlayerA (12, 90000098000000001). Success: No. Elapsed time: 0.0. Failed attempts: 0. Target object: ${target}(ID: N/A). Lock type: ${token}. User owner: 0(). Location: X=0 Y=1 Z=2`;
function insert(db:Database.Database,key:string,text:string,metadata:Record<string,any>,type='lockpick'){
 db.prepare("INSERT INTO events(event_key,ts,server_id,family,event_type,metadata,raw,source_file,source_line_no,created_at) VALUES (?,'2026-10-13T01:02:03Z','default','gameplay',?,?,?,'gameplay_test.log',42,'2026-10-13T01:02:04Z')").run(key,type,JSON.stringify(metadata),text);
}
it('targeted reparse reclassifies DialLock while preserving source identity, unrelated names and rows; is idempotent',()=>{
 const db=new Database(':memory:');initDb(db);
 try{
  insert(db,'dial',raw(),{operation:'minigame',custom_marker:9},'gameplay_event');
  insert(db,'other-target',raw('Advanced','UnverifiedDoor_C'),{operation:'lockpick',target_object_name:'人工确认门名',custom_marker:8});
  insert(db,'unrelated','other',{operation:'trap'},'trap_action');
  const before=db.prepare('SELECT * FROM events').all() as any[];const report=reparseLockpickStage22(db);
  expect(report).toMatchObject({scanned:2,updated:2,reclassified:1,quality_updated:2,target_updated:1,failed_ids:[],moves:{'gameplay_event → lockpick':1}});
  const after=db.prepare('SELECT * FROM events').all() as any[];
  for(let i=0;i<2;i++){const {metadata:om,event_type:ot,...a}=before[i],{metadata:nm,event_type:nt,...b}=after[i];expect(b).toEqual(a);}
  expect(after[2]).toEqual(before[2]);expect(JSON.parse(after[0].metadata)).toMatchObject({operation:'lockpick',custom_marker:9,lock_category:'combination',lock_quality:null,target_object_name:'中式金属宝箱'});
  expect(JSON.parse(after[1].metadata)).toMatchObject({lock_quality:'Gold',target_object_name:'人工确认门名',custom_marker:8});
  expect(reparseLockpickStage22(db)).toMatchObject({updated:0,reclassified:0,target_updated:0,unchanged:2});
 }finally{db.close();}
});
it('category and quality filtering uses all visible results and includes password/unknown options',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-stage22-')),dbPath=path.join(dir,'test.db'),db=new Database(dbPath);
 const app=createApp(db,{dbPath,rawDir:path.resolve('data/raw/events'),bootstrapPassword:'stage22-test-password'});
 try{
  for(const [i,token] of ['DialLock','Advanced','Advanced','VeryEasy','N/A','NewLock'].entries()){const text=raw(token);insert(db,'k'+i,text,parseFileLine(text,'gameplay_test.log',42,{}).metadata);}
  initializeTenancy(db);const agent=request.agent(app);await agent.post('/api/auth/login').send({username:'admin',password:'stage22-test-password'});
  const q={menu:'lockpick',lock_category:'padlock',lock_quality:'Gold',pageSize:1};
  const first=await agent.get('/api/events').query(q),last=await agent.get('/api/events').query({...q,page:2});
  expect(first.status).toBe(200);expect(first.body.total).toBe(2);expect(last.body.total).toBe(2);expect(last.body.data[0].id).not.toBe(first.body.data[0].id);
  const dial=await agent.get('/api/events?menu=lockpick&lock_category=combination');expect(dial.body.total).toBe(1);expect(dial.body.data[0].metadata.lock_quality).toBeNull();
  expect((await agent.get('/api/events?menu=lockpick&lock_quality=unknown')).body.total).toBe(2);
  const options=(await agent.get('/api/events/options?menu=lockpick')).body;
  expect(options.lock_category).toEqual(['combination','padlock','unknown']);expect(options.lock_quality).toEqual(['Basic','Gold','unknown']);
  expect((await agent.get('/api/events?menu=lockpick&lock_category=bad')).status).toBe(400);
 }finally{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
