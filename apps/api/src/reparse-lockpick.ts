import type Database from 'better-sqlite3';
import {parseFileLine} from '@scum/parser/dist/dispatch';

/** Update only derived lockpick metadata; never change source identities or other families. */
export function reparseLockpick(db:Database.Database){
 const rows=db.prepare("SELECT * FROM events WHERE event_type='lockpick' OR (family='gameplay' AND json_extract(metadata,'$.operation')='lockpick')").all() as Record<string,any>[];
 const keys=['lock_category','lock_category_name','lock_quality','lock_quality_name','lock_difficulty','lock_difficulty_name','target_object_name','owner_token','owner_status','owner_kind','owner_name','owner_char_id','owner_steam_id'];
 const update=db.prepare('UPDATE events SET metadata=? WHERE id=?');
 const report={scanned:rows.length,updated:0,unchanged:0,failed_ids:[] as number[]};
 db.transaction(()=>{for(const row of rows){
  const parsed=parseFileLine(row.raw,row.source_file,row.source_line_no,{},row.server_id);
  if(parsed.event_type!=='lockpick'){report.failed_ids.push(row.id);continue;}
  const metadata=JSON.parse(row.metadata),next={...metadata};for(const key of keys)next[key]=parsed.metadata[key]??null;
  if(keys.every(key=>JSON.stringify(metadata[key])===JSON.stringify(next[key]))){report.unchanged++;continue;}
  update.run(JSON.stringify(next),row.id);report.updated++;
 }})();return report;
}
