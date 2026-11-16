import { expect, it } from 'vitest';
import { db } from '../server/db.js';
import { IDS, SEASON } from './fixture.js';
import request, { post, put } from './request.js';
import { makeCopiedExport, waitForImport } from './copiedExport.js';

it('shows protected players, raw value, scouting, ranks and scheduled payroll without folding options into guarantees', async () => {
  const orgId = IDS.mlbTeam;
  db.prepare('UPDATE players_contract SET retained = 25, last_year_vesting_option = 1 WHERE player_id = ?')
    .run(IDS.tradedAway);
  db.prepare('UPDATE players_contract SET last_year_team_option = 1 WHERE player_id = ?').run(IDS.starter);
  db.prepare('UPDATE team_financials SET budget = ?, player_payroll = ?, player_payroll_next_season = ? WHERE team_id = ?')
    .run(250_000_000, 188_000_000, 180_000_000, orgId);
  await post('/api/settings', { autoImport: false });
  await post('/api/config', { csvDir: makeCopiedExport('trade-', [
    'players', 'teams', 'leagues', 'players_contract', 'players_contract_extension', 'team_financials',
    'players_roster_status',
  ]) });
  await waitForImport();
  const philosophy = '/api/gm-philosophy/' + orgId;
  const { saveKey, revision } = await request(philosophy);
  await put(philosophy, { saveKey, revision, guidance: '', payrollGuideline: 190_000_000, protectedIds: [IDS.starter] });

  const compare = (sideA: number[], sideB: number[]) => post('/api/trade/analyze', { orgId, sideA, sideB });
  const { sideA, exposure } = await compare([IDS.starter], [IDS.tradedAway]);
  expect(sideA.players[0]).toMatchObject({
    valuePoints: 1200, oaRating: 60, overallPct: 83, protected: true, seasonLine: { pa: 200 },
  });
  expect(exposure.incoming[0]).toMatchObject({
    currentSalary: 20_000_000, guaranteedKnown: 20_000_000,
    years: [
      { year: SEASON, salary: 20_000_000, transferred: 15_000_000, retainedByPriorClub: 5_000_000 },
      { year: SEASON + 1, options: ['vesting option'], retainedByPriorClub: 5_000_000 },
    ],
  });
  expect(exposure.outgoing[0]).toMatchObject({ guaranteedKnown: 10_000_000, guaranteedIncomplete: false,
    years: [{ options: [] }, { options: ['team option'] }] });
  expect(exposure.payrollYears).toMatchObject([
    { year: SEASON, guaranteedDelta: 5_000_000, scheduledDelta: 5_000_000, afterTrade: 193_000_000, overGuideline: true },
    { year: SEASON + 1, guaranteedDelta: 0, scheduledDelta: 5_000_000, afterTrade: 185_000_000, overGuideline: false },
  ]);

  const extended = (await compare([IDS.extended], [IDS.tradedAway])).exposure.outgoing[0];
  expect(extended).toMatchObject({
    extensionFrom: SEASON + 1, extensionThrough: SEASON + 5, guaranteedKnown: 108_000_000, guaranteedIncomplete: true,
  });
  expect(extended.years[0]).toMatchObject({ source: 'contract', salary: 8_000_000 });
  expect(extended.years[1]).toMatchObject({ source: 'extension', salary: 25_000_000 });
  expect(extended.years.at(-1)).toMatchObject({ optionDataMissing: true });

  db.prepare('UPDATE players_contract SET salary2 = NULL WHERE player_id = ?').run(IDS.tradedAway);
  const incomplete = (await compare([IDS.starter], [IDS.tradedAway])).exposure;
  expect(incomplete.incoming[0]).toMatchObject({ currentSalary: null, guaranteedIncomplete: true });
  expect(incomplete.payrollYears[0]).toMatchObject({ afterTrade: null, overGuideline: false });
  const invalid = (await compare([IDS.tradedAway], [IDS.starter])).exposure;
  expect(invalid.payrollYears[0].scheduledDelta).toBeNull();
});

it('preserves arbitration and pre-arbitration as service-based control with unknown future salary', async () => {
  const orgId = IDS.mlbTeam;
  const { exposure } = await post('/api/trade/analyze', {
    orgId, sideA: [IDS.boundary, IDS.optioned], sideB: [IDS.tradedAway],
  });
  expect(exposure.outgoing[0].control).toMatch(/arbitration/);
  expect(exposure.outgoing[0].freeAgencyAfter).toBeGreaterThan(SEASON);
  expect(exposure.outgoing[1].years.map((line: { year: number }) => line.year)).toEqual([SEASON, SEASON + 1]);
});
