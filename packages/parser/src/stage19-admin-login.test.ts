import {it,expect} from 'vitest';
import {parseFileLine} from './dispatch';
const parse=(family:string,body:string)=>parseFileLine('2026.10.13-10.00.00: '+body,family+'_test.log',1,{});
const user="'192.0.2.1 90000098000000001:玩家(12)'";
it('recognizes drone login and missing-location leave without inventing coordinates',()=>{
 const join=parse('login',user+' logged in at: X=0 Y=-1 Z=2 (as drone)');
 expect(join).toMatchObject({event_type:'player_join',x:0,y:-1,z:2,metadata:{login_mode:'drone'}});
 const leave=parse('login',user+' logged out at: ?');
 expect(leave).toMatchObject({event_type:'player_leave',actor_name:'玩家',metadata:{location_available:false}});
 expect(leave.x).toBeUndefined();
 const refusal=parse('login',user+' attempted to log in as drone, but had no admin privileges');
 expect(refusal).toMatchObject({event_type:'server_event',metadata:{operation:'login_refused'}});
 expect(parse('login',user+' logged in at: something else').event_type).toBe('unknown');
});
it('preserves both teleport identities and the zone update actor',()=>{
 const e=parse('admin',"'90000098000000001:操作者(12)' Used map click teleport to player: '90000098000000002:目标(13)' Location: X=0 Y=-1 Z=2");
 expect(e).toMatchObject({event_type:'admin_action',actor_char_id:'12',target_char_id:'13',x:0,y:-1,z:2,metadata:{operation:'map_teleport'}});
 expect(parse('admin','Custom Zones updated by {操作者 (12, 90000098000000001)}')).toMatchObject({event_type:'admin_action',actor_name:'操作者',actor_char_id:'12',metadata:{operation:'custom_zones_updated'}});
});
