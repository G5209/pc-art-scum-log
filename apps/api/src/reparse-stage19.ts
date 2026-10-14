import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {parseDocument} from '@scum/parser/dist/document';
import {PARSER_VERSION} from '@scum/parser/dist/ingest';
import type {Event} from '@scum/shared';
import {repairSessions} from './sessions';

type Row=Record<string,any>;
const metadata=(row:Row):Row=>{try{return JSON.parse(row.metadata);}catch{return {};}};
const digest=(s:string)=>crypto.createHash('sha1').update(s).digest('hex');
const validGeneration=(v:any):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const GENERATION_WINDOW=128;

function generationCandidates(current:number|undefined,m:Row){
 const candidates=new Set<number>(),add=(v:any)=>{if(validGeneration(v))candidates.add(v);};
 // Source epochs use million-wide namespaces, not millions of truncations.
 // Every candidate still has to match the stored fingerprint; metadata alone
 // never proves that two physical lines came from the same generation.
 add(current);
 for(const key of ['source_generation','tail_generation','generation'])add(m[key]);
 const epochBase=validGeneration(m.datasource_epoch)?(m.datasource_epoch>1?m.datasource_epoch*1000000:0):undefined;
 add(epochBase);add(0);
 if(validGeneration(current))for(let age=1;age<GENERATION_WINDOW&&age<=current;age++)add(current-age);
 for(const base of [epochBase,0])if(validGeneration(base))for(let step=1;step<GENERATION_WINDOW;step++)add(base+step);
 return candidates;
}

