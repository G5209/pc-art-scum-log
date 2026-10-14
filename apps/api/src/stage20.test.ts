import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';import request from 'supertest';import {it,expect} from 'vitest';
import {initDb} from '@scum/parser/dist/ingest';import {parseFileLine} from '@scum/parser/dist/dispatch';
import {reparseLockpick} from './reparse-lockpick';import {createApp} from './app';import {initializeTenancy} from './tenancy';
import {serialize} from './serialization';import type express from 'express';
const raw=(quality='Basic',owner='N/A')=>'2026.10.13-01.02.03: [LogMinigame] [LockpickingMinigame_C] User: 玩家一 (12, 90000098000000001). Success: No. Elapsed time: 0.0. Failed attempts: 0. Target object: BPLockpick_Weapon_Locker_Military_C(ID: N/A). Lock type: '+quality+'. User owner: '+owner+'. Location: X=0 Y=1 Z=2';
function insert(db:Database.Database,key:string,text:string,metadata:Record<string,any>,type='lockpick'){
 db.prepare("INSERT INTO events(event_key,ts,server_id,family,event_type,metadata,raw,source_file,source_line_no,created_at) VALUES (?,'2026-10-13T01:02:03Z','default','gameplay',?,?,?,'gameplay_test.log',42,'2026-10-13T01:02:04Z')").run(key,type,JSON.stringify(metadata),text);
}
it('scoped reparse preserves every non-metadata column, unrelated events and custom metadata; reruns are idempotent',()=>{
 const db=new Database(':memory:');initDb(db);
 try{insert(db,'a',raw(),{operation:'lockpick',custom_marker:'preserve',datasource_epoch:9});insert(db,'b','not lockpick',{operation:'trap'},'trap_action');insert(db,'bad','unsupported',{operation:'lockpick'});
 const before=db.prepare('SELECT * FROM events').all() as any[];
 expect(reparseLockpick(db)).toEqual({scanned:2,updated:1,unchanged:0,failed_ids:[3]});
 const after=db.prepare('SELECT * FROM events').all() as any[];const {metadata:old,...stable}=before[0],{metadata:next,...newStable}=after[0];expect(newStable).toEqual(stable);expect(after.slice(1)).toEqual(before.slice(1));
 expect(JSON.parse(next)).toMatchObject({custom_marker:'preserve',datasource_epoch:9,lock_quality:'Iron',owner_status:'system'});
 expect(reparseLockpick(db)).toEqual({scanned:2,updated:0,unchanged:1,failed_ids:[3]});
 }finally{db.close();}
});
it('quality and ownership filtering runs before pagination and uses visible option sets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-stage20-')),dbPath=path.join(dir,'test.db'),db=new Database(dbPath);
 const app=createApp(db,{dbPath,rawDir:path.resolve('data/raw/events'),bootstrapPassword:'stage20-test-password'});
 try{
  for(let i=0;i<6;i++){const text=raw(i<4?'Basic':'Medium',i%2?'0()':'N/A');insert(db,'a'+i,text,parseFileLine(text,'gameplay_test.log',42,{}).metadata);}
  initializeTenancy(db);const agent=request.agent(app);expect((await agent.post('/api/auth/login').send({username:'admin',password:'stage20-test-password'})).status).toBe(200);
  const query={menu:'lockpick',lock_quality:'Iron',owner_status:'system,world',pageSize:1};
  const first=await agent.get('/api/events').query(query),last=await agent.get('/api/events').query({...query,page:4});expect(first.status).toBe(200);expect(first.body.total).toBe(4);expect(last.body.total).toBe(4);expect(last.body.data).toHaveLength(1);expect(last.body.data[0].id).not.toBe(first.body.data[0].id);
  expect((await agent.get('/api/events?menu=lockpick&lock_quality=Iron&owner_status=system')).body.total).toBe(2);
  expect((await agent.get('/api/events?menu=lockpick&lock_type=Medium')).body.total).toBe(2);
  const options=(await agent.get('/api/events/options?menu=lockpick')).body;expect(options.lock_quality).toEqual(['Iron','Silver']);expect(options.owner_status).toEqual(['system','world']);
  expect((await agent.get('/api/events?menu=lockpick&lock_quality=Advanced')).status).toBe(400);expect((await agent.get('/api/events?owner_status=invalid')).status).toBe(400);
 }finally{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('new ownership metadata does not bypass restricted identity or raw permissions',()=>{
 const e=parseFileLine(raw('Basic','12([90000098000000001] 玩家一)'),'gameplay_test.log',1,{});
 const hidden=serialize(e,{auth:{permissions:[]}} as unknown as express.Request);
 expect(hidden.metadata.owner_token).toBeUndefined();expect(hidden.metadata.owner_steam_id).toBe('900000***');expect(hidden.metadata.location).toBeUndefined();expect(hidden.metadata.owner_status).toBe('player');
});
