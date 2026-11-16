import { Router } from 'express';
import { db, hasColumns } from './db.js';
import { rangersHistory } from './rangersHistory.js';
import { activeSaveScope, scopeOrganizations } from './saveScope.js';
import {
  GUIDANCE_LIMIT, PROTECTED_LIMIT, type GMPhilosophy, type ProtectedPlayer,
} from '../shared/gmPhilosophy.js';

export const philosophyRoutes = Router();
const empty: GMPhilosophy = { guidance: '', payrollGuideline: null, protectedPlayers: [] };

function read(key: string, orgId: number): { revision: number; philosophy: GMPhilosophy } {
  const row = rangersHistory().prepare(`
    SELECT revision, guidance, payroll_guideline, protected_players
    FROM gm_philosophies WHERE save_key = ? AND org_id = ?
  `).get(key, orgId) as {
    revision: number; guidance: string; payroll_guideline: number | null; protected_players: string;
  } | undefined;
  return row ? {
    revision: row.revision,
    philosophy: {
      guidance: row.guidance, payrollGuideline: row.payroll_guideline,
      protectedPlayers: JSON.parse(row.protected_players) as ProtectedPlayer[],
    },
  } : { revision: 0, philosophy: empty };
}

export function gmPhilosophy(orgId: number): GMPhilosophy {
  const scope = activeSaveScope();
  return scope ? read(scope.key, orgId).philosophy : empty;
}

function playersInOrg(orgId: number): ProtectedPlayer[] {
  if (!hasColumns('players', 'player_id', 'first_name', 'last_name', 'organization_id', 'retired', 'hidden')) return [];
  return db.prepare(`
    SELECT player_id AS id, TRIM(first_name || ' ' || last_name) AS name FROM players
    WHERE organization_id = ? AND COALESCE(retired, 0) = 0 AND COALESCE(hidden, 0) = 0
    ORDER BY name COLLATE NOCASE, player_id
  `).all(orgId) as ProtectedPlayer[];
}

function texasTemplate(orgName: string, orgId: number): (GMPhilosophy & { unresolved: string[] }) | null {
  if (orgName.toLowerCase() !== 'texas rangers') return null;
  const players = playersInOrg(orgId);
  const protectedPlayers: ProtectedPlayer[] = [];
  const unresolved: string[] = [];
  for (const name of ['Wyatt Langford', 'Sebastian Walcott']) {
    const matches = players.filter((player) => player.name.toLowerCase() === name.toLowerCase());
    if (matches.length === 1) protectedPlayers.push(matches[0]);
    else unresolved.push(name);
  }
  return {
    guidance: [
      'Competitive window: Compete for the AL West in 2027 while preserving long-term organizational health. Reassess near the trade deadline.',
      'Offense: Emphasize OBP, contact, manageable strikeouts, speed, and intelligent baserunning. Value power when it contributes to total offense.',
      'Defense: Prioritize range, defensive efficiency, and legitimate positional versatility.',
      'Pitching: Favor strike throwing, low walk rates, groundballs, and home-run prevention. Consider exceptional pitchers on their full profiles.',
      'Development: Preserve upside and weigh actual readiness, risk, roster opportunities, and performance trends.',
      'Draft: Take the best player available rather than drafting rigidly for position.',
      'Trades: Consider realistic incentives for both clubs. OOTP acceptance alone cannot establish plausibility.',
      'Staff: Challenge unsupported assumptions, use independent judgment, and recommend holding when warranted.',
    ].join('\n'),
    payrollGuideline: 190_000_000,
    protectedPlayers,
    unresolved,
  };
}

philosophyRoutes.get('/gm-philosophy/:orgId', (req, res) => {
  const scope = activeSaveScope();
  const org = scopeOrganizations().find((club) => club.id === Number(req.params.orgId));
  if (!scope) return res.status(409).json({ error: 'Import the selected export to edit its GM philosophy.' });
  if (!org) return res.status(404).json({ error: 'Organization unavailable.' });
  res.json({ saveKey: scope.key, ...read(scope.key, org.id), rangersTemplate: texasTemplate(org.name, org.id) });
});

