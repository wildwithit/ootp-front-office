import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import request, { post } from './request.js';
import { IDS } from './fixture.js';
import { DATA_DIR } from '../server/config.js';
import { makeCopiedExport, waitForImport } from './copiedExport.js';

it('records real imports once per distinct checkpoint, persists on disk, and fences save scopes', async () => {
  const tables = [
    'teams', 'players', 'leagues', 'team_record', 'players_career_batting_stats',
    'players_career_pitching_stats', 'team_roster', 'players_roster_status',
  ];
  const first = makeCopiedExport('export-a-', tables);
  const second = makeCopiedExport('export-b-', tables.filter((t) => t !== 'players_career_batting_stats'));
  await post('/api/settings', { autoImport: false });
  const select = async (csvDir: string) => {
    await post('/api/config', { csvDir, saveName: 'Same display name' });
    await waitForImport();
  };
  const url = '/api/checkpoints/' + IDS.mlbTeam;
  await select(first);
  const original = await request(url);
  expect(original).toMatchObject([{ gameDate: '2030-06-01', season: 2030 }]);
  const { data } = await request(url + '?id=' + original[0].id);
  expect(data.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ player_id: IDS.starter })]));
  expect(data.playerBatting).toEqual(expect.arrayContaining([expect.objectContaining({ player_id: IDS.starter, pa: 200 })]));
  await post('/api/import', {});
  await waitForImport();
  expect(await request(url)).toEqual(original);

  const leagues = path.join(first, 'leagues.csv');
  fs.writeFileSync(leagues, fs.readFileSync(leagues, 'utf8').replace('2030-06-01', '2030-6-2'));
  await post('/api/import', {});
  await waitForImport();
  expect(await request(url)).toMatchObject([{ gameDate: '2030-06-02' }, original[0]]);
  const copiedHistory = new Database(path.join(DATA_DIR, 'rangers-history.db'), { readonly: true });
  expect(copiedHistory.prepare('SELECT count(*) n FROM checkpoints').get()).toEqual({ n: 4 });
  copiedHistory.close();

  await select(second);
  const other = await request(url);
  expect(other).toHaveLength(1);
  expect(other[0].id).not.toBe(original[0].id);
  expect((await request(url + '?id=' + other[0].id)).data.playerBatting).toBeNull();
  await expect(request(url + '?id=' + original[0].id)).rejects.toThrow('404');
  await select(first);
  expect(await request(url)).toHaveLength(2);
});
