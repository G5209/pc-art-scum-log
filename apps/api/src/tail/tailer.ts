import {perfLog} from '../performance';
import {SourceStore} from '../lib/datasource';
import type Database from 'better-sqlite3';
import type {Transport} from './transport';import {Utf16Lines} from './decoder';import {IncrementalDocument} from './document';import {restoreBuildingBlock} from './restore-block';import {storeEvents} from './store';import {maxReadBytes} from './config';
export class Tailer{
 constructor(readonly db:Database.Database,readonly transport:Transport,readonly emit:(events:any[])=>void=()=>{},readonly current:()=>boolean=()=>true){}
 async poll(name:string){const began=performance.now();let bytes=0,lines=0,ioMs=0,failed=false;perfLog('tail-performance.log',{phase:'start',file:name});const remote=async<T>(f:()=>Promise<T>)=>{const t=performance.now();try{return await f();}finally{ioMs+=performance.now()-t;}};const row=this.db.prepare('SELECT * FROM files_state WHERE remote_path=?').get(name) as any;if(!row)return;
 try{const stat=await remote(()=>this.transport.stat(name));if(!this.current())return;let saved=JSON.parse(row.state_json),offset=row.local_offset,generation=row.generation;
 if(stat.size<offset){offset=0;generation++;saved={};}
 const hasSource=!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='datasource_state'").get(),epoch=hasSource?new SourceStore(this.db).epoch():undefined;
 const decoder=new Utf16Lines(saved.decoder),parser=new IncrementalDocument(name,restoreBuildingBlock(this.db,name,saved.block,generation,epoch));let events:any[]=[];
 if(stat.size>offset){const chunk=await remote(()=>this.transport.read(name,offset,Math.min(maxReadBytes,stat.size-offset)));bytes=chunk.length;if(!bytes)throw new Error('empty_increment');offset+=bytes;const records=decoder.push(chunk);lines=records.length;for(const r of records)events.push(...parser.push(r.raw,r.no));saved.changed_at=Date.now();delete saved.preview_text;}
 // No terminal CRLF is common in SCUM. Preview a stable complete recognized record.
 // The bytes/line stay pending, so a later suffix re-parses the SAME source identity.
 if(offset===stat.size&&decoder.state.text.trim()&&!decoder.state.carry&&saved.preview_text!==decoder.state.text&&Date.now()-(saved.changed_at??0)>=1000){const preview=parser.preview(decoder.state.text,decoder.state.lineNo+1);events.push(...preview.filter(e=>e.event_type!=='unknown'));saved.preview_text=decoder.state.text;}
 const now=new Date().toISOString();let changed:any[]=[];
 if(!this.current())return;if(hasSource)events=events.map(e=>({...e,metadata:{...e.metadata,datasource_epoch:epoch}}));
 this.db.transaction(()=>{changed=storeEvents(this.db,events,generation);this.db.prepare('UPDATE files_state SET size=?,mtime=?,local_offset=?,last_read_at=?,state_json=?,generation=? WHERE remote_path=?').run(stat.size,stat.mtime,offset,now,JSON.stringify({...saved,decoder:decoder.state,block:parser.state}),generation,name);})();
 const lag=changed.filter(e=>e.ts).map(e=>Date.now()-Date.parse(e.ts)).filter(v=>v>=0&&v<3600000);
 this.db.prepare('INSERT INTO tail_metrics(ts,family,bytes,lines,duration_ms,failed,lag_ms) VALUES (?,?,?,?,?,0,?)').run(now,row.family,bytes,lines,performance.now()-began,lag.length?Math.max(...lag):null);
 if(changed.length)this.emit(changed);return {bytes,lines,changed:changed.length};
 }catch{failed=true;if(!this.current())return;this.db.prepare('INSERT INTO tail_metrics(ts,family,bytes,lines,duration_ms,failed) VALUES (?,?,?,?,?,1)').run(new Date().toISOString(),row.family,bytes,lines,performance.now()-began);throw new Error('SFTP poll failed');}finally{const elapsed_ms=performance.now()-began;if(elapsed_ms>500)perfLog('tail-performance.log',{warning:'单轮采集超过500毫秒',file:name,elapsed_ms,local_ms:Math.max(0,elapsed_ms-ioMs)});perfLog('tail-performance.log',{phase:'end',file:name,bytes,lines,elapsed_ms,io_ms:ioMs,local_ms:Math.max(0,elapsed_ms-ioMs),failed});}
 }
}
