import type { Event, Family } from '@scum/shared';
export interface ParseCtx { family: Family; sourceFile: string; lineNo: number; serverId?: string; state?: ParserState; }
export interface ParserState { previousFame?: Event; fameTimestamp?: string; }
export interface ParsedLine { ts: string | null; body: string; raw: string; }
