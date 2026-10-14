import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';import request from 'supertest';import {beforeAll,afterAll,it,expect} from 'vitest';
import {createApp} from './app';import {initializeTenancy} from './tenancy';import {ALL_PERMISSIONS} from './auth';
import {LOG_MENUS} from '@scum/shared';
import {parseFileLine} from '@scum/parser/dist/dispatch';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-stage15-')),dbPath=path.join(dir,'test.db'),db=new Database(dbPath);
const app=createApp(db,{dbPath,rawDir:dir,bootstrapPassword:'stage15-test-password'}),main=request.agent(app);let csrf:string,childId:number,killId:number;
const actor='90000098000000001',target='90000098000000002';
const sensitive={killer_region:'B1',victim_region:'B2',server_region:'C1',client_region:'C2',killer_location:{x:11,y:12,z:13},victim_location:{x:21,y:22,z:23},killer_client_location:{x:31,y:32,z:33},victim_client_location:{x:41,y:42,z:43},server_location:{x:51,y:52,z:53},client_location:{x:61,y:62,z:63},dial_pad_location:{x:71,y:72,z:73},owner_name:'物主',owner_steam_id:target,owner_token:`2([${target}] 物主)`,ip:'192.0.2.5',ip_location:'测试归属地',details:'敏感原文',json_companion:{Victim:{ClientLocation:{X:41}}}};
beforeAll(async()=>{
 const insert=db.prepare(`INSERT INTO events(ts,server_id,family,event_type,actor_steam_id,actor_name,target_steam_id,target_name,x,y,z,metadata,raw,source_file,source_line_no,created_at) VALUES (?, 'default', ?, ?, ?, '同名玩家', ?, '同名玩家', 0,2,3,?, '敏感原文', 'stage15.log',1,?)`);
 killId=Number(insert.run('2026-10-06T10:00:00Z','kill','player_death',actor,target,JSON.stringify({...sensitive,weapon:'Mosin',weapon_type:'firearm',headshot:null}),new Date().toISOString()).lastInsertRowid);
 for(const [ts,type,id] of [['2026-10-06T09:00:00Z','player_join',actor],['2026-10-06T10:00:00Z','player_leave',actor],['2026-10-06T09:00:00Z','player_join',target]])insert.run(ts,'login',type,id,null,'{}',new Date().toISOString());
 db.prepare('INSERT INTO sessions(steam_id,join_ts,leave_ts,duration_sec,repair_reason) VALUES (?,?,?,?,?)').run(actor,'2026-10-06T09:00:00Z','2026-10-06T10:00:00Z',3600,'explicit_leave');
 db.prepare('INSERT INTO sessions(steam_id,join_ts,leave_ts,duration_sec,repair_reason) VALUES (?,?,?,?,?)').run(target,'2026-10-06T09:00:00Z','2026-10-06T09:00:10Z',10,'inactive_24h');
 initializeTenancy(db);await main.post('/api/auth/login').send({username:'admin',password:'stage15-test-password'});csrf=(await main.get('/api/auth/me')).body.csrfToken;
 const roles=(await main.get('/api/roles')).body.data;const r=await main.post('/api/users').set('x-csrf-token',csrf).send({username:'child_stage15',password:'stage15-child-password',display_name:'子账号',role_id:roles.find((r:any)=>r.name==='viewer').id});childId=r.body.id;
});
afterAll(()=>{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function child(extra:string[]=[]){await main.put('/api/users/'+childId+'/permissions').set('x-csrf-token',csrf).send({permissions:ALL_PERMISSIONS.map(code=>({code,granted:['log.kill.view','log.login.view',...extra].includes(code)}))});const a=request.agent(app);await a.post('/api/auth/login').send({username:'child_stage15',password:'stage15-child-password'});return a;}
it('pairs sessions by SteamID even when names and timestamps coincide, with explicit derivation',async()=>{
 const events=(await main.get('/api/events?menu=login')).body.data;
 expect(events.find((e:any)=>e.actor_steam_id===actor&&e.event_type==='player_leave').metadata).toMatchObject({duration_sec:3600,duration_source:'session_pair',duration_estimated:false});
 expect(events.find((e:any)=>e.actor_steam_id===target).metadata).toMatchObject({duration_sec:10,duration_estimated:true});
 const players=(await main.get('/api/players')).body.data;for(const p of players){const r=(await main.get('/api/players/'+p.player_ref)).body;expect(r.sessions).toHaveLength(1);expect(r.limits.sessions).toBeNull();}
});
it('applies new metadata protections across list, detail, players, export, map and options',async()=>{
 const a=await child(['log.export','log.raw.view']);
 const list=(await a.get('/api/events?menu=kill')).body.data,detail=(await a.get('/api/events/'+killId)).body,exported=(await a.get('/api/events/export?menu=kill')).body.data;
 const player=(await a.get('/api/players')).body.data[0],events=(await a.get('/api/players/'+player.player_ref)).body.events;
 for(const e of [...list,detail,...exported,...events.filter((e:any)=>e.family==='kill')]){expect(e.raw).toBeNull();expect(e.actor_steam_id).toBe('900000***');for(const k of Object.keys(sensitive).filter(k=>k!=='owner_name'&&k!=='owner_steam_id'))expect(e.metadata).not.toHaveProperty(k);expect(e.metadata.owner_steam_id).toBe('900000***');}
 expect((await a.get('/api/map/points')).status).toBe(403);expect((await a.get('/api/events/options?menu=kill')).body).not.toHaveProperty('region');
 const coords=await child(['field.coordinates.view']);const map=(await coords.get('/api/map/points')).body.data.find((e:any)=>e.id===killId);expect(map.metadata.killer_client_location).toEqual(sensitive.killer_client_location);expect(map.metadata.dial_pad_location).toEqual(sensitive.dial_pad_location);expect(map.metadata).not.toHaveProperty('killer_region');expect(map.metadata).not.toHaveProperty('owner_token');
 const regions=await child(['field.region.view']);const r=(await regions.get('/api/events/'+killId)).body;expect(r.metadata.killer_region).toBe('B1');expect(r.metadata).not.toHaveProperty('killer_client_location');
 const m=(await main.get('/api/events/'+killId)).body;expect(m.metadata).toMatchObject(sensitive);
});
it('uses identical serialization for new sensitive keys in SSE',async()=>{
 const a=await child(),row=db.prepare('SELECT * FROM events WHERE id=?').get(killId) as any;
 const stream=await a.get('/api/events/live?families=kill').buffer(true).parse((res,done)=>{let data='',sent=false;res.on('data',chunk=>{data+=chunk;if(data.includes('retry:')&&!sent){sent=true;app.locals.online.scheduler.emit('events',[{...row,metadata:JSON.parse(row.metadata)}]);}if(data.includes('data:')){done(null,data);(res as any).destroy();}});});
 expect(String(stream.body)).not.toMatch(/killer_client_location|dial_pad_location|victim_region|owner_token|192\.0\.2\.5|90000098000000002/);
});

it('returns current-event field coverage separately from legacy physical-line rates',async()=>{
 const r=await main.get('/api/ingest/status');expect(r.status).toBe(200);
 expect(r.body.full_count+r.body.partial_count+r.body.unknown_count).toBe(r.body.events);
 expect(r.body.coverage_basis).toBe('current_events');expect(r.body.historical_line_families).toEqual([]);
 expect(r.body.families.map((f:any)=>f.family).sort()).toEqual(['kill','login']);
 const c=await child();expect((await c.get('/api/ingest/status')).status).toBe(403);
});
it('routes precise bomb aliases to one independently authorized page and never to lockpick',()=>{
 const insert=db.prepare(`INSERT INTO events(ts,server_id,family,event_type,actor_steam_id,actor_name,metadata,raw,source_file,source_line_no,created_at) VALUES (?,'default',?,?,?,?,? ,?,'gameplay_alias.log',1,?)`);
 for(const name of ['BombDefusalMinigame_C','BP_BombDefusalMinigame_C','NotBombDefusalMinigame_C']){
  const e=parseFileLine(`2026.10.06-10.00.00: [LogMinigame] [${name}] User: 玩家 (1, ${actor}). Success: No. Elapsed time: 1. Failed attempts: 0. Target object: ImprovisedMine_C_123. User owner: 0(). Location: X=0 Y=1 Z=2`,'gameplay_alias.log',1,{});
  insert.run(e.ts,e.family,e.event_type,e.actor_steam_id,e.actor_name,JSON.stringify(e.metadata),e.raw,new Date().toISOString());
 }
 const count=(key:string)=>(db.prepare('SELECT COUNT(*) n FROM events WHERE '+LOG_MENUS.find(m=>m.key===key)!.sql).get() as any).n;
 expect(count('disarm')).toBe(2);expect(count('lockpick')).toBe(0);expect(count('lock-install')).toBe(0);
 for(const key of ['disarm','bunker-minigame','lock-install','character-delete'])expect(ALL_PERMISSIONS).toContain('log.'+key+'.view');
});

