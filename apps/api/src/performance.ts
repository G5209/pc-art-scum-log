import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
export function perfLog(file:string,data:Record<string,unknown>){
 const dir=path.resolve(process.env.LOG_DIR??'logs');
 try{fs.mkdirSync(dir,{recursive:true});fs.appendFile(path.join(dir,file),JSON.stringify({at:new Date().toISOString(),...data})+'\n',()=>{});}catch{/* Logging must not fail a request. */}
}
/** Bound prepared statements without caching results or permission decisions. */
export function cachedPrepare(db:Database.Database):(sql:string)=>Database.Statement{
 const prepare=db.prepare.bind(db),cache=new Map<string,Database.Statement>();
 return (sql:string)=>{let statement=cache.get(sql);if(!statement){statement=prepare(sql);if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(sql,statement);}return statement;};
}
export function instrumentDatabase(db:Database.Database){
 const prepare=cachedPrepare(db),wrapped=new WeakSet<object>();
 db.prepare=((sql:string)=>{
  const statement=prepare(sql);if(wrapped.has(statement))return statement;wrapped.add(statement);
  for(const name of ['all','get','run'] as const){const original=statement[name].bind(statement);(statement as any)[name]=(...args:any[])=>{const began=performance.now();try{return (original as any)(...args);}finally{const duration_ms=performance.now()-began;if(duration_ms>200)perfLog('slow-query.log',{sql,params:redactParams(sql,args),duration_ms});}};}
  return statement;
 }) as typeof db.prepare;
}
function redactParams(sql:string,args:any[]){
 // Authentication and source secrets must never enter diagnostic logs.
 if(/sessions_auth|users|datasource/i.test(sql))return '[敏感参数已隐藏]';
 return args.map(v=>typeof v==='string'&&v.length>500?v.slice(0,500)+'…':v);
}
