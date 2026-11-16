import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { DATA_DIR } from '../server/config.js';
import { historyDb } from '../server/history.js';
import { rangersHistory } from '../server/rangersHistory.js';

it('upgrades a v1 checkpoint store and can restore its earlier contents into a separate profile', async () => {
  const original = new Database(path.join(DATA_DIR, 'rangers-history.db'));
  original.exec(`
    CREATE TABLE checkpoints (
      id INTEGER PRIMARY KEY, save_key TEXT NOT NULL, org_id INTEGER NOT NULL,
      game_date TEXT NOT NULL, season INTEGER NOT NULL, digest TEXT NOT NULL, payload BLOB NOT NULL,
      UNIQUE(save_key, org_id, game_date, digest)
    );
    PRAGMA user_version = 1;
  `);
  original.prepare('INSERT INTO checkpoints VALUES (1, ?, 1, ?, 2030, ?, ?)').run(
    'synthetic-save', '2030-06-01', 'fixture', Buffer.from('original checkpoint'),
  );
  historyDb.prepare('INSERT INTO watchlist (save_name, player_id, name, note) VALUES (?, 10, ?, ?)')
    .run('Synthetic', 'Fixture Player', 'Watch his command');
  historyDb.prepare('INSERT INTO player_notes (save_name, player_id, body) VALUES (?, 10, ?)')
    .run('Synthetic', 'Original report');
  const restoredPath = path.join(DATA_DIR, 'pre-upgrade-restored.db');
  const legacyPath = path.join(DATA_DIR, 'restored-history.db');
  await original.backup(restoredPath);
  await historyDb.backup(legacyPath);
  original.close();

  const upgraded = rangersHistory();
  expect(upgraded.pragma('user_version', { simple: true })).toBe(2);
  expect(upgraded.prepare('SELECT digest FROM checkpoints').all()).toEqual([{ digest: 'fixture' }]);
  upgraded.prepare('INSERT INTO gm_philosophies VALUES (?, 1, 1, ?, NULL, ?)').run('synthetic-save', 'Plan', '[]');

  const restored = new Database(restoredPath, { readonly: true });
  const legacy = new Database(legacyPath, { readonly: true });
  expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(legacy.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(restored.pragma('user_version', { simple: true })).toBe(1);
  expect(restored.prepare('SELECT digest FROM checkpoints').all()).toEqual([{ digest: 'fixture' }]);
  expect(legacy.prepare('SELECT note FROM watchlist').get()).toEqual({ note: 'Watch his command' });
  expect(legacy.prepare('SELECT body FROM player_notes').get()).toEqual({ body: 'Original report' });
  expect(upgraded.prepare('SELECT guidance FROM gm_philosophies').get()).toEqual({ guidance: 'Plan' });
  restored.close();
  legacy.close();
});
