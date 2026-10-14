import type { Event } from '@scum/shared'; import { base, parseLineParts } from '../helpers'; import type { ParseCtx } from '../types';
export function parseLine(line: string, ctx: ParseCtx): Event { const p = parseLineParts(line); return base(ctx, p, 'unknown', { raw_prefix: p.body.trim().slice(0, 80), parse_reason: 'no semantic parser matched' }); }
