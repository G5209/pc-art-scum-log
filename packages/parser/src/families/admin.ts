import type { Event } from '@scum/shared'; import { base, parseLineParts, num } from '../helpers'; import type { ParseCtx } from '../types';
const actor=/'(?<steam>\d{17}):(?<name>[^']+)\((?<char>\d+)\)'\s+(?<op>Command|Target of TeleportTo|Deleted player profile|Deleted player):?\s*(?<details>.*)$/;
const commandLabels:Record<string,string>={
  DestroyAllItemsWithinRadius:'清理范围内物品',
  DestroyAllItems:'清理全部物品',
  TeleportTo:'传送玩家',
  KickPlayer:'踢出玩家',
  BanPlayer:'封禁玩家',
  UnbanPlayer:'解除封禁',
  GiveItem:'发放物品',
  SetTimeOfDay:'设置时间'
};
function commandFields(details:string):Record<string,string>{
  const command=/^([A-Za-z][A-Za-z0-9_]*)\b/.exec(details)?.[1];
  if(!command)return {};
  return {command,command_label:commandLabels[command]??`执行了 ${command}`};
}
export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line);
 const teleport=/^'(?<steam>\d{17}):(?<name>[^']+)\((?<char>\d+)\)' Used map click teleport to player: '(?<targetSteam>\d{17}):(?<targetName>[^']+)\((?<targetChar>\d+)\)' Location: X=(?<x>-?\d+(?:\.\d+)?) Y=(?<y>-?\d+(?:\.\d+)?) Z=(?<z>-?\d+(?:\.\d+)?)$/.exec(p.body)?.groups;
 if(teleport)return {...base(ctx,p,'admin_action',{operation:'map_teleport',details:p.body,destination_location:{x:num(teleport.x),y:num(teleport.y),z:num(teleport.z)}}),actor_steam_id:teleport.steam,actor_name:teleport.name,actor_char_id:teleport.char,target_steam_id:teleport.targetSteam,target_name:teleport.targetName,target_char_id:teleport.targetChar,x:num(teleport.x),y:num(teleport.y),z:num(teleport.z)};
 const zone=/^Custom Zones updated by \{(?<name>.*?) \((?<char>\d+), (?<steam>\d{17})\)\}$/.exec(p.body)?.groups;
 if(zone)return {...base(ctx,p,'admin_action',{operation:'custom_zones_updated',details:p.body}),actor_steam_id:zone.steam,actor_name:zone.name,actor_char_id:zone.char};
 const m=actor.exec(p.body); if(m?.groups){const g=m.groups;const command=g.op==='Command'?commandFields(g.details):{};return {...base(ctx,p,'admin_action',{operation:g.op,details:g.details,...command,...(g.op.startsWith('Deleted player')?{deletion_kind:'manual',maintenance:false,reason:null}:{})}),actor_steam_id:g.steam,actor_name:g.name,actor_char_id:g.char,message:g.details};} const maintenance=/^(?:Deleting players that haven't logged in for \d+ day\(s\)\.\.\.|\s*Deleted player(?: profile)? '.+' that last logged in \d+ days ago|Completed in [\d.]+s for \d+ player profiles and \d+ players\.)$/;if(maintenance.test(p.body)){const target=/Deleted player(?<profile> profile)? '(?<id>\d+) \((?<name>.*?)\)'/.exec(p.body)?.groups;return {...base(ctx,p,'server_event',{operation:'maintenance',details:p.body,maintenance:true,...(target?{deletion_kind:'system',reason:/that last logged in (\d+) days ago/.exec(p.body)?.[0]??null}:{})}),target_name:target?.name??null,target_char_id:target?.profile?target.id:null,target_steam_id:target&&!target.profile?target.id:null,message:p.body};} return null;
}
