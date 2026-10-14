import type Database from 'better-sqlite3';
import {encrypt,decrypt} from './crypto';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';

export interface SourceConfig {name:string;type:'sftp'|'ftp';host:string;port:number;username:string;auth_type:'password'|'key';password:string;key_path:string;remote_log_dir:string;known_hosts_path:string;enabled:number}
export const sourceSchema=`CREATE TABLE datasource(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL DEFAULT '默认数据源',type TEXT NOT NULL CHECK(type IN ('sftp','ftp')),host TEXT NOT NULL,port INTEGER NOT NULL,username TEXT NOT NULL,auth_type TEXT NOT NULL CHECK(auth_type IN ('password','key')),password_encrypted TEXT,key_path TEXT,remote_log_dir TEXT NOT NULL,known_hosts_path TEXT,enabled INTEGER DEFAULT 1,last_tested_at TEXT,last_test_status TEXT DEFAULT 'never',last_test_message TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE datasource_state(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL DEFAULT 0,legacy_imported INTEGER NOT NULL DEFAULT 0);INSERT INTO datasource_state(id) VALUES (1);`;
export class SourceStore {
 constructor(readonly db:Database.Database,readonly keyFile=path.resolve('data/.datakey')){}
 row(){return this.db.prepare('SELECT * FROM datasource WHERE id=1').get() as any;}
 get():SourceConfig|null {const r=this.row();if(!r)return null;const {password_encrypted,...rest}=r;return {...rest,password:password_encrypted?decrypt(password_encrypted,requireKey(this.keyFile)):''};}
 epoch(){return (this.db.prepare('SELECT epoch FROM datasource_state WHERE id=1').get() as any).epoch as number;}
 validate(input:any,base?:SourceConfig|null):SourceConfig {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('日志源配置格式无效');
 const allowed=['name','type','host','port','username','auth_type','password','key_path','remote_log_dir','known_hosts_path','enabled'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('日志源配置包含未知字段');
 const c:any={name:'默认数据源',type:'sftp',port:22,auth_type:'password',password:'',key_path:'',known_hosts_path:'',enabled:1,...base,...input};
 for(const k of ['name','host','username','auth_type','type','remote_log_dir','key_path','known_hosts_path']){if(typeof c[k]!=='string'||c[k].length>2048||/[\r\n\0]/.test(c[k]))throw new Error('日志源字段无效');c[k]=c[k].trim();}
 if(!['sftp','ftp'].includes(c.type)||!['password','key'].includes(c.auth_type)||!c.name||!c.host||!c.username||!c.remote_log_dir)throw new Error('请填写完整日志源信息');
 if(/[\s/@]/.test(c.host))throw new Error('主机应填写地址，不含协议或路径');
 c.port=Number(c.port);if(!Number.isInteger(c.port)||c.port<1||c.port>65535)throw new Error('端口范围为 1 至 65535');
 if(![true,false,0,1].includes(c.enabled))throw new Error('启用状态无效');c.enabled=Number(c.enabled);
 if(c.type==='ftp'&&c.auth_type!=='password')throw new Error('文件传输连接仅支持密码认证');
 const same=base&&['host','port','username','type','auth_type'].every(k=>c[k]===(base as any)[k]);
 if(input.password===''&&same)c.password=base!.password;
 if(input.key_path===''&&same)c.key_path=base!.key_path;
 if(!same&&input.password===undefined)c.password='';
 if(!same&&input.key_path===undefined)c.key_path='';
 if(typeof c.password!=='string'||c.password.length>4096)throw new Error('密码格式无效');
 if(c.auth_type==='password'&&!c.password)throw new Error('请填写连接密码');
 if(c.auth_type==='key'&&!c.key_path)throw new Error('请填写私钥路径');
 return Object.fromEntries(allowed.map(k=>[k,c[k]])) as unknown as SourceConfig;
 }
 save(c:SourceConfig){const old=this.get(),changed=!old||['type','host','port','username','remote_log_dir'].some(k=>(old as any)[k]!== (c as any)[k]);
 this.db.transaction(()=>{const now=new Date().toISOString();const columns=['name','type','host','port','username','auth_type','password_encrypted','key_path','remote_log_dir','known_hosts_path','enabled'];const values=columns.map(k=>k==='password_encrypted'?(c.password?encrypt(c.password,requireKey(this.keyFile)):null):(c as any)[k]);
 this.db.prepare(`INSERT INTO datasource(id,${columns},created_at,updated_at) VALUES (1,${columns.map(()=>'?')},?,?) ON CONFLICT(id) DO UPDATE SET ${columns.map(k=>`${k}=excluded.${k}`)},updated_at=excluded.updated_at,last_test_status='never',last_test_message=NULL,last_tested_at=NULL`).run(...values,now,now);
 if(changed){this.db.prepare('UPDATE datasource_state SET epoch=epoch+1 WHERE id=1').run();this.db.exec('DELETE FROM files_state');}
 })();return changed;
 }
 remove(){this.db.transaction(()=>{this.db.exec('DELETE FROM datasource;DELETE FROM files_state;UPDATE datasource_state SET epoch=epoch+1 WHERE id=1;UPDATE datasource_state SET legacy_imported=1 WHERE id=1;');})();}
 public(manager:boolean){const r=this.row();if(!r)return null;const {password_encrypted,key_path,...rest}=r;return {...rest,host:manager?r.host:'***',username:manager?r.username:'***',remote_log_dir:manager?r.remote_log_dir:undefined,known_hosts_path:manager?r.known_hosts_path:undefined,password_configured:!!password_encrypted,key_configured:!!key_path};}
 tested(ok:boolean,message:string){this.db.prepare('UPDATE datasource SET last_tested_at=?,last_test_status=?,last_test_message=? WHERE id=1').run(new Date().toISOString(),ok?'ok':'failed',message);}
}
import {dataKey as requireKey} from './crypto';
// Parse only literal assignments; never execute the legacy Python file.
export async function importLegacy(store:SourceStore,filename=path.resolve('scripts/sftp_config.py')){
 const state=store.db.prepare('SELECT legacy_imported FROM datasource_state').get() as any;if(state.legacy_imported||store.row())return false;
 if(!fs.existsSync(filename)){store.db.prepare('UPDATE datasource_state SET legacy_imported=1').run();return false;}
 const content=await new Promise<string>((resolve,reject)=>{const p=spawn(process.env.PYTHON??'python',[path.resolve('scripts/read-legacy-source.py'),filename],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>{out+=b;if(out.length>32768)p.kill();});p.stderr.resume();p.on('error',()=>reject(new Error('旧配置读取失败')));p.on('close',code=>code===0?resolve(out):reject(new Error('旧配置读取失败')));const timer=setTimeout(()=>p.kill(),10000);timer.unref();p.on('close',()=>clearTimeout(timer));});
 const r=JSON.parse(content);if(!r.SFTP_HOST||r.SFTP_HOST==='FILL_ME'||!r.SFTP_USER||r.SFTP_USER==='FILL_ME'){store.db.prepare('UPDATE datasource_state SET legacy_imported=1').run();return false;}
 const c=store.validate({name:'默认数据源',type:'sftp',host:r.SFTP_HOST,port:r.SFTP_PORT,username:r.SFTP_USER,auth_type:r.SFTP_KEY_PATH?'key':'password',password:r.SFTP_PASSWORD??'',key_path:r.SFTP_KEY_PATH??'',remote_log_dir:r.SFTP_REMOTE_LOG_DIR,known_hosts_path:r.KNOWN_HOSTS??'',enabled:1});store.save(c);store.db.prepare('UPDATE datasource_state SET legacy_imported=1').run();return true;
}
