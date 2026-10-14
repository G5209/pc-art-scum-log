import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';import request from 'supertest';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {createApp} from './app';import {initializeTenancy} from './tenancy';
import {orderedBucket,hourStart,parts,dayStart} from './timezone';import {ALL_PERMISSIONS} from './auth';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-stage24-')),dbPath=path.join(dir,'test.db'),db=new Database(dbPath);
const app=createApp(db,{dbPath,rawDir:path.resolve('data/raw/events'),bootstrapPassword:'stage24-test-password'}),main=request.agent(app);let csrf:string,childId:number;
beforeAll(async()=>{
 const insert=db.prepare(`INSERT INTO events(event_key,ts,server_id,family,event_type,actor_steam_id,actor_name,target_steam_id,target_name,x,y,z,metadata,raw,source_file,source_line_no,created_at) VALUES (?,?, 'local',?,?,?,?,?,?,0,1,2,?,?,'stage24.log',?,?)`);
 for(let i=0;i<65;i++){const ts=new Date(Date.UTC(2026,10,1,4,0,i)).toISOString();insert.run('stage24-'+i,ts,i%2?'kill':'login',i%2?'player_death':'player_join','90000098000000001','样本玩家','90000098000000002','目标玩家',JSON.stringify({ip:'192.0.2.1',ip_location:'样本归属地',region:'B1'}),'敏感原文 192.0.2.1',i,ts);}
 initializeTenancy(db);await main.post('/api/auth/login').send({username:'admin',password:'stage24-test-password'});csrf=(await main.get('/api/auth/me')).body.csrfToken;
 const role=(await main.get('/api/roles')).body.data.find((r:any)=>r.name==='viewer');const r=await main.post('/api/users').set('x-csrf-token',csrf).send({username:'stage24_child',display_name:'测试子账号',password:'stage24-child-password',role_id:role.id});childId=r.body.id;
});
afterAll(()=>{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});
const grant=async(codes:string[])=>main.put(`/api/users/${childId}/permissions`).set('x-csrf-token',csrf).send({permissions:ALL_PERMISSIONS.map(code=>({code,granted:codes.includes(code)}))});
it('ordered buckets match original boundaries across DST, fractional zones and reverse input',()=>{
 for(const zone of ['UTC','Asia/Shanghai','Asia/Kathmandu','America/New_York','Australia/Lord_Howe'])for(const start of ['2026-03-08T03:00Z','2026-11-01T03:00Z','2026-10-03T12:00Z'])for(const kind of ['hour','day'] as const){
  const b=orderedBucket(zone,kind),times=Array.from({length:120},(_,i)=>Date.parse(start)+i*900000);
  for(const ms of [...times,...times.reverse()]){const actual=b(ms),expected=kind==='hour'?hourStart(ms,zone):dayStart(parts(ms,zone).day,zone);expect(actual.start).toBe(expected);expect(actual.key).toBe(kind==='hour'?new Date(expected).toISOString():parts(ms,zone).day);}
 }
});
it('timeline and heatmap preserve totals and cache repeated responses',async()=>{
 const a=await main.get('/api/stats/timeline?bucket=hour&tz=America/New_York'),b=await main.get('/api/stats/timeline?bucket=hour&tz=America/New_York'),h=await main.get('/api/stats/heatmap?tz=America/New_York');
 expect(a.status).toBe(200);expect(b.body).toEqual(a.body);expect(a.body.data.reduce((n:number,e:any)=>n+e.count,0)).toBe(65);expect(h.body.data.reduce((n:number,e:any)=>n+e.count,0)).toBe(65);
});
it('recent fallback is bounded, newest first, authorized and uses response field protections',async()=>{
 expect((await request(app).get('/api/events/live-recent')).status).toBe(401);
 const full=(await main.get('/api/events/live-recent')).body.data;expect(full).toHaveLength(50);expect(full[0].id).toBeGreaterThan(full[49].id);expect(full[0].x).toBe(0);
 await grant(['log.kill.view']);const child=request.agent(app);await child.post('/api/auth/login').send({username:'stage24_child',password:'stage24-child-password'});
 const r=await child.get('/api/events/live-recent');expect(r.status).toBe(200);expect(r.body.data.every((e:any)=>e.family==='kill')).toBe(true);expect(JSON.stringify(r.body)).not.toContain('192.0.2.1');expect(r.body.data[0].raw).toBeNull();expect(r.body.data[0].x).toBeUndefined();expect((await child.get('/api/events/live-recent?families=login')).status).toBe(403);
});
it('summary cache does not cross identities or survive field permission changes',async()=>{
 const mainSummary=(await main.get('/api/stats/summary')).body;expect(mainSummary.summary.event_count).toBe(65);
 await grant(['log.kill.view','field.steam.view']);let child=request.agent(app);await child.post('/api/auth/login').send({username:'stage24_child',password:'stage24-child-password'});
 const a=(await child.get('/api/stats/summary')).body;expect(a.summary.event_count).toBe(32);expect(JSON.stringify(a)).toContain('90000098000000001');
 await grant(['log.kill.view']);child=request.agent(app);await child.post('/api/auth/login').send({username:'stage24_child',password:'stage24-child-password'});
 const b=(await child.get('/api/stats/summary')).body;expect(b.summary.event_count).toBe(32);expect(JSON.stringify(b)).not.toContain('90000098000000001');
});

