import type express from 'express';
import {LOG_MENUS} from '@scum/shared';
import {visibleSql,visibleMenus} from './catalog';
import {access} from './serialization';
export const REGION_METADATA_KEYS=['region','killer_region','victim_region','server_region','client_region'] as const;
export function eventFilters(req:express.Request){
 const q=req.query as Record<string,any>,where=['('+visibleSql(req)+')'],params:Record<string,any>={};
 const fail=(s:string)=>{throw new Error('筛选无效：'+s);};
 if(q.menu){const m=LOG_MENUS.find(m=>m.key===q.menu);if(!m)fail('未知菜单');if(!req.auth!.permissions.includes(m!.permission))throw new Error('权限不足');where.push('('+m!.sql+')');}
 if(q.family){if(!visibleMenus(req).some(m=>m.families.some(f=>f===q.family)))throw new Error('权限不足');where.push('family=@family');params.family=String(q.family);}
 const contains=(key:string,expr:string)=>{if(q[key]){params[key]='%'+String(q[key]).replace(/[\\%_]/g,'\\$&')+'%';where.push(`${expr} LIKE @${key} ESCAPE '\\'`);}};
 contains('actor_name','actor_name');contains('target_name',"COALESCE(target_name,json_extract(metadata,'$.owner_name'))");
 if(q.player){params.player='%'+String(q.player).replace(/[\\%_]/g,'\\$&')+'%';where.push("(actor_name LIKE @player ESCAPE '\\' OR target_name LIKE @player ESCAPE '\\')");}
 if(q.actor_steam_id){if(!access(req).steam)throw new Error('权限不足');params.actor=String(q.actor_steam_id);where.push('actor_steam_id=@actor');}
 if(q.q){params.keyword='%'+q.q+'%';const searchable=access(req).raw&&access(req).ip&&access(req).coordinates&&access(req).geo&&access(req).region&&access(req).steam;where.push(searchable?'(message LIKE @keyword OR raw LIKE @keyword OR metadata LIKE @keyword)':"(actor_name LIKE @keyword OR target_name LIKE @keyword OR json_extract(metadata,'$.weapon') LIKE @keyword OR json_extract(metadata,'$.channel') LIKE @keyword)");}
 const multi=(key:string,expr:string,allowed?:string[])=>{if(!q[key])return;const items=String(q[key]).split(',').filter(Boolean);if(items.length>100||!items.length||allowed&&items.some(v=>!allowed.includes(v)))fail(key);where.push(`${expr} IN (${items.map((_,i)=>'@'+key+i).join(',')})`);items.forEach((v,i)=>params[key+i]=v);};
 const requestedTypes=String(q.type??'').split(',').filter(Boolean);
 const showServerEvents=requestedTypes.includes('server_event')||q.menu==='maintenance'||q.include_server_events==='1'||q.exclude_version_records==='0';
 if(!showServerEvents)where.push("NOT (event_type='server_event' AND json_extract(metadata,'$.operation')='game_version')");
 multi('type','event_type');multi('weapon_type',"COALESCE(json_extract(metadata,'$.weapon_type'),'unknown')",['explosive','firearm','melee','trap','vehicle','environment','unknown']);
 if(q.region&&!access(req).region||q.ip_location&&!access(req).geo)throw new Error('权限不足');
 // The region filter must match any role-specific region field (killer/victim or client/server).
 if(q.region){const items=String(q.region).split(',').filter(Boolean);if(items.length>100||!items.length)fail('region');where.push('('+REGION_METADATA_KEYS.map((key)=>`json_extract(metadata,'$.${key}') IN (${items.map((_,i)=>'@region'+i).join(',')})`).join(' OR ')+')');items.forEach((v,i)=>params['region'+i]=v);}
 multi('ip_location',"json_extract(metadata,'$.ip_location')");multi('lock_type',"json_extract(metadata,'$.lock_type')");multi('lock_category',"json_extract(metadata,'$.lock_category')",['padlock','combination','unknown']);multi('lock_quality',"json_extract(metadata,'$.lock_quality')",['Basic','Iron','Silver','Gold','unknown']);multi('owner_status',"json_extract(metadata,'$.owner_status')",['player','system','world','unknown']);
 const numeric=(key:string,expr:string,op:string)=>{if(q[key]===undefined||q[key]==='')return;const n=Number(q[key]);if(!Number.isFinite(n)||n<0)fail(key);params[key]=n;where.push(`${expr}${op}@${key}`);};
 numeric('distance_min',"json_extract(metadata,'$.distance_m')",'>=');numeric('distance_max',"json_extract(metadata,'$.distance_m')",'<=');numeric('elapsed_min',"json_extract(metadata,'$.elapsed_time_sec')",'>=');numeric('elapsed_max',"json_extract(metadata,'$.elapsed_time_sec')",'<=');
 for(const k of ['distance','elapsed'])if(params[k+'_min']!=null&&params[k+'_max']!=null&&params[k+'_min']>params[k+'_max'])fail(k+'范围');
 for(const key of ['headshot','success'])if(q[key]){if(!['yes','no','unknown'].includes(q[key]))fail(key);const expr=`json_extract(metadata,'$.${key}')`;where.push(q[key]==='unknown'?`${expr} IS NULL`:`${expr}=${q[key]==='yes'?1:0}`);}
 const sort=String(q.sort??'newest');if(!['newest','oldest','distance_desc','distance_asc'].includes(sort))fail('排序');
 const order=sort==='oldest'?'ts ASC,id ASC':sort.startsWith('distance_')?`json_extract(metadata,'$.distance_m') IS NULL, json_extract(metadata,'$.distance_m') ${sort==='distance_desc'?'DESC':'ASC'},ts DESC,id DESC`:'ts DESC,id DESC';
 return {where,params,order};
}
