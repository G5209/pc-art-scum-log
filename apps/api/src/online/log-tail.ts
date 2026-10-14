import {spawn,type ChildProcess} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {createInterface} from 'node:readline';
import {parseLine} from '@scum/parser/dist/families/login';
import type {OnlinePlayer} from '../rcon/client';

export interface TailState {ts:string;players:OnlinePlayer[];source_file:string;data_as_of:string|null;healthy:boolean;reason:string|null}
export interface TailReader {state:TailState|null;start?():void;stop?():void}
export class LoginTail implements TailReader {
 state:TailState|null=null;
 private child?:ChildProcess;private retry?:ReturnType<typeof setTimeout>;private stopped=true;
 private players=new Map<string,OnlinePlayer>();private valid=false;
 accept(payload:any){
  if(!payload?.ok){this.valid=false;this.state={ts:new Date().toISOString(),players:[],source_file:this.state?.source_file??'',data_as_of:this.state?.data_as_of??null,healthy:false,reason:'SFTP 登录尾随不可用（'+String(payload?.error??'worker_unavailable').replace(/[^\w]/g,'').slice(0,60)+'）'};return;}
  if(payload.reset){this.players.clear();this.valid=true;}
  let asOf=payload.reset?null:this.state?.data_as_of??null;
  for(const line of payload.lines??[]){
   if(typeof line!=='string'||!line.trim())continue;
   const event=parseLine(line,{family:'login',sourceFile:payload.source_file,lineNo:1,serverId:'default'});
   if(event?.actor_steam_id){asOf=event.ts;if(event.event_type==='player_join')this.players.set(event.actor_steam_id,{steam_id:event.actor_steam_id,name:event.actor_name??event.actor_steam_id});else this.players.delete(event.actor_steam_id);}
   else if(!/^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{3})?\s*:\s*Game version:/.test(line)){this.valid=false;}
  }
  this.state={ts:payload.ts,players:[...this.players.values()],source_file:payload.source_file,data_as_of:asOf,healthy:this.valid,reason:this.valid?'按当前运行日志的明确上线/离线推算；异常断线或遗漏日志可能影响人数':'遇到未确认登录格式或读取中断，需完整重新同步'};
 }
 start(){this.stopped=false;this.launch();}
 private launch(){if(this.stopped||this.child)return;
  // Legacy watcher is optional; the datasource scheduler provides live ingestion.
  if(!fs.existsSync(path.resolve('scripts/sftp_login_tail.py'))){this.accept({ok:false,error:'not_configured'});return;}
  this.child=spawn(process.env.SFTP_PYTHON??'python',['-X','utf8',path.resolve('scripts/sftp_login_tail.py')],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const reader=createInterface({input:this.child.stdout!});reader.on('line',line=>{try{this.accept(JSON.parse(line));}catch{this.accept({ok:false,error:'invalid_worker_message'});}});
  // Never relay Python stderr: tracebacks may contain local configuration details.
  this.child.stderr?.resume();this.child.on('error',()=>this.accept({ok:false,error:'worker_unavailable'}));
  this.child.on('close',()=>{reader.close();this.child=undefined;this.accept({ok:false,error:'worker_stopped'});if(!this.stopped){this.retry=setTimeout(()=>this.launch(),10000);this.retry.unref();}});
 }
 stop(){this.stopped=true;if(this.retry)clearTimeout(this.retry);this.child?.kill();}
}
