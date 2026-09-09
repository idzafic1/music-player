import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}
