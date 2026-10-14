import 'dotenv/config';
import path from 'node:path'; import { ingestDir } from './ingest';
const result=ingestDir(path.resolve('data/raw/events'),path.resolve(process.env.DB_PATH ?? 'data/db/scum.db')); console.log(JSON.stringify(result));
