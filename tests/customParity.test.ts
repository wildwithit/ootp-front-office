import { describe, expect, it } from 'vitest';
import { IDS } from './fixture.js';
import request, { post } from './request.js';
import { computePitching } from '../server/stats.js';
import { db } from '../server/db.js';
import { deadlineRead } from '../server/posture.js';

const org = IDS.mlbTeam;

describe('Front Office 0.42.0 parity', () => {
  it.each([
    ['orgs', null], ['roster/' + org, 'players'], ['depth-chart/' + org, 'players'],
    ['prospects/' + org, 'batters'], ['contracts/' + org, 'players'], ['payroll/' + org, 'years'],
    ['standings/' + org, null], ['staff/' + org, null], ['chat-staff/' + org, null],
    ['trade/fits/' + org, 'fits'], ['trade/roster/' + org, 'players'], ['watchlist', null],
    ['player/' + IDS.starter, null], ['free-agents/' + org, null], ['dashboard/' + org, null],
  ])('serves %s against the isolated fixture', async (endpoint, members) => {
    const result = await request('/api/' + endpoint);
    expect(result).toBeTypeOf('object');
    if (members) expect(result[members]).toBeInstanceOf(Array);
  });

  it('keeps the original trade, payroll, performance, and development numbers', async () => {
    const { sideA, sideB } = await post('/api/trade/analyze', {
      sideA: [IDS.starter, IDS.extended], sideB: [IDS.tradedAway],
    });
    const { players: roster } = await request('/api/roster/' + org);
    const player = roster.find((p: { player_id: number }) => p.player_id === IDS.starter);
    const { players: payroll, deadMoney } = await request('/api/payroll/' + org);
    const extended = payroll.find((p: { name: string }) => p.name === 'Locked Up');
    const { players: depth } = await request('/api/depth-chart/' + org);
    const prospects = await request('/api/prospects/' + org);
    expect(sideA).toMatchObject({ totalValue: 2700, totalTalent: 2800, totalSalary: 18_000_000 });
    expect(sideB).toMatchObject({ totalValue: 900, totalTalent: 850, totalSalary: 20_000_000 });
    expect(sideA.players[0]).toMatchObject({ overallPct: 83, talentPct: 83 });
    expect(player).toMatchObject({
      oaRating: 60, batting: { ops: 0.714, babip: 0.259, woba: 0.307, opsPlus: 100, wrcPlus: 100 },
    });
    expect(extended.byYear).toEqual([8_000_000, ...Array(5).fill(25_000_000)]);
    expect(deadMoney.total).toBe(5_000_000);
    expect(depth.find((p: { player_id: number }) => p.player_id === IDS.optioned)).toMatchObject({
      team_id: IDS.aaaTeam, cur: 45, pot: 45,
    });
    expect(prospects.baselines[1].avgOps).toBeCloseTo(0.713889);
    expect(prospects.baselines[2].avgAge).toBe(21);
  });

  it('keeps the original pitching formulas and postseason inputs', () => {
    const base = {
      lgOBP: 0.320, lgSLG: 0.400, lgWOBA: 0.310, lgRperPA: 0.11,
      lgERA: 4.2, lgFIPRaw: 1.1, parkFactor: new Map([[org, 1.05]]),
    };
    const line = computePitching({ outs: 180, er: 20, ha: 44, bb: 16, k: 60, hra: 7, hp: 3, bf: 233 }, base, org);
    expect(line).toMatchObject({ era: 3, whip: 1, k9: 9, bbPct: 6.9, fip: 3.57, eraPlus: 147 });
    db.prepare('INSERT INTO team_record (team_id,g,w,l,t,pos,pct,gb,streak,magic_number) VALUES (?,90,60,30,0,1,0.667,0,1,40)').run(org);
    db.prepare('INSERT INTO team_batting_stats (team_id,year,split_id,level_id,g,r) VALUES (?,2030,0,1,90,500)').run(org);
    db.prepare('INSERT INTO team_pitching_stats (team_id,year,split_id,level_id,g,r) VALUES (?,2030,0,1,90,350)').run(org);
    expect(deadlineRead(org)).toMatchObject({ posture: 'buy', runDiff: 150 });
  });

  it('serves the existing AI cache and provider surfaces without external requests', async () => {
    expect(await request('/api/briefing/' + org)).toHaveProperty('markdown', null);
    expect(await request('/api/newspaper/' + org)).toHaveProperty('job');
    const { providers } = await request('/api/settings/providers');
    expect(providers.map((p: { id: string }) => p.id).sort())
      .toEqual(['anthropic', 'gemini', 'ollama', 'openai', 'opencode']);
  });
});
