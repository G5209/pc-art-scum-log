import type Database from 'better-sqlite3';
import {dayStart,nextDay,parts} from './timezone';
type Row=Record<string,any>;
export function hourlyActivity(db:Database.Database,date:string,now=Date.now(),zone='UTC'){
 const start=dayStart(date,zone),end=dayStart(nextDay(date),zone),bins=Array.from({length:Math.ceil((end-start)/3600000)},(_,i)=>start+i*3600000);
 // Open sessions contribute only after the last verified login, capped by source evidence.
 const evidence=(db.prepare("SELECT MAX(ts) ts FROM events WHERE family='login' AND event_type IN ('player_join','player_leave')").get() as Row).ts;
 const evidenceMs=evidence?Math.min(now,Date.parse(evidence)):0;
 const map=new Map<string,{steam_id:string;name:string;minutes:number[];intervals:[number,number][]}>();
 const sessions=db.prepare('SELECT s.*,p.name FROM sessions s LEFT JOIN players p ON p.steam_id=s.steam_id WHERE s.join_ts<? AND (s.leave_ts IS NULL OR s.leave_ts>?)').all(new Date(end).toISOString(),new Date(start).toISOString()) as Row[];
 for(const s of sessions){let a=Math.max(start,Date.parse(s.join_ts)),b=Math.min(end,now,s.leave_ts?Date.parse(s.leave_ts):evidenceMs);if(!(b>a))continue;let row=map.get(s.steam_id);if(!row){row={steam_id:s.steam_id,name:s.name??s.steam_id,minutes:Array(bins.length).fill(0),intervals:[]};map.set(s.steam_id,row);}row.intervals.push([a,b]);}
 for(const row of map.values()){row.intervals.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];for(const item of row.intervals){const prev=merged.at(-1);if(prev&&item[0]<=prev[1])prev[1]=Math.max(prev[1],item[1]);else merged.push([...item]);}for(const [a,b] of merged)for(let h=0;h<bins.length;h++)row.minutes[h]+=Math.max(0,Math.min(b,start+(h+1)*3600000)-Math.max(a,start+h*3600000))/60000;}
 const players=[...map.values()].map(({intervals,...p})=>({...p,minutes:p.minutes.map(m=>Math.round(m*100)/100),total_minutes:Math.round(p.minutes.reduce((a,b)=>a+b,0)*100)/100}));
 return {date,players,hours:bins.map((ms,hour)=>({hour:parts(ms,zone).hour,label:String(parts(ms,zone).hour).padStart(2,'0')+':'+String(parts(ms,zone).minute).padStart(2,'0'),utc_start:new Date(ms).toISOString(),players:players.filter(p=>p.minutes[hour]>0).length,online_minutes:Math.round(players.reduce((n,p)=>n+p.minutes[hour],0)*100)/100})),time_basis:zone,data_as_of:evidence,open_session_policy:'capped_at_last_login_evidence'};
}
