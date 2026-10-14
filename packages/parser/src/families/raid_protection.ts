import type { Event } from '@scum/shared';
import { base, parseLineParts } from '../helpers';
import type { ParseCtx } from '../types';

const config = /^Parsing ['"]?(?<file>[^'"]+\.json)['"]?\s*$/i;

export function parseLine(line: string, ctx: ParseCtx): Event | null {
  const p = parseLineParts(line);
  const g = config.exec(p.body)?.groups;
  if (!g || !/raidtimes\.json$/i.test(g.file)) return null;
  return {
    ...base(ctx, p, 'server_event', { operation: 'raid_protection_config_load', config_file: g.file }),
    message: p.body,
  };
}
