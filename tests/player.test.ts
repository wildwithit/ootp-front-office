import { describe, expect, it } from 'vitest';
import request from './request';
import { IDS, SEASON } from './fixture';

/**
 * The hover card reads a player's current line straight off this list, so the
 * order is a contract, not an implementation detail. Taking the wrong end of it
 * showed a veteran his A-ball season from a decade earlier.
 */
describe('career rows', () => {
  it('come back newest first', async () => {
    const d = await request(`/api/player/${IDS.starter}`);
    expect(d.battingYears.length).toBeGreaterThan(1);
    expect(d.battingYears[0].year).toBe(SEASON);
    expect(d.battingYears[d.battingYears.length - 1].year).toBe(SEASON - 6);
  });

  it('name the level each line was compiled at', async () => {
    const d = await request(`/api/player/${IDS.starter}`);
    // Rate stats mean different things by level, and the card puts them beside
    // ratings that are on a major-league scale
    expect(d.battingYears[0].levelName).toBe('MLB');
    expect(d.battingYears[d.battingYears.length - 1].levelName).toBe('A');
  });
});

describe('quick look', () => {
  it('uses the same rate calculations as the current-level roster stats', async () => {
    const d = await request(`/api/player/${IDS.starter}`);
    const roster = await request(`/api/roster/${IDS.mlbTeam}`);
    const batting = roster.players.find((p: { player_id: number }) => p.player_id === IDS.starter).batting;
    expect(d.quickLook.batting).toMatchObject({
      year: SEASON, levelName: 'MLB', stats: {
        pa: 200, wrcPlus: batting.wrcPlus, war: batting.war, kPct: batting.kPct, bbPct: batting.bbPct,
      },
    });
    expect(d.quickLook.pitching).toBeNull();
  });

  it('leaves current stats unavailable when the player has only amateur data', async () => {
    const d = await request(`/api/player/${IDS.draftee}`);
    expect(d.quickLook).toEqual({ batting: null, pitching: null });
  });
});
