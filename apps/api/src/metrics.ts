import type Database from 'better-sqlite3';
import type {TailService} from './tail/service';
export function metrics(db:Database.Database,online:TailService){
 const m=online.scheduler.status();
 const lines=['# TYPE scum_events_total gauge','scum_events_total '+(db.prepare('SELECT COUNT(*) n FROM events').get() as any).n,'# TYPE scum_online_players gauge','scum_online_players '+online.state.count];
 for(const f of m.families as any[])for(const key of ['bytes_per_minute','lines_per_minute','failures','avg_duration_ms','failure_rate','mean_observed_age_ms'])lines.push(`scum_tail_${key}{family="${f.family}"} ${f[key]??0}`);
 return lines.join('\n')+'\n';
}
