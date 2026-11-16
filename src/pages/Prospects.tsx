import { useEffect, useState } from 'react';
import { getProspects, type Prospect, type ProspectsResponse } from '../api';
import { PlayerLink, TIP_CURPOT } from '../playerModal';
import { SortableTh, Th } from '../Th';
import { RatingGrade } from '../RatingGrade';

export function Prospects({ orgId }: { orgId: number }) {
  const [data, setData] = useState<ProspectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    getProspects(orgId).then(setData).catch((e) => setError(e.message));
  }, [orgId]);

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p className="muted">Loading prospects…</p>;

  return (
    <div>
      <p className="muted hint-line">
        Minor leaguers ranked by promotion signal: production vs level average, age vs level average, and
        current-vs-potential ratings. Sample minimums: 60 PA / 15 IP this season.{' '}
        <strong>Demote</strong> marks a man clearly below his level who is not young for it — it asks a
        bigger gap and a longer look than promote does, because sending somebody down is the easier call
        to get wrong, and it is never shown for the lowest club in the organisation.{' '}
        Select a column heading to sort either table.
      </p>
      <p className="muted hint-line">
        <strong>The move</strong> is the other half of a call-up: who comes off the big club to make
        room, and whether the swap is an improvement. It compares OOTP's Overall grade rather than the
        season lines, because a .900 OPS in Double-A and a .900 OPS in the majors are not the same
        achievement — the grade is scouted current ability and means the same thing at every level. A
        man graded below everyone at his listed position is marked <strong>blocked</strong> instead of
        promote: he has earned it where he is, but the club is better as it stands. The comparison runs
        on his listed position only, so a shortstop blocked by a shortstop may still have a home at
        second or third.
      </p>
      <h2>Batters</h2>
      <ProspectTable prospects={data.batters} kind="batter" />
      <h2>Pitchers</h2>
      <ProspectTable prospects={data.pitchers} kind="pitcher" />
    </div>
  );
}

const SIGNAL_ORDER = { promote: 0, blocked: 1, watch: 2, demote: 3 };
const PITCHING_ROLES: Record<number, string> = { 11: 'SP', 12: 'RP', 13: 'CL' };
const textOrder = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const position = (p: Prospect) => PITCHING_ROLES[p.role ?? 0] ?? p.positionName;
const sortFields = {
  signal: (p: Prospect) => p.signal ? SIGNAL_ORDER[p.signal] : null,
  name: (p: Prospect) => `${p.lastName ?? p.name} ${p.name}`,
  age: (p: Prospect) => p.age,
  position,
  team: (p: Prospect) => p.team,
  pa: (p: Prospect) => p.pa,
  ops: (p: Prospect) => p.opsVal,
  hr: (p: Prospect) => p.hr,
  sb: (p: Prospect) => p.sb,
  ip: (p: Prospect) => p.ip,
  era: (p: Prospect) => p.era,
  kpct: (p: Prospect) => p.kpct,
  war: (p: Prospect) => p.war,
  cur: (p: Prospect) => p.cur,
  pot: (p: Prospect) => p.pot,
};
type ProspectSort = keyof typeof sortFields;
type Direction = 1 | -1;

function ProspectTable({ prospects, kind }: { prospects: Prospect[]; kind: 'batter' | 'pitcher' }) {
  const [sort, setSort] = useState<{ key: ProspectSort; dir: Direction } | null>(null);
  const header = (key: ProspectSort, label: string, initial: Direction = 1, tip?: string) => (
    <SortableTh active={sort?.key === key} dir={sort?.dir ?? initial} tip={tip}
      onSort={() => setSort((prior) => ({ key, dir: prior?.key === key ? (prior.dir === 1 ? -1 : 1) : initial }))}>
      {label}
    </SortableTh>
  );
  const rows = sort ? [...prospects].sort((a, b) => {
    const field = sortFields[sort.key];
    const x = field(a);
    const y = field(b);
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : textOrder.compare(String(x), String(y));
    return sort.dir * order;
  }) : prospects;
  if (prospects.length === 0) {
    return <p className="muted">No qualified {kind}s yet — small samples this early in the season.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          {header('signal', 'Signal')}
          {header('name', 'Player')}
          {header('age', 'Age')}
          {header('position', 'Pos')}
          {header('team', 'Team')}
          {kind === 'batter' ? (
            <>
              {header('pa', 'PA', -1)}
              {header('ops', 'OPS', -1)}
              {header('hr', 'HR', -1)}
              {header('sb', 'SB', -1)}
            </>
          ) : (
            <>
              {header('ip', 'IP', -1)}
              {header('era', 'ERA')}
              {header('kpct', 'K%', -1)}
            </>
          )}
          {header('war', 'WAR', -1)}
          {header('cur', 'Current', -1, TIP_CURPOT)}
          {header('pot', 'Potential', -1, TIP_CURPOT)}
          <Th>The move</Th>
          <Th>Why</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.player_id}>
            <td>{p.signal && <span className={`badge ${p.signal}`}>{p.signal}</span>}</td>
            <td className="name"><PlayerLink id={p.player_id}>{p.name}</PlayerLink></td>
            <td>{p.age}</td>
            <td>{position(p)}</td>
            <td>
              <span className="level-tag">{p.levelName}</span> {p.team}
            </td>
            {kind === 'batter' ? (
              <>
                <td className="num">{p.pa}</td>
                <td className="num">{p.opsVal?.toFixed(3)}</td>
                <td className="num">{p.hr}</td>
                <td className="num">{p.sb}</td>
              </>
            ) : (
              <>
                <td className="num">{p.ip}</td>
                <td className="num">{p.era?.toFixed(2)}</td>
                <td className="num">{p.kpct?.toFixed(1)}</td>
              </>
            )}
            <td className="num">{p.war?.toFixed(1)}</td>
            <td className="num"><RatingGrade value={p.cur} /></td>
            <td className="num"><RatingGrade value={p.pot} /></td>
            <td className="reasons">
              {p.signal === 'promote' || p.signal === 'blocked' ? p.move?.note ?? '—' : ''}
            </td>
            <td className="reasons">{p.reasons.join('; ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
