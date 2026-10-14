import {Client} from 'basic-ftp';
import {Writable} from 'node:stream';
import path from 'node:path';
import type {SourceConfig} from './datasource';
import {validateRead,validLogName,type LogSource} from './logsource';
export class FtpSource implements LogSource{
 private client=new Client(10000);private connected=false;private closed=false;
 constructor(readonly config:SourceConfig){this.client.ftp.verbose=false;}
 async connect(){if(this.closed)throw new Error('连接已关闭');if(this.connected&&!this.client.closed)return;try{await this.client.access({host:this.config.host,port:this.config.port,user:this.config.username,password:this.config.password,secure:false});this.connected=true;}catch{throw new Error('日志源连接失败');}}
 private remote(name:string){validateRead(name);return path.posix.join(this.config.remote_log_dir,name);}
 async list(){await this.connect();try{return (await this.client.list(this.config.remote_log_dir)).filter(f=>f.isFile&&validLogName(f.name)).map(f=>({name:f.name,size:f.size,mtime:f.modifiedAt?.getTime()?f.modifiedAt.getTime()/1000:0}));}catch{throw new Error('日志目录读取失败');}}
 async stat(name:string){const remote=this.remote(name);await this.connect();try{return {size:await this.client.size(remote),mtime:(await this.client.lastMod(remote)).getTime()/1000};}catch{throw new Error('日志属性读取失败');}}
 async read(name:string,offset:number,limit:number){validateRead(name,offset,limit);if(!limit)return Buffer.alloc(0);await this.connect();const chunks:Buffer[]=[];let length=0,capped=false;
 const sink=new Writable({write:(b:Buffer,_encoding,done)=>{const part=Buffer.from(b.subarray(0,limit-length));chunks.push(part);length+=part.length;if(length===limit){capped=true;done(new Error('bounded_read'));this.client.close();}else done();}});
 try{await this.client.downloadTo(sink,this.remote(name),offset);}catch{if(!capped)throw new Error('日志内容读取失败');}finally{sink.destroy();if(this.client.closed)this.connected=false;}return Buffer.concat(chunks,length);}
 close(){this.closed=true;this.client.close();this.connected=false;}
}
