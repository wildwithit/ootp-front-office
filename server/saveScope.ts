import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadConfig } from './config.js';
import { db, hasColumns } from './db.js';
import type { ImportResult } from './importer.js';

const importMarker = path.join(DATA_DIR, 'import-source.json');

export function saveKey(csvDir: string | null): string | null {
  if (!csvDir) return null;
  try {
    return createHash('sha256').update(fs.realpathSync(csvDir)).digest('hex');
  } catch {
    return null;
  }
}

export function invalidateSaveScope(): void {
  fs.rmSync(importMarker, { force: true });
}

export function recordSaveScope(key: string, imported: ImportResult): void {
  const tables = imported.files.map((f) => f.table);
  fs.writeFileSync(importMarker, JSON.stringify({ key, tables }));
}

export function activeSaveScope(): { key: string; tables: string[] } | null {
  try {
    const key = saveKey(loadConfig().csvDir);
    const marker = JSON.parse(fs.readFileSync(importMarker, 'utf8'));
    return key && marker.key === key && Array.isArray(marker.tables) &&
      ['teams', 'players', 'leagues'].every((table) => marker.tables.includes(table)) ? { key, tables: marker.tables } : null;
  } catch {
    return null;
  }
}

/** Matches the existing organization picker, including unaffiliated leagues. */
export function scopeOrganizations(): Array<{ id: number; leagueId: number; name: string }> {
  if (!hasColumns('teams', 'team_id', 'league_id', 'name', 'nickname', 'parent_team_id', 'allstar_team') ||
      !hasColumns('leagues', 'league_id', 'parent_league_id')) return [];
  return db.prepare(`
    SELECT t.team_id AS id, t.league_id AS leagueId, TRIM(t.name || ' ' || t.nickname) AS name
      FROM teams t JOIN leagues l ON l.league_id = t.league_id
      WHERE COALESCE(t.parent_team_id, 0) = 0 AND COALESCE(l.parent_league_id, 0) = 0 AND t.allstar_team = 0
      ORDER BY t.team_id
  `).all() as ReturnType<typeof scopeOrganizations>;
}
