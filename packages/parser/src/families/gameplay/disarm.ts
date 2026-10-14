import type {ParseCtx} from '../../types';
import {parseLine as minigame} from './minigame';
import {isBombDefusalKind} from '@scum/shared';
export function parseLine(line:string,ctx:ParseCtx){
 const m=/\[([^\]]+)\]/.exec(line);
 return m&&isBombDefusalKind(m[1])?minigame(line,ctx):null;
}
