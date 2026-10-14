import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {parseFileLine} from '../../../packages/parser/src/dispatch';
import {ingestDir} from '../../../packages/parser/src/ingest';
import {createApp,playerRef} from './app';
import {storeEvents} from './tail/store';
import {OnlineRegistry} from './tail/registry';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-stage19-players-'));
const dbPath=path.join(dir,'test.db'),db=new Database(dbPath);
const app=createApp(db,{dbPath,rawDir:dir,bootstrapPassword:'stage19-players-password'});
const main=request.agent(app),id16='9000009800000019',id17='90000098000000020';
let csrf='';
beforeAll(async()=>{
 const record=parseFileLine(`2026.10.13-10.34.18: Committed suicide. User: 自杀样本玩家 (25, ${id16}), [测试标签]. Location: X=0 Y=1 Z=2`,'kill_identity_fixture.log',1,{});
 expect(record.metadata.suicide).toBe(true);
 expect(storeEvents(db,[record])).toHaveLength(1);
 expect((await main.post('/api/auth/login').send({username:'admin',password:'stage19-players-password'})).status).toBe(200);
 csrf=(await main.get('/api/auth/me')).body.csrfToken;
});
afterAll(()=>{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});

describe('observed 16/17-digit player identities across live aggregates and APIs',()=>{
 it('keeps the observed self-death identity when local fixture ingest rebuilds aggregates',()=>{
  const fixtureDir=path.join(dir,'ingest-fixtures'),fixtureDbPath=path.join(dir,'ingest.db');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(path.join(fixtureDir,'kill_identity.log'),`\uFEFF2026.10.13-10.34.18: Committed suicide. User: 本地身份样本 (25, ${id16}). Location: X=0 Y=1 Z=2\n`,'utf16le');
  expect(ingestDir(fixtureDir,fixtureDbPath)).toMatchObject({count:1});
  const fixtureDb=new Database(fixtureDbPath);
  try{expect(fixtureDb.prepare('SELECT steam_id,kill_count,death_count FROM players').all()).toEqual([{steam_id:id16,kill_count:0,death_count:1}]);}
  finally{fixtureDb.close();}
 });

 it('refreshes an existing 16-digit online identity with observed self-death evidence',()=>{
  const registry=new OnlineRegistry(300),joined='2026-10-13T10:30:00.000Z',received='2026-10-13T10:34:18.000Z';
  registry.consume([{ts:joined,family:'login',event_type:'player_join',actor_steam_id:id16,actor_name:'本地身份样本',actor_char_id:'25'}],Date.parse(joined));
  const record=parseFileLine(`2026.10.13-10.34.18: Committed suicide. User: 本地身份样本 (25, ${id16}). Location: X=0 Y=1 Z=2`,'kill_identity.log',1,{});
  registry.consume([record],Date.parse(received));
  expect(registry.players.get(id16)).toMatchObject({last_seen_at:received,last_event_type:'player_death'});
  registry.expire(Date.parse('2026-10-13T10:35:01.000Z'));
  expect(registry.players.size).toBe(1);
 });

 it('updates a 16-digit self-death player without adding a kill, and exposes the opaque detail route',async()=>{
  const stored=db.prepare('SELECT * FROM players WHERE steam_id=?').get(id16);
  expect(stored).toMatchObject({steam_id:id16,name:'自杀样本玩家',kill_count:0,death_count:1});
  const list=await main.get('/api/players').query({q:'自杀样本'});
  expect(list.status).toBe(200);expect(list.body.total).toBe(1);
  expect(list.body.data[0]).toMatchObject({steam_id:id16,player_ref:playerRef(id16),kill_count:0,death_count:1});
  for(const identity of [id16,playerRef(id16)]){
   const detail=await main.get('/api/players/'+identity);
   expect(detail.status).toBe(200);
   expect(detail.body.player).toMatchObject({steam_id:id16,kill_count:0,death_count:1});
   expect(detail.body.events[0].metadata.suicide).toBe(true);
   expect(detail.body.timeline).toMatchObject([{kills:0,deaths:1}]);
  }
  const report=await main.get('/api/reports/daily?date=2026-10-13');
  expect(report.status).toBe(200);
  expect(report.body.death_top).toMatchObject([{steam_id:id16,kills:0,deaths:1}]);
 });

 it('preserves granular identifier denial for a child viewing the 16-digit player profile',async()=>{
  const roles=(await main.get('/api/roles')).body.data;
  const added=await main.post('/api/users').set('x-csrf-token',csrf).send({username:'stage19_identity_child',password:'stage19-child-password',display_name:'身份权限测试',role_id:roles.find((r:any)=>r.name==='viewer').id});
  expect(added.status).toBe(201);
  expect((await main.put('/api/users/'+added.body.id+'/permissions').set('x-csrf-token',csrf).send({permissions:[{code:'log.kill.view',granted:true},{code:'field.steam.view',granted:false}]})).status).toBe(200);
  const child=request.agent(app);
  expect((await child.post('/api/auth/login').send({username:'stage19_identity_child',password:'stage19-child-password'})).status).toBe(200);
  const list=await child.get('/api/players');
  expect(list.status).toBe(200);expect(list.body.data[0].steam_id).toBe('900000***');
  const detail=await child.get('/api/players/'+playerRef(id16));
  expect(detail.status).toBe(200);expect(detail.body.player.steam_id).toBe('900000***');
  expect(JSON.stringify(detail.body)).not.toContain(id16);
 });

 it('includes 16/17-digit counterpart nodes when a later real kill connects both players',async()=>{
  const record=parseFileLine(`2026.10.13-10.35.18: Died: 另一玩家 (${id17}), Killer: 自杀样本玩家 (${id16}) Weapon: AK47 S: [1] KillerLoc: 0, 1, 2, VictimLoc: 3, 4, 5, Distance: 5 m`,'kill_identity_fixture.log',2,{});
  expect(record.event_type).toBe('player_death');
  expect(storeEvents(db,[record])).toHaveLength(1);
  const graph=await main.get('/api/relations/graph?type=kill');
  expect(graph.status).toBe(200);
  expect(graph.body.nodes.map((n:any)=>n.steam_id).sort()).toEqual([id16,id17].sort());
  expect(graph.body.links).toEqual([{source:playerRef(id16),target:playerRef(id17),value:1}]);
  expect(db.prepare('SELECT * FROM players WHERE steam_id=?').get(id17)).toMatchObject({death_count:1,kill_count:0});
 });
});
