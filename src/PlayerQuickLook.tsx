import { useState } from 'react';
import type { PlayerDossier } from './api';
import { ColumnPicker } from './ColumnPicker';
import { BATTING_STATS, CONTACT_STATS, PITCHING_STATS, formatStat, plusColor, type StatDef } from './stats';

type View = 'batting' | 'pitching' | 'contact';
const viewLabel: Record<View, string> = {
  batting: 'Batting', pitching: 'Pitching', contact: 'Contact Quality',
};

const contactLabels: Record<string, string> = {
  avgExitVelo: 'Avg exit velo', maxExitVelo: 'Hardest hit', hardHitPct: 'Hard-hit%',
  barrelPct: 'Barrel%', sweetSpotPct: 'Sweet spot%', sprintSpeed: 'Sprint speed',
};
const contactStats: StatDef[] = CONTACT_STATS.map((stat) => ({
  ...stat, label: contactLabels[stat.key] ?? stat.label,
  format: stat.key.endsWith('Pct') ? 'pct' : stat.format,
}));

const catalogs: Record<View, StatDef[]> = {
  batting: [...BATTING_STATS, ...contactStats],
  pitching: PITCHING_STATS,
  contact: contactStats,
};
const defaults: Record<View, string[]> = {
  batting: ['wrcPlus', 'war', 'barrelPct', 'kPct', 'bbPct', 'ops'],
  pitching: ['era', 'fip', 'war', 'kPct', 'bbPct', 'whip'],
  contact: Object.keys(contactLabels),
};

const percentage = (value: number | null | undefined) => value != null ? `${value.toFixed(1)}%` : '—';
const keyFor = (view: View) => `ootp-fo:quick-look:${view}`;

function load(view: View): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(keyFor(view)) ?? 'null');
    if (!Array.isArray(saved)) return defaults[view];
    const available = new Set(catalogs[view].map((s) => s.key));
    return [...new Set(saved.filter((key) => typeof key === 'string' && available.has(key)))];
  } catch {
    return defaults[view];
  }
}

function display(stat: StatDef, value: number | null | undefined, line?: Record<string, number | null>): string {
  const formatted = formatStat(stat, value, line);
  if (!formatted) return '—';
  return stat.key === 'avgExitVelo' || stat.key === 'maxExitVelo' ? `${formatted} mph` : formatted;
}

export function PlayerQuickLook({ player }: { player: PlayerDossier }) {
  const contact = player.contact;
  const hasContact = (contact?.battedBalls ?? 0) > 0;
  const mainView = player.isPitcher ? 'pitching' : 'batting';
  const views: View[] = [mainView];
  if (mainView === 'pitching' && player.quickLook?.batting) views.push('batting');
  if (mainView === 'batting' && player.quickLook?.pitching) views.push('pitching');
  if (hasContact) views.push('contact');

  const [view, setView] = useState<View>(mainView);
  const [selected, setSelected] = useState(() => load(mainView));
  const [pickerOpen, setPickerOpen] = useState(false);
  const update = (keys: string[]) => {
    setSelected(keys);
    try { localStorage.setItem(keyFor(view), JSON.stringify(keys)); } catch { /* stays selected in this card */ }
  };

  const line = view === 'contact' ? null : player.quickLook?.[view];
  const stats = line?.stats;
  const tiles = selected.flatMap((key) => catalogs[view].filter((s) => s.key === key));
  const tracked = hasContact && (view === 'contact' || tiles.some((s) => s.section === 'Contact'));
  const league: Record<string, number> | null = player.contactLeague;
  const sample = line && (view === 'batting' ? `${stats?.pa ?? '—'} PA` : `${stats?.ip ?? '—'} IP`);

  return (
    <section className="player-quick-look" aria-label="Player quick look">
      <div className="quick-look-heading">
        <h3>Quick Look</h3>
        <div className="quick-look-controls">
          {views.length > 1 && (
            <select aria-label="Quick Look view" value={view} onChange={(event) => {
              const next = event.target.value as View;
              setView(next);
              setSelected(load(next));
              setPickerOpen(false);
            }}>
              {views.map((option) => <option key={option} value={option}>{viewLabel[option]}</option>)}
            </select>
          )}
          <div className="col-picker-wrap">
            <button type="button" aria-expanded={pickerOpen} onClick={() => setPickerOpen((value) => !value)}>Choose stats</button>
            {pickerOpen && <ColumnPicker group={view === 'pitching' ? 'pitching' : 'batting'} catalog={catalogs[view]}
              title={`${viewLabel[view]} stats`} selected={selected} onChange={update}
              onClose={() => setPickerOpen(false)} onReset={() => update(defaults[view])} />}
          </div>
        </div>
      </div>
      <p className="quick-look-scope muted">
        {line ? [line.year, line.levelName, line.team, sample].filter((part) => part != null).join(' · ')
          : view === 'contact' ? 'Contact Quality' : 'No professional line this season'}
        {tracked && ` · ${contact!.battedBalls} tracked batted balls across levels`}
      </p>
      {tiles.length > 0 && <div className="contact-grid">
        {tiles.map((stat) => {
          const isContact = stat.section === 'Contact';
          const value = isContact ? contact?.[stat.key] : stats?.[stat.key];
          const ref = isContact && league?.[stat.key] != null ? display(stat, league[stat.key]) : null;
          return (
            <div className="contact-stat" key={stat.key} title={stat.desc}>
              <span className="contact-label">{stat.label}</span>
              <span className="contact-value" style={{ color: plusColor(stat, value) }}>{display(stat, value, stats)}</span>
              {ref !== null && <span className="contact-league">MLB avg {ref}</span>}
            </div>
          );
        })}
      </div>}
      {view === 'contact' && contact && (
        <p className="contact-line muted">
          Ground balls {percentage(contact.gbPct)}
          {' · '}Line drives {percentage(contact.ldPct)}
          {' · '}Fly balls {percentage(contact.fbPct)}
          {contact.slg != null && contact.xslg != null && ` · SLG ${contact.slg.toFixed(3)} vs. xSLG ${contact.xslg.toFixed(3)}`}
        </p>
      )}
    </section>
  );
}
