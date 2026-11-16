import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { DATA_DIR } from '../server/config.js';
import { db } from '../server/db.js';
import { IDS } from './fixture.js';
import request, { post, put } from './request.js';
import { makeCopiedExport, waitForImport } from './copiedExport.js';

it('loads the Rangers template explicitly and preserves scoped strategy across imports and reloads', async () => {
  db.prepare("UPDATE teams SET name = 'Texas', nickname = 'Rangers' WHERE team_id = ?").run(IDS.mlbTeam);
  db.prepare("UPDATE players SET first_name = 'Wyatt', last_name = 'Langford' WHERE player_id = ?").run(IDS.starter);
  const tables = ['teams', 'players', 'leagues'];
  const a = makeCopiedExport('strategy-a-', tables);
  const b = makeCopiedExport('strategy-b-', tables);
  const select = async (csvDir: string) => {
    await post('/api/config', { csvDir, saveName: 'Same league title' });
    await waitForImport();
  };
  await post('/api/settings', { autoImport: false });
  await select(a);
  const url = '/api/gm-philosophy/' + IDS.mlbTeam;
  const original = await request(url);
  expect(original.philosophy.guidance).toBe('');
  expect(original.rangersTemplate).toMatchObject({
    payrollGuideline: 190_000_000, protectedPlayers: [{ id: IDS.starter, name: 'Wyatt Langford' }],
    unresolved: ['Sebastian Walcott'],
  });
  const update = {
    saveKey: original.saveKey, revision: original.revision, guidance: 'Emphasize defense.',
    payrollGuideline: 190_000_000, protectedIds: [IDS.starter],
  };
  await expect(put(url, { ...update, guidance: 'a'.repeat(4001) })).rejects.toThrow('400');
  await expect(put(url, { ...update, protectedIds: [IDS.tradedAway] })).rejects.toThrow('400');
  await put(url, update);
  await expect(put(url, update)).rejects.toThrow('409');
  const saved = (await request(url)).philosophy;
  const reopened = new Database(path.join(DATA_DIR, 'rangers-history.db'), { readonly: true });
  expect(reopened.prepare('SELECT guidance FROM gm_philosophies').get()).toEqual({ guidance: 'Emphasize defense.' });
  reopened.close();
  expect((await request('/api/gm-philosophy/' + IDS.otherMlbTeam)).philosophy.guidance).toBe('');
  await post('/api/import', {});
  await waitForImport();
  expect((await request(url)).philosophy).toEqual(saved);
  await select(b);
  expect((await request(url)).philosophy.guidance).toBe('');
  await expect(put(url, { ...update, revision: 1 })).rejects.toThrow('409');
  await select(a);
  expect((await request(url)).philosophy).toEqual(saved);
});
