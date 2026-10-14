import type {ParseCtx} from '../../types';
import {parseLine as minigame} from './minigame';
export function parseLine(line:string,ctx:ParseCtx){return /\[AbandonedBunker(?:Slave|Master)SwitchboardMinigame[^\]]*\]/.test(line)?minigame(line,ctx):null;}
