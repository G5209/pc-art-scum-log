import {describe,it,expect} from 'vitest';
import {serialize} from './serialization';
import {enrichEvent} from '../../../packages/parser/src/enrich';
import {parseFileLine} from '../../../packages/parser/src/dispatch';
import type express from 'express';
const req=(permissions:string[])=>({auth:{permissions}} as express.Request);
const line="2026.10.06-10.00.00: '192.0.2.1 90000098000000001:同名(42)' logged in at: X=0 Y=-2 Z=3";
describe('阶段12字段与序列化',()=>{
 it('preserves zero and explicit login fields without inventing geography',()=>{const e=parseFileLine(line,'login_20261006100000.log',1,{});expect(e.x).toBe(0);expect(e.metadata.ip).toBe('192.0.2.1');expect(e.metadata.ip_location).toBeUndefined();expect(e.metadata.region).toBeUndefined();});
 it('supports explicitly labeled geography and region suffixes',()=>{const e=parseFileLine(line+' Region: B1; IPLocation: 中国-宁夏-银川 运营商:中国电信','login_test.log',1,{});expect(e.event_type).toBe('player_join');expect(e.metadata.region).toBe('B1');expect(e.metadata.ip_location).toBe('中国-宁夏-银川 运营商:中国电信');});
 it('authorizes sensitive fields independently including nested raw derivatives',()=>{const e={actor_steam_id:'90000098000000001',x:0,raw:line,message:line,metadata:{ip:'192.0.2.1',ip_location:'中国',region:'B1',location:{x:1},details:line,json_companion:{Victim:{ServerLocation:{X:1}}}}};const hidden=serialize(e,req(['log.raw.view']));expect(hidden.raw).toBeNull();expect(hidden.message).toBeNull();expect(hidden.metadata).toEqual({});expect(hidden.actor_steam_id).toBe('900000***');const onlyIP=serialize(e,req(['field.ip.view']));expect(onlyIP.metadata.ip).toBe('192.0.2.1');expect(onlyIP.x).toBeUndefined();const all=serialize(e,req(['field.steam.view','field.ip.view','field.geography.view','field.region.view','field.coordinates.view','log.raw.view']));expect(all).toEqual(e);});
 it('distinguishes missing headshot and log vs calculated distance',()=>{const e:any={family:'kill',event_type:'player_death',raw:'',metadata:{distance_m:0}};enrichEvent(e);expect(e.metadata.distance_m).toBe(0);expect(e.metadata.distance_source).toBe('log');expect(e.metadata.headshot).toBeNull();const c:any={family:'kill',event_type:'player_death',raw:'',metadata:{json_companion:{Killer:{ServerLocation:{X:0,Y:0,Z:0}},Victim:{ServerLocation:{X:300,Y:400,Z:0}}}}};enrichEvent(c);expect(c.metadata.distance_m).toBe(5);expect(c.metadata.distance_source).toBe('coordinates');});
 it('masks exact legacy 16-digit identities in events, nested transaction parties and contribution arrays',()=>{
  const value={actor_steam_id:'9000009929250154',target_steam_id:'90000098000000001',metadata:{source_steam_id:'9000009000000001',contributions:[{steam_id:'9000009000000002'}],recorded_identity:1000000000000000}};
  const hidden=serialize(value,req([]));
  expect(hidden).toEqual({actor_steam_id:'900000***',target_steam_id:'900000***',metadata:{source_steam_id:'900000***',contributions:[{steam_id:'900000***'}],recorded_identity:'100000***'}});
  expect(serialize(value,req(['field.steam.view']))).toEqual(value);
 });
});
