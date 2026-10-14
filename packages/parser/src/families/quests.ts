import type { Event } from '@scum/shared'; import { base, parseLineParts } from '../helpers'; import type { ParseCtx } from '../types';
const re=/^\[LogQuestStatus\]\s+(?<name>.*?)\s+\((?<char>\d+),\s*(?<steam>\d{17})\)\s+(?<status>\w+) quest (?<quest>\S+)/;
export function parseLine(line:string,ctx:ParseCtx):Event|null{const p=parseLineParts(line),m=re.exec(p.body);if(!m?.groups)return null;const g=m.groups;return {...base(ctx,p,'quest_update',{source_prefix:'LogQuestStatus',status:g.status,quest_id:g.quest}),actor_steam_id:g.steam,actor_name:g.name,actor_char_id:g.char,message:g.quest};}
