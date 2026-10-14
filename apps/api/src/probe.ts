import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type express from 'express';
import {requirePermission} from './auth';
import {visibleSql} from './catalog';

export const probeSchema=`
CREATE TABLE IF NOT EXISTS probe_config(id INTEGER PRIMARY KEY CHECK(id=1),started_at TEXT NOT NULL);
INSERT OR IGNORE INTO probe_config VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS probe_events(event_id INTEGER PRIMARY KEY,family TEXT NOT NULL,remote_ts TEXT,local_received_at TEXT NOT NULL,eligible INTEGER NOT NULL,excluded_reason TEXT);
CREATE TABLE IF NOT EXISTS probe_metrics(token TEXT PRIMARY KEY,event_id INTEGER NOT NULL,user_id INTEGER NOT NULL,session_id INTEGER NOT NULL,remote_ts TEXT,local_received_at TEXT NOT NULL,sse_pushed_at TEXT NOT NULL,browser_received_at TEXT,ack_received_at TEXT,latency_ms REAL,valid INTEGER NOT NULL DEFAULT 0,excluded_reason TEXT);
CREATE INDEX IF NOT EXISTS idx_probe_event ON probe_metrics(event_id);
`;
export function captureProbe(db:Database.Database,events:Record<string,any>[],now=new Date().toISOString()){
 const start=(db.prepare('SELECT started_at FROM probe_config WHERE id=1').get() as {started_at:string}).started_at;
 const insert=db.prepare('INSERT OR IGNORE INTO probe_events VALUES (?,?,?,?,?,?)');
 for(const e of events){const remote=Date.parse(e.ts),received=Date.parse(now);const reason=!Number.isFinite(remote)?'missing_timestamp':remote<Date.parse(start)?'historical_backfill':remote>received+1000?'source_clock_ahead':null;insert.run(e.id,e.family,e.ts??null,now,Number(!reason),reason);}
}
export function deliveryProbe(db:Database.Database,eventId:number,userId:number,sessionId:number,now=new Date().toISOString()){
 const e=db.prepare('SELECT * FROM probe_events WHERE event_id=? AND eligible=1').get(eventId) as Record<string,any>|undefined;
 if(!e||db.prepare('SELECT 1 FROM probe_metrics WHERE event_id=? AND session_id=?').get(eventId,sessionId))return null;
 const token=crypto.randomUUID();db.prepare('INSERT INTO probe_metrics(token,event_id,user_id,session_id,remote_ts,local_received_at,sse_pushed_at) VALUES (?,?,?,?,?,?,?)').run(token,eventId,userId,sessionId,e.remote_ts,e.local_received_at,now);
 return {token,remote_ts:e.remote_ts,local_received_at:e.local_received_at,sse_pushed_at:now};
}
export function acknowledgeProbe(db:Database.Database,token:string,userId:number,sessionId:number,browser:string,now=new Date().toISOString()){
 const row=db.prepare('SELECT * FROM probe_metrics WHERE token=? AND user_id=? AND session_id=?').get(token,userId,sessionId) as Record<string,any>|undefined;
 if(!row)return false;if(row.ack_received_at)return true;
 const b=Date.parse(browser),ack=Date.parse(now),pushed=Date.parse(row.sse_pushed_at),latency=b-Date.parse(row.remote_ts);
 if(!Number.isFinite(b)||Math.abs(b-ack)>300000)return false;
 const reason=b<pushed-1000?'browser_clock_ahead_or_behind':latency<0?'negative_latency':null;
 db.prepare('UPDATE probe_metrics SET browser_received_at=?,ack_received_at=?,latency_ms=?,valid=?,excluded_reason=? WHERE token=? AND ack_received_at IS NULL').run(new Date(b).toISOString(),now,latency,Number(!reason),reason,token);return true;
}
export function percentile(values:number[],p:number){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.max(0,Math.ceil(p*a.length)-1)];}
export function probeReport(db:Database.Database){
 const rows=db.prepare(`SELECT e.family,p.event_id,p.remote_ts,p.local_received_at,p.sse_pushed_at,p.browser_received_at,p.ack_received_at,p.latency_ms FROM probe_metrics p JOIN probe_events e ON e.event_id=p.event_id WHERE p.valid=1 AND p.ack_received_at IS NOT NULL ORDER BY p.ack_received_at`).all() as Record<string,any>[];
 const unique=[...new Map(rows.reverse().map(r=>[r.event_id,r])).values()];
 const stats=(a:typeof rows)=>({samples:a.length,status:a.length>=20?'ready':'insufficient_samples',p50_ms:percentile(a.map(r=>r.latency_ms),.5),p90_ms:percentile(a.map(r=>r.latency_ms),.9),p99_ms:percentile(a.map(r=>r.latency_ms),.99)});
 return {started_at:(db.prepare('SELECT started_at FROM probe_config WHERE id=1').get() as any).started_at,reported_at:new Date().toISOString(),...stats(unique),families:[...new Set(unique.map(r=>r.family))].map(family=>({family,...stats(unique.filter(r=>r.family===family))})),window:{first:unique.map(r=>r.remote_ts).sort()[0]??null,last:unique.map(r=>r.browser_received_at).sort().at(-1)??null},excluded:db.prepare('SELECT excluded_reason,COUNT(*) count FROM probe_events WHERE eligible=0 GROUP BY excluded_reason').all(),note:'Log timestamp to browser receipt; clocks not independently synchronized, timestamp resolution is source-dependent; not proven disk-write-to-paint latency.'};
}
export function installProbe(app:express.Express,db:Database.Database){
 app.post('/api/probe/ack',(req,res)=>{
  const {token,browser_received_at}=req.body??{};
  if(typeof token!=='string'||token.length>64||typeof browser_received_at!=='string'||browser_received_at.length>40)return res.status(400).json({error:'探针回执格式无效'});
  const row=db.prepare(`SELECT p.event_id FROM probe_metrics p JOIN events e ON e.id=p.event_id WHERE p.token=? AND p.user_id=? AND p.session_id=? AND (${visibleSql(req)})`).get(token,req.auth!.id,req.auth!.session_id);
  if(!row||!acknowledgeProbe(db,token,req.auth!.id,req.auth!.session_id,browser_received_at))return res.status(400).json({error:'探针回执无效或不属于当前会话'});
  res.json({ok:true});
 });
 app.get('/api/probe/status',requirePermission('system.settings'),(_req,res)=>res.json(probeReport(db)));
}
