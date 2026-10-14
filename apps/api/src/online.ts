import type Database from 'better-sqlite3';
import {RconClient,type OnlinePlayer} from './online/rcon';
import {LoginTail,type TailReader} from './online/log-tail';
type Row=Record<string,any>;
export interface OnlineState {source:'rcon'|'http_api'|'sftp_tail'|'join_leave';level:'B'|'C'|'D';ts:string;count:number;players:OnlinePlayer[];updated_at:string;data_as_of:string|null;stale:boolean;reason:string|null;health:{status:'healthy'|'degraded'|'disconnected';poll_interval_ms:number;source_file:string|null;tail_status:string;bridge_status:string}}
export class OnlineService {
 state:OnlineState={source:'join_leave',level:'D',ts:new Date().toISOString(),count:0,players:[],updated_at:new Date().toISOString(),data_as_of:null,stale:true,reason:'尚未查询',health:{status:'degraded',poll_interval_ms:5000,source_file:null,tail_status:'尚未同步',bridge_status:'尚未查询'}};
 private timer?:ReturnType<typeof setInterval>;private busy=false;private lastSnapshot='';
 constructor(private db:Database.Database,private rcon:{listPlayers:()=>Promise<OnlinePlayer[]>;source?:'rcon'|'http_api'}=new RconClient(),private tail:TailReader=new LoginTail()) {
  db.exec('CREATE TABLE IF NOT EXISTS online_snapshots(id INTEGER PRIMARY KEY,ts TEXT NOT NULL,source TEXT NOT NULL,count INTEGER NOT NULL,players TEXT NOT NULL,data_as_of TEXT,stale INTEGER NOT NULL)');
  if(!(db.prepare('PRAGMA table_info(online_snapshots)').all() as Row[]).some(c=>c.name==='players_json'))db.exec('ALTER TABLE online_snapshots ADD COLUMN players_json TEXT');
  db.exec('UPDATE online_snapshots SET players_json=players WHERE players_json IS NULL;CREATE INDEX IF NOT EXISTS online_snapshots_ts ON online_snapshots(ts)');
 }
 async refresh(){if(this.busy)return this.state;this.busy=true;try{
  let players:OnlinePlayer[],source:OnlineState['source']=this.rcon.source??'rcon',reason:string|null=null;
  const now=new Date().toISOString(),tail=this.tail.state;let asOf:string|null=now,checked=now,bridgeStatus='可用',level:OnlineState['level']='B';
  const tailReady=!!tail?.healthy&&Date.now()-Date.parse(tail.ts)<25000;
  try{players=await this.rcon.listPlayers();}catch{
   bridgeStatus='未发现可用的只读实时响应';
   if(tailReady){source='sftp_tail';level='C';players=tail!.players;asOf=tail!.data_as_of;checked=tail!.ts;reason=tail!.reason;}
   else {source='join_leave';level='D';reason='无可用实时数据源；数据源:历史推算,可能过期';
    const rows=this.db.prepare("SELECT actor_steam_id steam_id,MAX(CASE WHEN event_type='player_join' THEN ts END) last_join,MAX(CASE WHEN event_type='player_leave' THEN ts END) last_leave FROM events WHERE family='login' AND actor_steam_id IS NOT NULL AND ts IS NOT NULL AND event_type IN ('player_join','player_leave') GROUP BY actor_steam_id HAVING last_join IS NOT NULL AND (last_leave IS NULL OR last_join>last_leave)").all() as Row[];
    players=rows.map(r=>({steam_id:r.steam_id,name:(this.db.prepare('SELECT name FROM players WHERE steam_id=?').get(r.steam_id) as Row|undefined)?.name??r.steam_id}));
    asOf=(this.db.prepare("SELECT MAX(ts) ts FROM events WHERE family='login' AND event_type IN ('player_join','player_leave')").get() as Row).ts;
   }
  }
  this.state={source,level,ts:checked,count:players.length,players,updated_at:checked,data_as_of:asOf,stale:source==='join_leave',reason,health:{status:source==='join_leave'?(tail&&!tail.healthy?'disconnected':'degraded'):'healthy',poll_interval_ms:source==='sftp_tail'?10000:5000,source_file:source==='sftp_tail'?tail!.source_file:null,tail_status:tailReady?'只读登录日志已同步':tail?.reason??'尚未同步',bridge_status:bridgeStatus}};
  const key=JSON.stringify([source,checked,players]);if(key!==this.lastSnapshot){this.db.prepare('INSERT INTO online_snapshots(ts,source,count,players,players_json,data_as_of,stale) VALUES (?,?,?,?,?,?,?)').run(checked,source,players.length,JSON.stringify(players),JSON.stringify(players),asOf,Number(this.state.stale));this.lastSnapshot=key;}
  this.db.prepare('DELETE FROM online_snapshots WHERE ts<?').run(new Date(Date.now()-7*86400000).toISOString());return this.state;
 }finally{this.busy=false;}}
 start(){this.tail.start?.();void this.refresh().catch(()=>{});this.timer=setInterval(()=>void this.refresh().catch(()=>{}),5000);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);this.tail.stop?.();}
}
