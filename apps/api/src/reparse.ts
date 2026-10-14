import type Database from 'better-sqlite3';
import {parseDocument} from '@scum/parser/dist/document';
import {PARSER_VERSION} from '@scum/parser/dist/ingest';

/** Update stable events in place; sessions and collector cursors are untouched. */
export function reparseEvents(db:Database.Database,chestOnly=true){
 const rows=db.prepare(chestOnly?"SELECT * FROM events WHERE family='gameplay' AND json_extract(metadata,'$.subfamily')='LogChest'":"SELECT * FROM events WHERE family IN ('login','kill','gameplay','admin','economy','violations') AND event_type!='unknown'").all() as any[];
 let corrected=0,actorChanged=0,skipped=0;
 const before=db.prepare('SELECT COUNT(*) n FROM events').get() as any;
 db.transaction(()=>{
  for(const row of rows){
   const result=parseDocument(Buffer.from(row.raw,'utf16le'),row.source_file).events;
   if(result.length!==1||result[0].event_type==='unknown'){skipped++;continue;}
   const e=result[0];e.metadata.source_line_nos=(e.metadata.source_line_nos as number[]|undefined)?.map(n=>n+row.source_line_no-1)??[row.source_line_no];
   const prior=JSON.parse(row.metadata);
   const metadata={...prior,...e.metadata,parser_version:PARSER_VERSION};
   if(JSON.stringify(metadata)===row.metadata&&row.actor_steam_id===(e.actor_steam_id??null)&&row.event_type===e.event_type)continue;
   if(row.actor_steam_id!==(e.actor_steam_id??null))actorChanged++;
   db.prepare('UPDATE events SET event_type=?,actor_steam_id=?,actor_name=?,actor_char_id=?,target_steam_id=?,target_name=?,target_char_id=?,x=?,y=?,z=?,metadata=? WHERE id=?').run(e.event_type,e.actor_steam_id??null,e.actor_name??null,e.actor_char_id??null,e.target_steam_id??null,e.target_name??null,e.target_char_id??null,e.x??null,e.y??null,e.z??null,JSON.stringify(metadata),row.id);corrected++;
  }
  if(corrected){
   db.exec(`DELETE FROM players;
    INSERT INTO players(steam_id,name,last_seen,join_count,kill_count,death_count,chat_count)
    SELECT steam,(SELECT CASE WHEN actor_steam_id=steam THEN actor_name ELSE target_name END FROM events WHERE (actor_steam_id=steam OR target_steam_id=steam) AND event_type!='server_event' ORDER BY ts DESC,id DESC LIMIT 1),
      (SELECT MAX(ts) FROM events WHERE (actor_steam_id=steam OR target_steam_id=steam) AND event_type!='server_event'),
      (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND event_type='player_join'),
      (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND actor_steam_id!=target_steam_id AND event_type='player_death'),
      (SELECT COUNT(*) FROM events WHERE target_steam_id=steam AND event_type='player_death'),
      (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND event_type='player_chat')
    FROM (SELECT actor_steam_id steam FROM events WHERE event_type!='server_event' UNION SELECT target_steam_id FROM events WHERE event_type!='server_event') WHERE length(steam)=17;
    DELETE FROM daily_stats;
    INSERT INTO daily_stats(day,joins,leaves,kills,deaths,chats,unique_players,event_count) SELECT substr(ts,1,10),SUM(event_type='player_join'),SUM(event_type='player_leave'),SUM(event_type='player_death' AND actor_steam_id IS NOT NULL AND actor_steam_id!=target_steam_id),SUM(event_type='player_death'),SUM(event_type='player_chat'),0,COUNT(*) FROM events WHERE ts IS NOT NULL GROUP BY substr(ts,1,10);
    UPDATE daily_stats SET unique_players=(SELECT COUNT(DISTINCT steam) FROM (SELECT actor_steam_id steam,substr(ts,1,10) day FROM events WHERE event_type!='server_event' UNION ALL SELECT target_steam_id,substr(ts,1,10) FROM events WHERE event_type!='server_event') WHERE day=daily_stats.day AND steam IS NOT NULL);`);
  }
 })();
 return {selected:rows.length,corrected,actor_changed:actorChanged,skipped,before:before.n,after:(db.prepare('SELECT COUNT(*) n FROM events').get() as any).n,parser_version:PARSER_VERSION};
}
