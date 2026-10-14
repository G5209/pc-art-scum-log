import {enrichEvent} from './enrich';
import type {Event} from '@scum/shared';
import {parseFileLine,familyFromFile} from './dispatch';
import {parseLineParts} from './helpers';
import {decodeLines} from './decode';
import type {ParserState} from './types';
const component=/^(?<key>DistanceTraveledOnFoot|DistanceTraveledWhileMounted|BaseFameInflux|RecoveredFromInfection|MinigameCompleted|OnlineFlagOwnersAwardAwarded|ItemLooted|PuppetKill|AnimalKill|MeleeKill|BlueprintBuilt|BaseElementBuilt|ItemCrafted|BandageApplied|AdminCommand|LockPicked|LandedWithParachute|FameTransferOnKill|FirearmKill|FirearmHeadShotOver200m|FishCaught|FishKept50TimesConsecutively|KillClaimed): (?<value>-?\d+(?:\.\d+)?)$/;
export function parseDocument(bytes:Buffer,file:string){
 const lines=decodeLines(bytes),events:Event[]=[],state:ParserState={};let blank=0,pending:{raw:string;line:number}|undefined,active:Event|undefined;
 const attach=(e:Event,raw:string,no:number)=>{e.raw+='\n'+raw;(e.metadata.source_line_nos as number[]).push(no);};
 for(let i=0;i<lines.length;i++){
  const raw=lines[i],no=i+1,p=parseLineParts(raw);
  if(!raw.trim()){blank++;continue;}
  if(familyFromFile(file)==='famepoints'){
   if(/^\-{5,}$/.test(p.body.trim())){
    if(p.ts){if(pending)events.push(parseFileLine(pending.raw,file,pending.line,state));state.fameTimestamp=p.ts;pending={raw,line:no};active=undefined;}
    else if(active){attach(active,raw,no);active=undefined;state.previousFame=undefined;state.fameTimestamp=undefined;}
    else events.push(parseFileLine(raw,file,no,state));
    continue;
   }
   const c=component.exec(p.body)?.groups;
   if(c&&active&&!p.ts){(active.metadata.components as Record<string,number>)[c.key]=Number(c.value);attach(active,raw,no);continue;}
  }
  const e=parseFileLine(raw,file,no,state);e.metadata.source_line_nos=[no];
  if(e.event_type==='fame_change'){
   if(pending){e.raw=pending.raw+'\n'+e.raw;(e.metadata.source_line_nos as number[]).unshift(pending.line);pending=undefined;}
   active=e.metadata.reason?undefined:e;
  }else if(familyFromFile(file)==='famepoints'){active=undefined;if(pending){events.push(parseFileLine(pending.raw,file,pending.line,state));pending=undefined;}state.fameTimestamp=undefined;}
  const previous=events.at(-1);
  if(e.family==='base_building_destruction'&&e.metadata.operation==='contribution'&&previous?.family==='base_building_destruction'&&previous.metadata.operation==='destroyed'&&previous.ts===e.ts){
   (previous.metadata.contributions as object[]).push(...e.metadata.contributions as object[]);attach(previous,raw,no);continue;
  }
  if(e.family==='kill'&&e.metadata.json_companion&&previous?.event_type==='player_death'&&previous.source_line_no===no-1&&previous.ts===e.ts&&previous.target_steam_id===e.target_steam_id&&previous.actor_steam_id===e.actor_steam_id&&previous.metadata.weapon===e.metadata.weapon&&!previous.metadata.json_companion){previous.metadata={...previous.metadata,...e.metadata,...(previous.metadata.distance_m!=null?{distance_m:previous.metadata.distance_m,distance_source:previous.metadata.distance_source}:{}),source_line_nos:previous.metadata.source_line_nos};attach(previous,raw,no);continue;}
  events.push(e);
 }
 if(pending)events.push(parseFileLine(pending.raw,file,pending.line,state));
 const unknown=events.filter(e=>e.event_type==='unknown').reduce((n,e)=>n+((e.metadata.source_line_nos as number[]|undefined)?.length??1),0);
 events.forEach(enrichEvent);
 return {events,physical_lines:lines.length,blank_lines:blank,nonempty_lines:lines.length-blank,unknown_lines:unknown,unknown_ratio:unknown/(lines.length-blank||1)};
}
