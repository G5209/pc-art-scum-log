import type express from 'express';
import {perfLog} from './performance';

/** Bound idle and slow consumers across all three event streams. */
export function installStreams(app:express.Express,limit=200,heartbeatMs=30_000){
 const clients=new Set<express.Response>();let warned=false;
 const heartbeat=setInterval(()=>{for(const res of clients){if(res.destroyed||res.writableEnded){clients.delete(res);continue;}if(res.writableLength>1_000_000){res.end();continue;}res.write(': 心跳\n\n');}},heartbeatMs);heartbeat.unref();
 app.use(['/api/events/live','/api/events/stream','/api/online/stream'],(req,res,next)=>{
  if(req.method!=='GET')return next();
  if(clients.size>=limit)return res.status(503).set('Retry-After','30').json({error:'实时连接较多，请稍后重试',requestId:res.locals.requestId});
  clients.add(res);
  if(clients.size>100&&!warned){warned=true;perfLog('connections.log',{warning:'实时连接超过 100',count:clients.size,limit});}
  const remove=()=>{clients.delete(res);if(clients.size<=100)warned=false;};
  res.once('close',remove);res.once('finish',remove);
  next();
 });
 const disconnect=()=>{for(const res of clients)res.end();clients.clear();};
 const manager={status:()=>({active:clients.size,limit,heartbeat_ms:heartbeatMs}),disconnect,close:()=>{clearInterval(heartbeat);disconnect();}};
 app.locals.streams=manager;return manager;
}
