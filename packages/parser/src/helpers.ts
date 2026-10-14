import type { Event } from '@scum/shared';
import type { ParseCtx, ParsedLine } from './types';
const LINE = /^(?<ts>\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{3})?)\s*:\s*(?<body>.*)$/;
export function parseLineParts(raw: string): ParsedLine { const m = LINE.exec(raw); return { ts: m?.groups?.ts ? toIso(m.groups.ts) : null, body: m?.groups?.body ?? raw, raw }; }
export function toIso(value:string):string { const [y,mo,d,h,m,s,ms=0]=value.match(/\d+/g)!.map(Number);return new Date(Date.UTC(y,mo-1,d,h,m,s,ms)).toISOString(); }
export function base(ctx: ParseCtx, part: ParsedLine, eventType: Event['event_type'], metadata: Event['metadata'] = {}): Event { return { ts: part.ts, server_id: ctx.serverId ?? 'default', family: ctx.family, event_type: eventType, metadata, raw: part.raw, source_file: ctx.sourceFile, source_line_no: ctx.lineNo }; }
export function num(v: string | undefined): number | null { return v == null ? null : Number(v); }
