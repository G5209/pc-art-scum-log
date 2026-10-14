import type { Event } from '@scum/shared'; import { base, parseLineParts } from '../helpers'; import type { ParseCtx } from '../types';
const re = /^'(?<steam>\d{17}):(?<name>[^']+)\((?<char>\d+)\)'\s+'(?<channel>[^:]+):\s*(?<message>[^']*)'$/;
export function parseLine(line:string,ctx:ParseCtx):Event|null { const p=parseLineParts(line),m=re.exec(p.body); if(!m?.groups)return null;const g=m.groups;return {...base(ctx,p,'player_chat',{channel:g.channel, message:g.message}),actor_steam_id:g.steam,actor_name:g.name,actor_char_id:g.char,message:g.message}; }
