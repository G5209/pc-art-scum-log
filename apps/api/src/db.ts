import fs from 'node:fs';
import path from 'node:path'; import Database from 'better-sqlite3'; import { migrate } from './migrations';
import { instrumentDatabase } from './performance';
export const dbPath=path.resolve(process.env.DB_PATH ?? 'data/db/scum.db');
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
export const db: Database.Database = new Database(dbPath); migrate(db); instrumentDatabase(db);
