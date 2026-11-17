import type { PlayerExposure, TradeExposure as Exposure } from '../../shared/tradeExposure';
import { PlayerLink } from '../playerModal';

const dollars = (amount: number | null) => amount === null
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const delta = (amount: number | null) => amount !== null && amount > 0 ? '+' + dollars(amount) : dollars(amount);

export function TradeExposure({ data }: { data: Exposure }) {
  return (
    <section className="trade-exposure">
      <h3>Contract Exposure</h3>
      <p className="muted">Annual salaries use full-season amounts. Available projections apply the scheduled salary
        change to the exported payroll, assuming option years are paid. Arbitration, renewals, unexported buyouts, and future roster moves are uncertain.</p>
      {data.guideline !== null && <p>GM payroll guideline · <strong>{dollars(data.guideline)}</strong></p>}
      {data.warnings.map((warning) => <p key={warning} className="warn">{warning}</p>)}
      {data.payrollYears.filter((year) => year.overGuideline).map((year) => (
        <p key={year.year} className="warn" role="status">
          {year.year} scheduled payroll would exceed the GM guideline by {dollars(year.afterTrade! - data.guideline!)}.
        </p>
      ))}
      <div className="trade-table-wrap" tabIndex={0} aria-label="Payroll impact by season">
        <table>
          <thead><tr>
            <th scope="col">Season</th>
            <th scope="col" title="Change in known guaranteed major-league salaries attributable to the proposal">Guaranteed change</th>
            <th scope="col" title="Change if all listed option salaries are paid">Scheduled change</th>
            <th scope="col">Exported payroll</th>
            <th scope="col">Scheduled payroll after deal</th>
          </tr></thead>
          <tbody>{data.payrollYears.map((year) => (
            <tr key={year.year}>
              <td>{year.year}</td><td>{delta(year.guaranteedDelta)}</td><td>{delta(year.scheduledDelta)}</td>
              <td>{dollars(year.exportPayroll)}</td><td>{dollars(year.afterTrade)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="trade-value-grid">
        <div><h4>Outgoing contracts</h4>{data.outgoing.map((p) => <PlayerContract key={p.playerId} player={p} />)}</div>
        <div><h4>Incoming contracts</h4>{data.incoming.map((p) => <PlayerContract key={p.playerId} player={p} />)}</div>
      </div>
    </section>
  );
}

function PlayerContract({ player }: { player: PlayerExposure }) {
  return (
    <details className="trade-player-value">
      <summary>{player.name} · {dollars(player.currentSalary)} this season</summary>
      <ul className="trade-contract-facts">
        <li><PlayerLink id={player.playerId}>Player profile</PlayerLink></li>
        {player.contractYears !== null && <li>{player.contractYears}-year deal
          {player.contractThrough !== null && ` through ${player.contractThrough}`}</li>}
        {player.extensionFrom !== null && <li>Signed extension · {player.extensionFrom}–{player.extensionThrough}</li>}
        <li>{player.guaranteedIncomplete ? 'Identified guaranteed salary' : 'Scheduled guaranteed salary'} · {dollars(player.guaranteedKnown)}
          {player.guaranteedIncomplete && ' · export is incomplete'}</li>
        <li>Control after this season · {player.control ?? 'Unknown'}</li>
        {player.freeAgencyAfter !== null && <li>Estimated free agency after {player.freeAgencyAfter} with continuous service and listed options paid</li>}
      </ul>
      {player.years.length > 0 && <div className="trade-table-wrap" tabIndex={0} aria-label={`Contract schedule for ${player.name}`}>
        <table>
          <thead><tr><th scope="col">Season</th><th scope="col">Salary</th><th scope="col">Prior club retains</th><th scope="col">Terms</th></tr></thead>
          <tbody>{player.years.map((year) => (
            <tr key={year.year}>
              <td>{year.year}</td><td>{dollars(year.salary)}</td><td>{dollars(year.retainedByPriorClub)}</td>
              <td>{[year.source, ...year.options, ...(year.optionDataMissing ? ['option status unknown'] : [])].join(' · ')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
    </details>
  );
}
