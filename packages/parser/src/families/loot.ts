import type {Event} from '@scum/shared';
import {base,parseLineParts} from '../helpers';
import type {ParseCtx} from '../types';
// Recognize only observed initialization shapes. New loot events fall back to unknown.
const init=/^Log:\s+(?:Initializing (?:cooldown groups|items|loot tree nodes)\.|No item spawning (?:cooldown group|parameter) overrides found in '.+'\.|Cooldown groups duration multiplier is [\d.]+\.|Filtered and sorted cooldown groups:|\s+\d{2}: [\d:]+ (?:min|h|d) - [\d:]+ (?:min|h|d)|(?:Started|Finished) parsing (?:loot tree node overrides|item spawning parameter overrides)\.|Parsing (?:spawner preset overrides in )?'.+'\.\.\.|Parsed '.+' and found \d+ zones|Found '\d+' spawner presets|'.+' does not exist|Loaded from config (?:SpawnerProbabilityMultiplier|ExamineSpawnerProbabilityMultiplier|SpawnerExpirationTimeInMinutesMultiplier|ExamineSpawnerExpirationTimeMultiplier) = [\d.]+|Building item asset database for spawners\.\.\.|Built spawnable item asset database consisting of \d+ assets\.|Item '.+' is disabled for spawning: .+|Zone: .+)$/;
const diagnostic=/^(?:Error|Warning):\s+(?:Expected values for item initial and random usage override|Duplicate variation '.+' detected for '.+'|Failed to parse '.+'|'.+' is not a valid item|(?:Subpreset|Item) id is missing|'.+': Failed to find loot tree node '.+')\.?$/;
export function parseLine(line:string,ctx:ParseCtx):Event|null{
 const p=parseLineParts(line);if(!init.test(p.body)&&!diagnostic.test(p.body))return null;
 const metadata:Event['metadata']={operation:'loot_initialization',diagnostic_kind:diagnostic.test(p.body)?'loot_diagnostic':'config_parse'};
 const parsed=/Parsed '([^']+)' and found (\d+) zones/.exec(p.body);if(parsed){metadata.config_file=parsed[1];metadata.zone_count=Number(parsed[2]);}
 const zone=/Zone: bIsValid=(true|false), Min=\(X=(-?[\d.]+) Y=(-?[\d.]+)\), Max=\(X=(-?[\d.]+) Y=(-?[\d.]+)\) \((-?[\d.]+)\)/.exec(p.body);
 if(zone)metadata.zone={is_valid:zone[1]==='true',min:{x:Number(zone[2]),y:Number(zone[3])},max:{x:Number(zone[4]),y:Number(zone[5])},area:Number(zone[6])};
 const invalid=/Error: '([^']+)' is not a valid item/.exec(p.body);if(invalid)metadata.item_class=invalid[1];
 const node=/Error: '([^']+)': Failed to find loot tree node '([^']+)'/.exec(p.body);if(node){metadata.config_file=node[1];metadata.loot_tree_node=node[2];}
 const failed=/Error: Failed to parse '([^']+)'/.exec(p.body);if(failed)metadata.config_file=failed[1];
 const disabled=/Item '([^']+)' is disabled for spawning: (.+)/.exec(p.body);if(disabled){metadata.item_class=disabled[1];metadata.reason=disabled[2];}
 const duplicate=/Duplicate variation '([^']+)' detected for '([^']+)'/.exec(p.body);if(duplicate){metadata.variation=duplicate[1];metadata.item_class=duplicate[2];}
 return {...base(ctx,p,'server_event',metadata),message:p.body};
}
