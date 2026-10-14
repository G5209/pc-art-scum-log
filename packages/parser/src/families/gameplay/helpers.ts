import type { Event } from '@scum/shared';
import { base, num, parseLineParts } from '../../helpers';
import type { ParseCtx } from '../../types';
export const coords=/(?:Location:\s*)?X=(?<x>-?[\d.]+)\s+Y=(?<y>-?[\d.]+)\s+Z=(?<z>-?[\d.]+)/;
export const loc=(g:Record<string,string|undefined>)=>({x:num(g.x),y:num(g.y),z:num(g.z)});
export const ownerFields=(token:string|undefined)=>{
 const o=/^(?<char>\d+)\(\[(?<steam>\d{17})\]\s*(?<name>.*?)\)$/.exec(token??'')?.groups;
 const system=/^0\((?:World)?\)$/i.test(token?.trim()??'');
 return {owner_token:token??null,owner_status:o?'player':system?'system':'unknown',owner_name:o?.name??null,owner_steam_id:o?.steam??null,owner_char_id:o?.char??null};
};
