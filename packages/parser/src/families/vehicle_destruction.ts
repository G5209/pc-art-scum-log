import type { Event } from '@scum/shared';
import { base, parseLineParts, num } from '../helpers';
import type { ParseCtx } from '../types';

// Vehicle lifecycle messages emitted by SCUM.  These are operational events,
// but still contain useful ownership and location data for the vehicle page.
const re = /^\[(?<operation>Disappeared|Destroyed|Entity destroyed|ForbiddenZoneTimerExpired)\]\s+(?<vehicle>[^.]+)\.\s+VehicleId:\s*(?<vehicleId>\d+)\.\s+Owner:\s*(?<owner>.*?)\.\s+Location:\s*X=(?<x>-?[\d.]+)\s+Y=(?<y>-?[\d.]+)\s+Z=(?<z>-?[\d.]+)\s*$/;

export function parseLine(line: string, ctx: ParseCtx): Event | null {
  const p = parseLineParts(line);
  const g = re.exec(p.body)?.groups;
  if (!g) return null;
  const owner = /^\s*(?<steam>\d{16,17})\s*\((?<char>\d+)\s*,\s*(?<name>.*?)\)\s*$/.exec(g.owner)?.groups;
  const operation = g.operation === 'Entity destroyed' ? 'entity_destroyed' : g.operation === 'ForbiddenZoneTimerExpired' ? 'forbidden_zone_timer_expired' : g.operation.toLowerCase();
  return {
    ...base(ctx, p, 'vehicle_event', {
      operation,
      vehicle_class: g.vehicle.trim(),
      vehicle_id: g.vehicleId,
      owner_steam_id: owner?.steam ?? null,
      owner_char_id: owner?.char ?? null,
      owner_name: owner?.name ?? null,
    }),
    actor_steam_id: owner?.steam ?? null,
    actor_char_id: owner?.char ?? null,
    actor_name: owner?.name ?? null,
    x: num(g.x), y: num(g.y), z: num(g.z),
    message: p.body,
  };
}
