import {FAMILIES} from '@scum/shared';
export const families=FAMILIES.filter(f=>f!=='unknown');
export const intervalMs=Math.max(500,Number(process.env.INGEST_TAIL_INTERVAL_MS)||2000);
export const maxReadBytes=Math.max(1024,Math.min(1_000_000,Number(process.env.TAIL_MAX_READ_BYTES)||256_000));
