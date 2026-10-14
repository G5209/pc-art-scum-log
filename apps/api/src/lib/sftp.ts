import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import type {SourceConfig} from './datasource';
import {validateRead,type LogSource,type RemoteFile} from './logsource';
export class SftpSource implements LogSource{
 private child?:ChildProcessWithoutNullStreams;private id=0;private closed=false;
 private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
 constructor(readonly config:SourceConfig){}
 private start(){if(this.closed)throw new Error('连接已关闭');if(this.child)return;
 const child=spawn(process.env.PYTHON??'python',['-u',path.resolve('scripts/sftp_transport.py')],{stdio:'pipe',windowsHide:true});this.child=child;child.stderr.resume();
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line),p=this.pending.get(r.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(r.id);r.error?p.reject(new Error('日志源连接或读取失败')):p.resolve(r.result);}catch{}});
 const fail=()=>{if(this.child===child)this.fail();};child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
 // Secrets travel only over the private pipe, never command arguments or logs.
 child.stdin.write(JSON.stringify({config:this.config})+'\n');}
 private fail(){this.child=undefined;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('日志源连接或读取失败'));}this.pending.clear();}
 private call(op:string,args:object={}):Promise<any>{this.start();const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.child?.kill();this.fail();},25000);this.pending.set(id,{resolve,reject,timer});this.child!.stdin.write(JSON.stringify({id,op,...args})+'\n');});}
 async connect(){await this.call('connect');}
 list(){return this.call('list') as Promise<RemoteFile[]>;}
 stat(name:string){validateRead(name);return this.call('stat',{name}) as Promise<{size:number;mtime:number}>;}
 async read(name:string,offset:number,limit:number){validateRead(name,offset,limit);return Buffer.from((await this.call('read',{name,offset,limit})).data,'base64');}
 close(){this.closed=true;this.child?.kill();this.fail();}
}
