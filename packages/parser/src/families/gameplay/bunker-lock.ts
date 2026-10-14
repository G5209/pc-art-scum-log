import type {Event} from '@scum/shared';
import {base,parseLineParts} from '../../helpers';
import type {ParseCtx} from '../../types';
import {coords,loc} from './helpers';
export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line),a=/^\[LogBunkerLock\]\s*(.*)$/.exec(p.body);if(!a)return null;const details=a[1];
 if(/^(Bunker activations:|Locked bunkers:)$/.test(details))return base(ctx,p,'server_event',{subfamily:'LogBunkerLock',operation:'bunker_header'});
 const duration='\\d+h\\s+\\d+m\\s+\\d+s';
 const snapshot=new RegExp('^(?<region>[A-Z]\\d) Bunker is (?<status>Locked|Unlocked|Active)\\. (?<clock>Locked|Activated) (?<elapsed>'+duration+') ago(?:, next Activation in (?<next>'+duration+'))?(?: (?<keycard>via Keycard))?\\. (?<tail>(?:Location:\\s*)?X=.*)$').exec(details)?.groups;
 const transition=new RegExp('^(?<region>[A-Z]\\d) Bunker (?<action>Activated|Deactivated)(?: (?<keycard>via Keycard))?(?: (?<elapsed>'+duration+') ago)?(?: (?<after>after Keycard Activation))?$').exec(details)?.groups;
 const g=snapshot??transition;if(!g)return null;
 const location=loc(coords.exec(g.tail??'')?.groups??{});
 return {...base(ctx,p,'bunker_lock',{subfamily:'LogBunkerLock',operation:snapshot?'bunker_status':g.action.toLowerCase(),region:g.region,...(snapshot?{status:g.status,elapsed_since_sec:durationSeconds(g.elapsed),elapsed_since:g.elapsed,...(g.clock==='Locked'?{locked_for:g.elapsed}:{}),...(g.next?{next_activation:g.next,next_activation_sec:durationSeconds(g.next)}:{}),location}:g.elapsed?{elapsed_since:g.elapsed,elapsed_since_sec:durationSeconds(g.elapsed)}:{}),via_keycard:!!(g.keycard||g.after)}),...(snapshot?location:{} )};
}
function durationSeconds(v:string){const n=v.match(/\d+/g)!.map(Number);return n[0]*3600+n[1]*60+n[2];}
