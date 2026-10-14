import type {Event} from '@scum/shared';
import {base,parseLineParts} from '../helpers';
import type {ParseCtx} from '../types';
import {parseLine as lockpick} from './gameplay/lockpick';
import {parseLine as minigame} from './gameplay/minigame';
import {parseLine as disarm} from './gameplay/disarm';
import {parseLine as bunkerMinigame} from './gameplay/bunker-minigame';
import {parseLine as chest} from './gameplay/chest';
import {parseLine as trap} from './gameplay/trap';
import {parseLine as territory} from './gameplay/base-building';
import {parseLine as bunker} from './gameplay/bunker-lock';
import {parseLine as explosives} from './gameplay/explosives';
import {isBombDefusalKind,isLockpickMinigame,lockpickFields} from '@scum/shared';
export function parseLine(line:string,ctx:ParseCtx):Event|null{
 const p=parseLineParts(line),m=/^\[(?<sub>Log[^\]]+)\]\s*(?<details>.*)$/.exec(p.body);if(!m?.groups)return null;
 for(const parser of [lockpick,disarm,bunkerMinigame,minigame,chest,trap,territory,bunker,explosives]){const e=parser(line,ctx);if(e)return e;}
 const {sub,details}=m.groups;const kind=/^\[([^\]]+)\]/.exec(details)?.[1];
 const type=sub==='LogChest'?'chest_action':sub==='LogTrap'?'trap_action':sub==='LogBaseBuilding'?'base_building':sub==='LogBunkerLock'?'bunker_lock':isLockpickMinigame(kind??'')?'lockpick':isBombDefusalKind(kind)?'disarm':/^AbandonedBunker(?:Slave|Master)SwitchboardMinigame/.test(kind??'')?'bunker_minigame':'gameplay_event';
 const lock=/Lock type:\s*([^.]+)/.exec(details)?.[1]?.trim();
 return {...base(ctx,p,type,{subfamily:sub,details,operation:'unconfirmed',...(kind?{minigame:kind}:{}),...(type==='lockpick'?{lock_type:lock??'N/A',...lockpickFields(lock??'N/A','','')}: {})}),message:details};
}