philosophyRoutes.get('/gm-philosophy/:orgId/players', (req, res) => {
  const scope = activeSaveScope();
  if (!scope || req.query.saveKey !== scope.key) return res.status(409).json({ error: 'The selected save changed.' });
  const org = scopeOrganizations().find((club) => club.id === Number(req.params.orgId));
  if (!org) return res.status(404).json({ error: 'Organization unavailable.' });
  const query = String(req.query.q ?? '').trim().toLowerCase();
  res.json(query.length < 2 ? [] : playersInOrg(org.id).filter((p) => p.name.toLowerCase().includes(query)).slice(0, 24));
});

philosophyRoutes.put('/gm-philosophy/:orgId', (req, res) => {
  const scope = activeSaveScope();
  const org = scopeOrganizations().find((club) => club.id === Number(req.params.orgId));
  const { saveKey, revision, guidance, payrollGuideline, protectedIds } = req.body ?? {};
  if (!scope || saveKey !== scope.key) return res.status(409).json({ error: 'The selected save changed. Reopen the editor to save there.' });
  if (!org) return res.status(404).json({ error: 'Organization unavailable.' });
  const previous = read(scope.key, org.id);
  if (revision !== previous.revision) {
    return res.status(409).json({ error: 'This philosophy changed in another editor. Reopen Settings to load it.' });
  }
  if (typeof guidance !== 'string' || guidance.length > GUIDANCE_LIMIT ||
      (payrollGuideline !== null && (!Number.isSafeInteger(payrollGuideline) || payrollGuideline <= 0)) ||
      !Array.isArray(protectedIds) || protectedIds.length > PROTECTED_LIMIT ||
      !protectedIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({ error: 'Check the guidance length, payroll amount, and protected players.' });
  }
  const valid = new Map([...previous.philosophy.protectedPlayers, ...playersInOrg(org.id)].map((p) => [p.id, p]));
  const protectedPlayers: ProtectedPlayer[] = [];
  for (const id of new Set<number>(protectedIds)) {
    const player = valid.get(id);
    if (!player) return res.status(400).json({ error: 'Choose each protected player from this organization.' });
    protectedPlayers.push(player);
  }
  const nextRevision = previous.revision + 1;
  rangersHistory().prepare(`
    INSERT INTO gm_philosophies VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(save_key, org_id) DO UPDATE SET revision = excluded.revision,
      guidance = excluded.guidance, payroll_guideline = excluded.payroll_guideline,
      protected_players = excluded.protected_players
  `).run(scope.key, org.id, nextRevision, guidance.trim(), payrollGuideline, JSON.stringify(protectedPlayers));
  res.json({ saveKey: scope.key, ...read(scope.key, org.id), rangersTemplate: texasTemplate(org.name, org.id) });
});

/** One bounded block per model request; all voices keep their own instructions. */
export function strategyContext(orgId: number): string {
  const { guidance, payrollGuideline, protectedPlayers } = gmPhilosophy(orgId);
  if (!guidance && payrollGuideline === null && protectedPlayers.length === 0) return '';
  const protections = protectedPlayers.map(({ id, name }) => `${name} #${id}`).join(', ');
  return [
    'Human GM philosophy (planning preferences). Use it where relevant, including contracts, free agents, draft and international acquisition. Keep your own professional judgment, identify missing evidence, and recommend holding when it is the strongest option.',
    guidance,
    payrollGuideline === null ? '' : `Annual player-payroll guideline: ${payrollGuideline} dollars. Advisory target, separate from the OOTP owner budget and exported player values.`,
    protections ? `Protected outgoing assets: ${protections}. Flag them in existing proposals and exclude them from your recommended outgoing packages and counteroffers.` : '',
    'Trade structures are advisory. Only OOTP establishes a completed transaction.',
  ].filter(Boolean).join('\n');
}
