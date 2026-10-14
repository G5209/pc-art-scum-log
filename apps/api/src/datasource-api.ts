import type express from 'express';
import type Database from 'better-sqlite3';
import {requirePermission} from './auth';
import {SourceStore,type SourceConfig} from './lib/datasource';
import {sourceFor,type LogSource} from './lib/logsource';
import type {TailService} from './tail/service';
import {Watcher} from './tail/watcher';
import {Tailer} from './tail/tailer';
export function installDatasource(app:express.Express,db:Database.Database,online:TailService,options:{onlinePolling?:boolean;sourceFactory?:(c:SourceConfig)=>LogSource;dataKeyFile?:string}={}){
 const store=new SourceStore(db,options.dataKeyFile),manager=requirePermission('system.datasource.manage'),factory=options.sourceFactory??sourceFor;
 let busy=false;
 const lock=(action:(req:express.Request,res:express.Response)=>Promise<void>):express.RequestHandler=>async(req,res)=>{if(busy){res.status(409).json({error:'日志源正在处理，请稍后重试'});return;}busy=true;try{await action(req,res);}catch{res.status(400).json({error:'日志源配置或连接失败，请检查填写内容'});}finally{busy=false;}};
 const resume=()=>{if(options.onlinePolling&&process.env.INGEST_TAIL_ENABLED!=='false')online.start();};
 app.get('/api/datasource',(req,res)=>res.json({data:store.public(req.auth!.permissions.includes('system.datasource.manage')),configured:!!store.row()}));
 const save=lock(async(req,res)=>{if(req.method==='POST'&&store.row()){res.status(409).json({error:'已有日志源，请保存修改或清空配置'});return;}const c=store.validate(req.body,req.method==='PATCH'?store.get():null);await online.stop();try{store.save(c);online.registry.rebuild(db);res.status(req.method==='POST'?201:200).json({data:store.public(true)});}finally{resume();}});
 app.post('/api/datasource',manager,save);app.patch('/api/datasource',manager,save);
 app.delete('/api/datasource',manager,lock(async(_req,res)=>{await online.stop();store.remove();online.registry.rebuild(db);res.json({ok:true});}));
 app.post('/api/datasource/test',manager,lock(async(req,res)=>{let source:LogSource|undefined;try{const c=store.validate(req.body,store.get());source=factory(c);await source.connect();const files=await source.list();if(!Object.keys(req.body??{}).length)store.tested(true,`连接成功，发现 ${files.length} 个日志文件`);res.json({ok:true,files:files.length,message:`连接成功，发现 ${files.length} 个日志文件`});}catch{if(!Object.keys(req.body??{}).length)store.tested(false,'连接失败，请检查连接信息');res.status(400).json({ok:false,error:'连接失败，请检查连接信息'});}finally{source?.close();}}));
 app.post('/api/datasource/sync',manager,lock(async(_req,res)=>{const c=store.get();if(!c?.enabled){res.status(400).json({error:'请先配置并启用日志源'});return;}await online.stop();const source=factory(c);try{await source.connect();const watcher=new Watcher(db,source);const discovered=await watcher.scan(),before=(db.prepare('SELECT COUNT(*) n FROM events').get() as any).n;const rows=db.prepare('SELECT remote_path FROM files_state WHERE active=1').all() as {remote_path:string}[];let skipped=discovered-rows.length;
 const tail=new Tailer(db,source,events=>online.scheduler.emit('events',events));for(const row of rows){const result=await tail.poll(row.remote_path);if(!result?.bytes)skipped++;}
 online.registry.rebuild(db);const count=(db.prepare('SELECT COUNT(*) n FROM events').get() as any).n-before;res.json({ok:true,count,skipped,message:`新增 ${count} 条事件，跳过 ${skipped} 个文件`});}finally{source.close();resume();}}));
 app.get('/api/datasource/status',manager,(_req,res)=>res.json({configured:!!store.row(),enabled:!!store.row()?.enabled,busy,epoch:store.epoch(),last_tested_at:store.row()?.last_tested_at??null,last_test_status:store.row()?.last_test_status??'never',tail:online.scheduler.status()}));
}
