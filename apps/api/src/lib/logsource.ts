import type Database from 'better-sqlite3';
import {SourceStore,type SourceConfig} from './datasource';
import {SftpSource} from './sftp';
import {FtpSource} from './ftp';
export interface RemoteFile{name:string;size:number;mtime:number}
export interface LogSource{connect():Promise<void>;list():Promise<RemoteFile[]>;stat(name:string):Promise<{size:number;mtime:number}>;read(name:string,offset:number,limit:number):Promise<Buffer>;close():void}
export const validLogName=(name:string)=>/^[a-z_]+_\d{14}\.log$/.test(name);
export function validateRead(name:string,offset=0,limit=0){if(!validLogName(name)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<0||limit>5_000_000)throw new Error('日志读取范围无效');}
export function sourceFor(config:SourceConfig):LogSource{return config.type==='sftp'?new SftpSource(config):new FtpSource(config);}
export function configuredSource(db:Database.Database):LogSource{const config=new SourceStore(db).get();if(!config?.enabled)throw new Error('未启用日志源');return sourceFor(config);}
