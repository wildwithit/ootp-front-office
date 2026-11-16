import { Router } from 'express';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { db, tableColumns } from './db.js';
import { activeSaveScope, scopeOrganizations } from './saveScope.js';
import { rangersHistory } from './rangersHistory.js';

export const checkpointRoutes = Router();
type Row = Record<string, string | number | null>;

function rows(tables: string[], table: string, required: string[], optional: string[] = [], seasonFilter?: { years: number[]; split: number }): Row[] | null {
  if (!tables.includes(table)) return null;
  const cols = tableColumns(table);
  if (!required.every((col) => cols.includes(col))) return null;
  const fields = [...required, ...optional.filter((col) => cols.includes(col))];
  // Field lists are fixed to known export columns. Quote current_date in particular.
  const list = fields.map((col) => `"${col}"`).join(', ');
  if (seasonFilter?.years.length === 0) return [];
  const filter = seasonFilter ? `WHERE split_id = ? AND year IN (${seasonFilter.years.map(() => '?').join(', ')})` : '';
  return db.prepare(`SELECT ${list} FROM "${table}" ${filter} ORDER BY ${list}`).all(...(seasonFilter ? [seasonFilter.split, ...seasonFilter.years] : [])) as Row[];
}

function group(input: Row[] | null, field: string): Map<Row[string], Row[]> {
  const grouped = new Map<Row[string], Row[]>();
  for (const row of input ?? []) {
    const key = row[field];
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

function gameDate(raw: Row[string]): string | null {
  if (typeof raw !== 'string') return null;
  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!parts) return null;
  const iso = [parts[1], parts[2].padStart(2, '0'), parts[3].padStart(2, '0')].join('-');
  const parsed = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().startsWith(iso) ? iso : null;
}

export function captureCheckpoints(key: string, tables: string[]): number {
  if (!['teams', 'leagues', 'players'].every((table) => tables.includes(table))) return 0;
  const orgs = scopeOrganizations();
  const leagues = group(rows(tables, 'leagues', ['league_id', 'season_year', 'current_date']), 'league_id');
  const seasons = [...new Set([...leagues.values()].flat().map((l) => l.season_year))]
    .filter((year): year is number => typeof year === 'number' && Number.isInteger(year));
  const teams = rows(tables, 'teams', ['team_id', 'parent_team_id', 'league_id'],
    ['name', 'nickname', 'level', 'sub_league_id', 'division_id']);
  const assignments = rows(tables, 'players', ['player_id', 'team_id', 'organization_id'],
    ['first_name', 'last_name', 'position', 'role', 'age', 'retired', 'hidden', 'injury_is_injured', 'injury_dtd_injury', 'injury_left']);
  if (!teams || !assignments) return 0;
  const playersByOrg = group(assignments.filter((p) => !p.retired && !p.hidden), 'organization_id');
  const records = rows(tables, 'team_record', ['team_id'], ['g', 'w', 'l', 't', 'pos', 'pct', 'gb', 'streak', 'magic_number']);
  const batting = rows(tables, 'team_batting_stats', ['team_id', 'year', 'split_id'],
    ['level_id', 'g', 'r', 'pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'k', 'hp', 'sf', 'sb', 'cs'], { years: seasons, split: 0 });
  const pitching = rows(tables, 'team_pitching_stats', ['team_id', 'year', 'split_id'],
    ['level_id', 'g', 'r', 'ra', 'outs', 'er', 'ha', 'bb', 'k', 'hra', 'hp', 'bf'], { years: seasons, split: 0 });
  const playerKeys = ['player_id', 'team_id', 'league_id', 'level_id', 'year', 'split_id'];
  const playerBatting = rows(tables, 'players_career_batting_stats', playerKeys,
    ['pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'ibb', 'hp', 'sf', 'k', 'sb', 'cs', 'r', 'rbi', 'war'], { years: seasons, split: 1 });
  const playerPitching = rows(tables, 'players_career_pitching_stats', playerKeys,
    ['outs', 'er', 'ra', 'ha', 'bb', 'k', 'hra', 'hp', 'bf', 'g', 'gs', 'w', 'l', 's', 'hld', 'war'], { years: seasons, split: 1 });
  const roster = rows(tables, 'players_roster_status', ['player_id'],
    ['is_active', 'is_on_dl', 'is_on_dl60', 'is_on_secondary', 'designated_for_assignment', 'is_on_waivers']);
  const memberships = rows(tables, 'team_roster', ['team_id', 'player_id', 'list_id']);
  const finances = rows(tables, 'team_financials', ['team_id'],
    ['budget', 'player_payroll', 'player_payroll_next_season', 'cash_trades_available']);

  const history = rangersHistory();
  const insert = history.prepare(`
    INSERT INTO checkpoints (save_key, org_id, game_date, season, digest, payload)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(save_key, org_id, game_date, digest) DO NOTHING
  `);
  return history.transaction(() => {
    let count = 0;
    for (const org of orgs) {
      const league = leagues.get(org.leagueId)?.[0];
      const date = gameDate(league?.current_date ?? null);
      const season = league?.season_year;
      if (!date || typeof season !== 'number' || !Number.isInteger(season)) continue;
      const clubIds = new Set(teams.filter((t) => t.team_id === org.id || t.parent_team_id === org.id).map((t) => t.team_id));
      const orgPlayers = playersByOrg.get(org.id) ?? [];
      const ids = new Set(orgPlayers.map((p) => p.player_id));
      const teamLine = (r: Row) => clubIds.has(r.team_id) && r.year === season && r.split_id === 0;
      const playerLine = (r: Row) => r.year === season && r.split_id === 1 &&
        typeof r.league_id === 'number' && r.league_id > 0 && (clubIds.has(r.team_id) || ids.has(r.player_id));
      const standingsTeams = teams.filter((t) => clubIds.has(t.team_id) || t.league_id === org.leagueId);
      const standingsIds = new Set(standingsTeams.map((t) => t.team_id));
      const payload = JSON.stringify({
        teams: standingsTeams,
        standings: records?.filter((r) => standingsIds.has(r.team_id)) ?? null,
        teamBatting: batting?.filter(teamLine) ?? null,
        teamPitching: pitching?.filter(teamLine) ?? null,
        assignments: orgPlayers,
        playerBatting: playerBatting?.filter(playerLine) ?? null,
        playerPitching: playerPitching?.filter(playerLine) ?? null,
        roster: roster?.filter((r) => ids.has(r.player_id)) ?? null,
        memberships: memberships?.filter((r) => clubIds.has(r.team_id)) ?? null,
        finances: finances?.filter((r) => clubIds.has(r.team_id)) ?? null,
      });
      const digest = createHash('sha256').update(payload).digest('hex');
      count += insert.run(key, org.id, date, season, digest, gzipSync(payload)).changes;
    }
    return count;
  })();
}

checkpointRoutes.get('/checkpoints/:orgId', (req, res) => {
  const scope = activeSaveScope();
  const orgId = Number(req.params.orgId);
  if (!scope) return res.status(409).json({ error: 'Import the selected export to view checkpoints.' });
  const history = rangersHistory();
  if (req.query.id !== undefined) {
    const row = history.prepare(`
      SELECT game_date AS gameDate, season, payload FROM checkpoints WHERE save_key = ? AND org_id = ? AND id = ?
    `).get(scope.key, orgId, Number(req.query.id)) as { gameDate: string; season: number; payload: Buffer } | undefined;
    if (!row) return res.status(404).json({ error: 'Checkpoint unavailable.' });
    return res.json({ gameDate: row.gameDate, season: row.season, data: JSON.parse(gunzipSync(row.payload).toString()) });
  }
  return res.json(history.prepare(`
    SELECT id, game_date AS gameDate, season FROM checkpoints
    WHERE save_key = ? AND org_id = ? ORDER BY game_date DESC, id DESC
  `).all(scope.key, orgId));
});
