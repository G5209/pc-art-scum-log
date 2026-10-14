export type {RemoteFile} from '../lib/logsource';
export interface Transport{list():Promise<import('../lib/logsource').RemoteFile[]>;stat(name:string):Promise<{size:number;mtime:number}>;read(name:string,offset:number,limit:number):Promise<Buffer>;close():void}
