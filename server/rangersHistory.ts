import Database from 'better-sqlite3';
import path from 'node:path';
import { DATA_DIR } from './config.js';

let store: Database.Database | undefined;

export function rangersHistory(): Database.Database {
  if (store) return store;
  const db = new Database(path.join(DATA_DIR, 'rangers-history.db'));
  db.pragma('journal_mode = WAL');
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version === 0) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE checkpoints (
          id INTEGER PRIMARY KEY,
          save_key TEXT NOT NULL,
          org_id INTEGER NOT NULL,
          game_date TEXT NOT NULL,
          season INTEGER NOT NULL,
          digest TEXT NOT NULL,
          payload BLOB NOT NULL,
          UNIQUE(save_key, org_id, game_date, digest)
        );
        PRAGMA user_version = 1;
      `);
    })();
  }
  if (version <= 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE gm_philosophies (
          save_key TEXT NOT NULL,
          org_id INTEGER NOT NULL,
          revision INTEGER NOT NULL,
          guidance TEXT NOT NULL,
          payroll_guideline INTEGER,
          protected_players TEXT NOT NULL,
          PRIMARY KEY(save_key, org_id)
        );
        PRAGMA user_version = 2;
      `);
    })();
  } else if (version !== 2) {
    db.close();
    throw new Error('This Rangers history file needs a newer app version.');
  }
  store = db;
  return db;
}
