import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {parseDocument} from '@scum/parser/dist/document';
import {isBuildingContribution} from '@scum/parser/dist/families/base_building_destruction';
import type {BlockState} from './document';

/** Recover an old contribution-only cursor after history was merged offline. */
export function restoreBuildingBlock(db:Database.Database,file:string,state:BlockState|undefined,generation:number,epoch?:number):BlockState|undefined{
 if(!file.startsWith('base_building_destruction_')||!state?.lines.length||!state.lines.every(isBuildingContribution))return state;
 const rows=db.prepare("SELECT source_line_no,event_key,raw,metadata FROM events WHERE source_file=? AND family='base_building_destruction' AND source_line_no<? AND source_line_no>=? ORDER BY source_line_no DESC").all(file,state.start,Math.max(1,state.start-2047)) as {source_line_no:number;event_key:string;raw:string;metadata:string}[];
 const matches:BlockState[]=[];
 for(const row of rows){
  const key=crypto.createHash('sha1').update(`tail\0${file}\0${generation}\0${row.source_line_no}`).digest('hex');
  if(row.event_key!==key)continue;
  let metadata:any;try{metadata=JSON.parse(row.metadata);}catch{continue;}
  if(metadata.operation!=='destroyed'||metadata.datasource_epoch!==epoch)continue;
  const lines=row.raw.split(/\r?\n/),nos=metadata.source_line_nos;
  if(!Array.isArray(nos)||nos.length!==lines.length||nos.some((n:number,i:number)=>n!==row.source_line_no+i))continue;
  const offset=state.start-row.source_line_no,overlap=Math.min(state.lines.length,lines.length-offset);
  // A shared physical line must prove the cursor belongs to this exact block.
  if(overlap<1||state.lines.slice(0,overlap).some((raw,i)=>raw!==lines[offset+i]))continue;
  const restored={start:row.source_line_no,lines:[...lines.slice(0,offset),...state.lines]};
  if(restored.lines.length>2048)continue;
  const parsed=parseDocument(Buffer.from(restored.lines.join('\n'),'utf16le'),file).events;
  if(parsed.length!==1||parsed[0].metadata.operation!=='destroyed'||(parsed[0].metadata.source_line_nos as number[]|undefined)?.length!==restored.lines.length)continue;
  matches.push(restored);
 }
 // Conflicting proven headers are evidence to retain, not permission to guess.
 return matches.length===1?matches[0]:state;
}
