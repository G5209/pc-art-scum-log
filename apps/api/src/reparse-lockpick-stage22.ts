import type Database from 'better-sqlite3';
import {parseFileLine} from '@scum/parser/dist/dispatch';
import {isLockpickMinigame,lockpickFields,STAGE21_TARGET_TOKENS} from '@scum/shared';

/** Preserve source identity, unrelated metadata and target names outside the requested 11 tokens. */
export function reparseLockpickStage22(db:Database.Database){
 const rows=db.prepare("SELECT * FROM events WHERE event_type='lockpick' OR (family='gameplay' AND (json_extract(metadata,'$.operation')='lockpick' OR raw LIKE '%DialLockMinigame_C]%'))").all() as Record<string,any>[];
 const keys=['lock_category','lock_category_name','lock_quality','lock_quality_name','lock_difficulty','lock_difficulty_name'];
 const report={scanned:rows.length,updated:0,quality_updated:0,target_matched:0,target_updated:0,reclassified:0,unchanged:0,failed_ids:[] as number[],unknown_lock_types:[] as string[],moves:{} as Record<string,number>};
 const update=db.prepare('UPDATE events SET event_type=?,metadata=? WHERE id=?');
 db.transaction(()=>{for(const row of rows){
  const parsed=parseFileLine(row.raw,row.source_file,row.source_line_no,{},row.server_id);
  if(parsed.event_type!=='lockpick'){report.failed_ids.push(row.id);continue;}
  const old=JSON.parse(row.metadata),next={...old},p=parsed.metadata;
  const kind=p.minigame??/^.*?\[LogMinigame\]\s*\[([^\]]+)\]/.exec(row.raw)?.[1];
  const token=String(p.lock_type??old.lock_type??'N/A'),derived=lockpickFields(token,String(p.target_object??old.target_object??''),String(p.owner_token??old.owner_token??''));
  for(const key of keys)next[key]=(derived as Record<string,any>)[key];
  if(next.lock_category==='unknown'&&token!=='N/A'&&!report.unknown_lock_types.includes(token))report.unknown_lock_types.push(token);
  if(row.event_type!=='lockpick'){
   if(!isLockpickMinigame(String(kind??''))){report.failed_ids.push(row.id);continue;}
   // Refresh only the locked-operation contract; preserve all other collected metadata.
   for(const key of ['operation','minigame','success','elapsed_time_sec','failed_attempts','target_object','target_object_id','lock_type','owner_token','owner_status','owner_kind','owner_name','owner_char_id','owner_steam_id'])if(p[key]!==undefined)next[key]=p[key];
   report.reclassified++;const move=row.event_type+' → lockpick';report.moves[move]=(report.moves[move]??0)+1;
  }
  if(keys.some(key=>JSON.stringify(old[key])!==JSON.stringify(next[key])))report.quality_updated++;
  const target=String(p.target_object??old.target_object??'');
  if(STAGE21_TARGET_TOKENS.includes(target)){
   report.target_matched++;next.target_object_name=derived.target_object_name;
   if(old.target_object_name!==next.target_object_name)report.target_updated++;
  }
  if(row.event_type==='lockpick'&&JSON.stringify(old)===JSON.stringify(next)){report.unchanged++;continue;}
  update.run('lockpick',JSON.stringify(next),row.id);report.updated++;
 }})();return report;
}
