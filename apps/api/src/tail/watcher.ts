import {SourceStore} from '../lib/datasource';
import type Database from 'better-sqlite3';import type {Transport} from './transport';import {families} from './config';
export class Watcher{
 constructor(readonly db:Database.Database,readonly transport:Transport,readonly current:()=>boolean=()=>true){}
 async scan(){const files=await this.transport.list();if(!this.current())return 0;const hasSource=!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='datasource_state'").get(),epoch=hasSource?new SourceStore(this.db).epoch():0;this.db.transaction(()=>{for(const family of families){const found=files.filter(f=>f.name.startsWith(family+'_')&&new RegExp('^'+family+'_\\d{14}\\.log$').test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));if(!found.length)continue;
 // Keep the previous active file until its known backlog is drained, including final logout records.
 this.db.prepare('UPDATE files_state SET active=0 WHERE family=? AND local_offset>=size AND remote_path IN (SELECT remote_path FROM files_state WHERE remote_path IN (SELECT value FROM json_each(?)))').run(family,JSON.stringify(found.filter(f=>{const old=this.db.prepare('SELECT local_offset,size FROM files_state WHERE remote_path=?').get(f.name) as any;return old&&old.local_offset>=f.size&&old.size===f.size;}).map(f=>f.name)));
 for(const f of found)this.db.prepare('UPDATE files_state SET size=?,mtime=? WHERE remote_path=? AND active=1').run(f.size,f.mtime,f.name);const newest=found.at(-1)!;this.db.prepare('INSERT INTO files_state(remote_path,family,size,mtime,generation) VALUES (?,?,?,?,?) ON CONFLICT(remote_path) DO UPDATE SET active=1').run(newest.name,family,newest.size,newest.mtime,epoch>1?epoch*1000000:0);
 }})();return files.length;}
}