/** Reparse only stored evidence; preserve source IDs, tenant/epoch fields and tail cursors. */
export function reparseHistory(db:Database.Database){
 const rows=db.prepare('SELECT * FROM events ORDER BY source_file,source_line_no,id').all() as Row[];
 const groups=new Map<string,Row[]>(),transitions=new Map<string,number>();
 const plans:{row:Row;event:Event;merged:Row[]}[]=[];
 let ambiguous=0,unchangedUnknown=0,corrected=0,semanticChanged=0,mergedRows=0;
 const fileGenerations=new Map<string,number>();
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='files_state'").get())for(const r of db.prepare('SELECT remote_path,generation FROM files_state').all() as Row[])fileGenerations.set(r.remote_path,r.generation??0);
 for(const row of rows){
  const m=metadata(row);let provenance:string|undefined;
  // Prove the source from its ingest/tail fingerprint before joining physical
  // lines. Missing state or a stale key must never mean "generation zero".
  if(row.event_key===digest(`${row.source_file}\0${row.source_line_no}\0${row.raw}`))provenance='ingest';
  else {
   for(const g of generationCandidates(fileGenerations.get(row.source_file),m))if(row.event_key===digest(`tail\0${row.source_file}\0${g}\0${row.source_line_no}`)){provenance=`tail:${g}`;break;}
  }
  if(provenance===undefined){provenance=`unproven:${row.id}`;ambiguous++;}
  const key=JSON.stringify([row.server_id,row.family,row.source_file,m.datasource_epoch??null,provenance]);
  const a=groups.get(key)??[];a.push(row);groups.set(key,a);
 }
 const add=(source:Row[],text:string,lineMap:number[])=>{
  const parsed=parseDocument(Buffer.from(text,'utf16le'),source[0].source_file).events;
  const rowAt=new Map(source.map(r=>[r.source_line_no,r]));
  const used=new Set<number>();
  for(const e of parsed){
   const local=(e.metadata.source_line_nos as number[]|undefined)??[e.source_line_no];
   const physical=local.map(n=>lineMap[n-1]);
   const anchor=lineMap[e.source_line_no-1];
   const row=rowAt.get(anchor)??source.find(r=>physical.includes(r.source_line_no));
   if(!row||used.has(row.id))continue;
   used.add(row.id);e.source_line_no=row.source_line_no;
   e.metadata.source_line_nos=physical;
   if(Array.isArray(e.metadata.contributions))e.metadata.contributions=(e.metadata.contributions as Row[]).map(c=>({...c,source_line_no:lineMap[c.source_line_no-1]}));
   e.server_id=row.server_id;e.ts=row.ts??e.ts;
   const merged=source.filter(r=>r.id!==row.id&&physical.includes(r.source_line_no));
   merged.forEach(r=>used.add(r.id));
   if(e.event_type==='unknown'&&row.event_type!=='unknown')continue; // Keep established data if newer grammar cannot prove it.
   plans.push({row,event:e,merged});
  }
 };
 for(const source of groups.values()){
  const positions=new Map<number,string>();let collision=false;
  for(const r of source){const raw=r.raw.split(/\r?\n/),nos=metadata(r).source_line_nos;
   for(let i=0;i<raw.length;i++){const no=Array.isArray(nos)&&nos.length===raw.length?nos[i]:r.source_line_no+i;if(positions.has(no)){collision=true;break;}positions.set(no,raw[i]);}
  }
  const min=Math.min(...positions.keys()),max=Math.max(...positions.keys());
  if(collision||max-min>1000000){
   ambiguous+=source.length;
   for(const r of source){const raw=r.raw.split(/\r?\n/),nos=metadata(r).source_line_nos;add([r],r.raw,raw.map((_:string,i:number)=>Array.isArray(nos)&&nos.length===raw.length?nos[i]:r.source_line_no+i));}
  }else{
   const text=Array.from({length:max-min+1},(_,i)=>positions.get(i+min)??'').join('\n');
   add(source,text,Array.from({length:max-min+1},(_,i)=>i+min));
  }
 }
 const columns=['event_type','actor_steam_id','actor_name','actor_char_id','target_steam_id','target_name','target_char_id','message','x','y','z','raw','metadata'];
 const update=db.prepare(`UPDATE events SET ${columns.map(c=>c+'=@'+c).join(',')} WHERE id=@id`),remove=db.prepare('DELETE FROM events WHERE id=?');
 db.transaction(()=>{
  for(const {row,event:e,merged} of plans){
   const prior=metadata(row),m:Row={...prior,...e.metadata,parser_version:PARSER_VERSION};
   if(e.event_type!=='unknown'){
    for(const key of ['parse_reason','missing_fields','parse_quality'])delete m[key];
    if(prior.parse_reason&&!Object.hasOwn(e.metadata,'raw_prefix'))delete m.raw_prefix;
   }
   if(merged.length)m.merged_event_ids=[...new Set([...(prior.merged_event_ids??[]),...merged.map(r=>r.id)])];
   const params:Row={id:row.id};for(const c of columns)params[c]=c==='metadata'?JSON.stringify(m):(e as unknown as Row)[c]??null;
   const changed=columns.some(c=>row[c]!==params[c]);
   const semantic=row.event_type!==e.event_type||row.actor_steam_id!==(e.actor_steam_id??null)||row.target_steam_id!==(e.target_steam_id??null)||row.raw!==e.raw;
   if(changed){update.run(params);corrected++;}if(semantic)semanticChanged++;
   if(row.event_type!==e.event_type){const key=`${row.family}:${row.event_type}→${e.event_type}`;transitions.set(key,(transitions.get(key)??0)+1);}
   if(e.event_type==='unknown')unchangedUnknown++;
   for(const r of merged){remove.run(r.id);mergedRows++;}
  }
  // Source cursor positions, sessions, accounts and all tenant mappings remain intact.
  db.exec(`DELETE FROM players;
   INSERT INTO players(steam_id,name,last_seen,join_count,kill_count,death_count,chat_count)
   SELECT steam,(SELECT CASE WHEN actor_steam_id=steam THEN actor_name ELSE target_name END FROM events WHERE (actor_steam_id=steam OR target_steam_id=steam) AND event_type!='server_event' ORDER BY ts DESC,id DESC LIMIT 1),
    (SELECT MAX(ts) FROM events WHERE (actor_steam_id=steam OR target_steam_id=steam) AND event_type!='server_event'),
    (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND event_type='player_join'),
    (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND actor_steam_id!=target_steam_id AND event_type='player_death'),
    (SELECT COUNT(*) FROM events WHERE target_steam_id=steam AND event_type='player_death'),
    (SELECT COUNT(*) FROM events WHERE actor_steam_id=steam AND event_type='player_chat')
   FROM (SELECT actor_steam_id steam FROM events WHERE event_type!='server_event' UNION SELECT target_steam_id FROM events WHERE event_type!='server_event') WHERE length(steam) IN (16,17);
   DELETE FROM daily_stats;
   INSERT INTO daily_stats(day,joins,leaves,kills,deaths,chats,unique_players,event_count) SELECT substr(ts,1,10),SUM(event_type='player_join'),SUM(event_type='player_leave'),SUM(event_type='player_death' AND actor_steam_id IS NOT NULL AND actor_steam_id!=target_steam_id),SUM(event_type='player_death'),SUM(event_type='player_chat'),0,COUNT(*) FROM events WHERE ts IS NOT NULL GROUP BY substr(ts,1,10);
   UPDATE daily_stats SET unique_players=(SELECT COUNT(DISTINCT steam) FROM (SELECT actor_steam_id steam,substr(ts,1,10) day FROM events WHERE event_type!='server_event' UNION ALL SELECT target_steam_id,substr(ts,1,10) FROM events WHERE event_type!='server_event') WHERE day=daily_stats.day AND steam IS NOT NULL);
   INSERT INTO sessions(steam_id,join_ts) SELECT DISTINCT actor_steam_id,ts FROM events e WHERE event_type='player_join' AND actor_steam_id IS NOT NULL AND ts IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.steam_id=e.actor_steam_id AND s.join_ts=e.ts);`);
 })();
 const sessionColumns=db.prepare('PRAGMA table_info(sessions)').all() as Row[];
 const repaired=sessionColumns.some(c=>c.name==='repair_reason')?repairSessions(db):0;
 return {selected:rows.length,corrected,semantic_changed:semanticChanged,merged_rows:mergedRows,ambiguous_source_rows:ambiguous,remaining_unknown:unchangedUnknown,session_repairs:repaired,before:rows.length,after:(db.prepare('SELECT COUNT(*) n FROM events').get() as Row).n,transitions:Object.fromEntries(transitions),parser_version:PARSER_VERSION};
}
