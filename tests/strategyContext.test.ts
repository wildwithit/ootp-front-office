import { expect, it, vi } from 'vitest';
import { IDS } from './fixture.js';
import request, { post, postText, put } from './request.js';
import { makeCopiedExport, waitForImport } from './copiedExport.js';

const prompts = vi.hoisted(() => [] as string[]);
vi.mock('../server/providers.js', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('../server/providers.js')>();
  const toolLoop = () => async ({ system }: { system: string }) => {
    prompts.push(system);
    return { answer: 'Fixture response.', refused: false };
  };
  return {
    ...original, toolLoop, toolLoopFor: toolLoop,
    providerFor: () => ({
      complete: async ({ system }: { system: string }) => {
        prompts.push(system);
        return 'Fixture briefing.';
      },
    }),
  };
});

it('sends the philosophy once per solo, group, trade, follow-up, and briefing request', async () => {
  const orgId = IDS.mlbTeam;
  await post('/api/settings', { autoImport: false, provider: 'ollama' });
  await post('/api/config', { csvDir: makeCopiedExport('prompts-', ['teams', 'players', 'leagues']) });
  await waitForImport();
  const url = '/api/gm-philosophy/' + orgId;
  const { saveKey, revision } = await request(url);
  const guidance = 'Favor a defensively credible shortstop.';
  await put(url, { saveKey, revision, guidance, payrollGuideline: 190_000_000, protectedIds: [IDS.starter] });
  const messages = [{ role: 'user', content: 'What should we do?' }];
  expect(await postText('/api/chat', { orgId, persona: 'manager', messages })).toContain('event: done');
  expect(await postText('/api/chat', { orgId, persona: 'room', members: ['manager', 'analyst'], messages }))
    .toContain('event: done');
  const trade = { orgId, orgLabel: 'Test Nine', sideA: [IDS.starter], sideB: [IDS.tradedAway] };
  await post('/api/trade/ai-eval', trade);
  await post('/api/trade/ai-reply', { ...trade, message: 'Would they counter?' });
  await post('/api/briefing/' + orgId, {});
  await vi.waitFor(() => expect(prompts).toHaveLength(6));
  expect(prompts[0]).toMatch(/manager/i);
  expect(prompts[1]).toContain('in a room');
  expect(prompts[2]).toMatch(/analyst/i);
  expect(prompts[3]).toContain('Organizational recommendation');
  expect(prompts[4]).toContain('already given your verdict');
  expect(prompts[5]).toContain('weekly briefing');
  for (const prompt of prompts) {
    expect(prompt.split(guidance)).toHaveLength(2);
    expect(prompt).toContain('Reg Ular #10');
    expect(prompt).toContain('190000000 dollars');
  }
});
