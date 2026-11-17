import { db, hasColumns, tableExists } from './db.js';
import { controlAfterThisSeason, SERVICE_DAYS_PER_YEAR, serviceRemainingThisSeason } from './contracts.js';
import { activeSaveScope } from './saveScope.js';
import { gmPhilosophy } from './gmPhilosophy.js';
import { payingShare, salarySlotForYear, type ContractRow, type ExtensionRow } from './payroll.js';
import { leagueRules, seasonYear } from './valuation.js';
import type { PlayerExposure, TradeExposure, TradeSalaryYear } from '../shared/tradeExposure.js';

const optionFields = {
  last_year_team_option: 'team option',
  last_year_player_option: 'player option',
  last_year_vesting_option: 'vesting option',
} as const;

function money(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function tradeExposure(orgId: number, give: number[], receive: number[]): TradeExposure | null {
  if (!orgId || !hasColumns('teams', 'team_id', 'league_id') || !hasColumns('leagues', 'league_id', 'season_year')) return null;
  const team = db.prepare('SELECT league_id FROM teams WHERE team_id = ?').get(orgId) as { league_id: number } | undefined;
  if (!team) return null;
  const season = seasonYear(team.league_id);
  const scope = activeSaveScope();
  const exported = (table: string) => scope ? scope.tables.includes(table) : tableExists(table);
  const rulesKnown = hasColumns('leagues', 'rules_fa_minimum_years', 'rules_salary_arbitration_minimum_years',
    'rules_minimum_salary', 'financial_coefficient');
  const rules = rulesKnown ? leagueRules(team.league_id) : null;
  const serviceLeft = exported('players_roster_status') && hasColumns('players_roster_status', 'mlb_service_days_this_year') ? serviceRemainingThisSeason() : null;
  const playerQuery = db.prepare(`
    SELECT organization_id AS org, TRIM(first_name || ' ' || last_name) AS name
      FROM players WHERE player_id = ?
  `);
  const contractQuery = exported('players_contract') && hasColumns('players_contract', 'player_id', 'years')
    ? db.prepare('SELECT * FROM players_contract WHERE player_id = ? AND years > 0') : null;
  const extensionQuery = exported('players_contract_extension') && hasColumns('players_contract_extension', 'player_id', 'years')
    ? db.prepare('SELECT * FROM players_contract_extension WHERE player_id = ? AND years > 0') : null;
  const serviceQuery = exported('players_roster_status') && hasColumns('players_roster_status', 'player_id', 'mlb_service_years', 'mlb_service_days')
    ? db.prepare('SELECT mlb_service_years AS years, mlb_service_days AS days FROM players_roster_status WHERE player_id = ?') : null;
  const warnings = new Set<string>();
  let usesInvalidSides = new Set([...give, ...receive]).size !== give.length + receive.length;
  const major = new Map<number, boolean | null>();

  const evaluate = (playerId: number, outgoing: boolean): PlayerExposure => {
    const p = playerQuery.get(playerId) as { org: number | null; name: string } | undefined;
    const cs = contractQuery?.all(playerId) as ContractRow[] | undefined;
    const es = extensionQuery?.all(playerId) as ExtensionRow[] | undefined;
    const c = cs?.length === 1 ? cs[0] : undefined;
    const extension = es?.length === 1 ? es[0] : undefined;
    if (!p || (outgoing ? p.org !== orgId : !p.org || p.org === orgId)) usesInvalidSides = true;
    if ((cs?.length ?? 0) > 1 || (es?.length ?? 0) > 1) warnings.add('Some export rows contain overlapping contract records. Their exposure is incomplete.');
    major.set(playerId, c?.is_major === 1 ? true : c?.is_major === 0 ? false : null);
    const completed = c && Number.isInteger(c.current_year) && c.current_year >= 0 ? c.current_year : null;
    const candidateYear = extension?.season_year;
    const extensionFrom = Number.isInteger(candidateYear) && candidateYear! >= season - 30 && candidateYear! <= season + 30
      ? candidateYear! : null;
    const extensionThrough = extensionFrom !== null ? extensionFrom + extension!.years - 1 : null;
    const contractThrough = completed !== null ? season + c!.years - completed - 1 : null;
    const blank: ContractRow = { player_id: playerId, years: 0, current_year: 0, season_year: season };
    const years: TradeSalaryYear[] = [];
    if (completed !== null && Number.isInteger(c?.season_year) && c!.season_year + completed !== season) {
      warnings.add('At least one contract’s start year and elapsed-year index disagree. The schedule uses the OOTP current salary slot.');
    }
    const horizon = Math.min(Math.max(contractThrough ?? season, extensionThrough ?? season), season + 30);
    for (let year = season; year <= horizon; year++) {
      const slot = salarySlotForYear(completed !== null ? c! : blank, season, year,
        extensionFrom !== null ? extension : undefined);
      if (!slot) continue;
      const final = slot.index === slot.row.years - 1;
      const flags = (Object.keys(optionFields) as Array<keyof typeof optionFields>);
      const options = final ? flags.filter((f) => slot.row[f] === 1).map((f) => optionFields[f]) : [];
      const optionDataMissing = final && !flags.every((f) => slot.row[f] === 0 || slot.row[f] === 1);
      const salary = slot.index <= 14 ? money(slot.row[`salary${slot.index}`]) : null;
      // An existing retained share belongs to the original contract. A separately signed extension starts its own term.
      const retentionKnown = slot.source === 'extension' ||
        (typeof c?.retained === 'number' && c.retained >= 0 && c.retained <= 100 &&
          (c.retained === 0 || (typeof c.contract_team_id === 'number' && c.contract_team_id > 0 && typeof p?.org === 'number')));
      const share = slot.source === 'extension' || !c ? 1 : payingShare({
        contract_team_id: c.contract_team_id, current_org: p?.org ?? null, retained: c.retained,
      }, p?.org ?? 0);
      const transferred = salary === null || !retentionKnown ? null : Math.round(salary * share);
      years.push({ year, source: slot.source, salary, transferred, options, optionDataMissing,
        retainedByPriorClub: salary === null || transferred === null ? null : salary - transferred });
    }

    const service = serviceQuery?.get(playerId) as { years: number | null; days: number | null } | undefined;
    const end = Math.max(season, contractThrough ?? season, extensionThrough ?? season);
    const serviceValue = service?.days != null ? service.days / SERVICE_DAYS_PER_YEAR : service?.years ?? null;
    const control = rules && (extensionFrom !== null || end > season || (serviceValue !== null && serviceLeft !== null) || !rules.hasFreeAgency)
      ? controlAfterThisSeason({
          yearsAfterThis: end - season, hasExtension: extensionFrom !== null,
          serviceDays: service?.days ?? null, serviceYears: service?.years ?? null,
          serviceLeft: serviceLeft ?? 0, rules,
        })
      : null;
    const faEstimate = rules?.hasFreeAgency && serviceValue !== null && serviceLeft !== null
      ? Math.max(end, season + Math.max(0, Math.ceil(rules.faMinYears - serviceValue - serviceLeft)))
      : null;
    const unknownTerm = c === undefined || (c !== undefined && completed === null) ||
      (extension !== undefined && extensionFrom === null) || extensionQuery === null || horizon < end ||
      (cs?.length ?? 0) > 1 || (es?.length ?? 0) > 1;
    const guaranteedYears = years.filter((y) => !y.options.length && !y.optionDataMissing);
    return {
      playerId, name: p?.name ?? `Player #${playerId}`,
      currentSalary: years.find((y) => y.year === season)?.salary ?? null,
      contractYears: c?.years ?? null, contractThrough, extensionFrom, extensionThrough,
      guaranteedKnown: guaranteedYears.reduce((total, y) => total + (y.salary ?? 0), 0),
      guaranteedIncomplete: unknownTerm || guaranteedYears.some((y) => y.salary === null) || years.some((y) => y.optionDataMissing),
      control: control?.status === 'arbitration' ? `arbitration (year ${control.arbYear})` : control?.status ?? null,
      freeAgencyAfter: faEstimate,
      years,
    };
  };

  const outgoing = give.map((id) => evaluate(id, true));
  const incoming = receive.map((id) => evaluate(id, false));
  if (usesInvalidSides) warnings.add('Payroll projections require unique players on the correct side of the proposal.');
  const payroll = exported('team_financials') && hasColumns('team_financials', 'team_id')
    ? db.prepare('SELECT * FROM team_financials WHERE team_id = ?').get(orgId) as Record<string, number> | undefined
    : undefined;
  const guideline = gmPhilosophy(orgId).payrollGuideline;
  const lastYear = Math.max(season + 1, ...[...outgoing, ...incoming].flatMap((p) => p.years.map((y) => y.year)));
  const payrollYears: TradeExposure['payrollYears'] = [];
  for (let year = season; year <= lastYear; year++) {
    let unknown = usesInvalidSides;
    let guaranteedDelta: number | null = usesInvalidSides ? null : 0;
    let scheduledDelta = 0;
    for (const [side, sign] of [[outgoing, -1], [incoming, 1]] as const) {
      for (const player of side) {
        const isMajor = major.get(player.playerId);
        const line = player.years.find((y) => y.year === year);
        if (isMajor === false && line?.source !== 'extension') continue;
        if (!line) {
          // Future arbitration/renewal salaries and gaps have no exported dollar value.
          if (guaranteedDelta !== null && player.guaranteedIncomplete) guaranteedDelta = null;
          if (!player.freeAgencyAfter || year <= player.freeAgencyAfter || player.guaranteedIncomplete) unknown = true;
          continue;
        }
        if ((isMajor === null && line.source !== 'extension') || line.transferred === null) {
          unknown = true;
          guaranteedDelta = null;
          continue;
        }
        scheduledDelta += sign * line.transferred;
        if (line.optionDataMissing) guaranteedDelta = null;
        else if (!line.options.length && guaranteedDelta !== null) guaranteedDelta += sign * line.transferred;
      }
    }
    const exportPayroll = year === season ? money(payroll?.player_payroll) :
      year === season + 1 ? money(payroll?.player_payroll_next_season) : null;
    const afterTrade = exportPayroll !== null && !unknown ? exportPayroll + scheduledDelta : null;
    payrollYears.push({
      year, guaranteedDelta, scheduledDelta: unknown ? null : scheduledDelta, exportPayroll, afterTrade,
      overGuideline: guideline !== null && afterTrade !== null && afterTrade > guideline,
    });
  }
  return { season, guideline, outgoing, incoming, payrollYears, warnings: [...warnings] };
}
