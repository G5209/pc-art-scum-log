import type {Event} from '@scum/shared';
import {base,parseLineParts} from '../helpers';
import type {ParseCtx} from '../types';

const header=/^(?<object>.+?) \((?<id>\d+)\), \{X=(?<x>-?[\d.]+) Y=(?<y>-?[\d.]+) Z=(?<z>-?[\d.]+)\|P=(?<pitch>-?[\d.]+) Y=(?<yaw>-?[\d.]+) R=(?<roll>-?[\d.]+)\}:$/;
const contribution=/^(?:(?<steam>\d{17}) \((?<char>\d+), (?<name>.*?)\))?\. (?<weapon>[^.]+)\. (?<amount>-?\d+(?:\.\d+)?)\.$/;
export function isBuildingContribution(raw:string):boolean{return contribution.test(parseLineParts(raw).body);}
export function parseLine(raw:string,ctx:ParseCtx):Event|null{
 const p=parseLineParts(raw),g=header.exec(p.body)?.groups;
 if(g)return {...base(ctx,p,'base_building',{operation:'destroyed',object:g.object,object_id:g.id,rotation:{pitch:Number(g.pitch),yaw:Number(g.yaw),roll:Number(g.roll)},contributions:[]}),x:Number(g.x),y:Number(g.y),z:Number(g.z)};
 const c=contribution.exec(p.body)?.groups;if(!c)return null;
 // A contributor is not evidence of ownership. The recorded numeric value has no unit in this format.
 return {...base(ctx,p,'base_building',{operation:'contribution',orphan_contribution:true,contributions:[{steam_id:c.steam??null,char_id:c.char??null,name:c.name??null,weapon:c.weapon,recorded_value:Number(c.amount),ts:p.ts,source_line_no:ctx.lineNo}]})};
}
