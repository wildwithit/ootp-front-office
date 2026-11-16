import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPut } from '../api';
import {
  GUIDANCE_LIMIT, PROTECTED_LIMIT, type PhilosophyEditorData, type ProtectedPlayer,
} from '../../shared/gmPhilosophy';

export function GMPhilosophy({ orgId, orgName, saveKey }: { orgId: number; orgName: string; saveKey: string }) {
  const endpoint = `/api/gm-philosophy/${orgId}`;
  const [editor, setEditor] = useState<PhilosophyEditorData | null>(null);
  const [guidance, setGuidance] = useState('');
  const [payroll, setPayroll] = useState('');
  const [protectedPlayers, setProtectedPlayers] = useState<ProtectedPlayer[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProtectedPlayer[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet<PhilosophyEditorData>(endpoint).then((data) => {
      if (!active || data.saveKey !== saveKey) return;
      setEditor(data);
      setGuidance(data.philosophy.guidance);
      setPayroll(data.philosophy.payrollGuideline?.toString() ?? '');
      setProtectedPlayers(data.philosophy.protectedPlayers);
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [endpoint, saveKey]);

  useEffect(() => {
    setResults([]);
    if (query.trim().length < 2) return;
    let active = true;
    setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ saveKey, q: query });
      apiGet<ProtectedPlayer[]>(`${endpoint}/players?${params}`)
        .then((players) => { if (active) setResults(players); })
        .catch((err: Error) => { if (active) setError(err.message); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [endpoint, query, saveKey]);

  const loadTemplate = () => {
    const template = editor?.rangersTemplate;
    if (!template) return;
    setGuidance(template.guidance);
    setPayroll(template.payrollGuideline?.toString() ?? '');
    setProtectedPlayers(template.protectedPlayers);
    setNotice(template.unresolved.length > 0
      ? `Check player identity before protecting ${template.unresolved.join(' and ')}. Search the organization to select a matching player.`
      : 'Rangers template loaded into the editor. Save to apply it.');
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const amount = payroll.trim() ? Number(payroll.trim().replaceAll(',', '')) : null;
    if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) {
      setError('Enter the annual guideline in whole dollars, or leave it blank.');
      return;
    }
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const data = await apiPut<PhilosophyEditorData>(endpoint, {
        saveKey: editor.saveKey, revision: editor.revision, guidance, payrollGuideline: amount,
        protectedIds: protectedPlayers.map((p) => p.id),
      });
      setEditor(data);
      setGuidance(data.philosophy.guidance);
      setPayroll(data.philosophy.payrollGuideline?.toString() ?? '');
      setNotice('GM philosophy saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-block">
      <h2>GM Philosophy</h2>
      <p className="muted">{orgName} · selected save</p>
      {!editor && !error && <p>Loading philosophy…</p>}
      {error && <p className="bad" role="alert">{error}</p>}
      {editor && (
        <form onSubmit={(event) => void save(event)}>
          <fieldset className="philosophy-fields" disabled={busy}>
            <label htmlFor="gm-guidance"><strong>Organizational guidance</strong></label>
            <textarea id="gm-guidance" rows={9} maxLength={GUIDANCE_LIMIT} value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder="Competitive objectives, hitting, defense, pitching, development, draft, international acquisition, trades, contracts, finances, and exceptions." />
            <small className="muted">{guidance.length.toLocaleString()} / {GUIDANCE_LIMIT.toLocaleString()} characters</small>
            <label htmlFor="gm-payroll"><strong>Annual player-payroll guideline</strong></label>
            <input id="gm-payroll" type="text" inputMode="numeric" value={payroll}
              placeholder="Dollars" onChange={(event) => setPayroll(event.target.value)} />
            <small className="muted">An advisory target separate from the OOTP owner budget.</small>
            <label htmlFor="gm-protected"><strong>Protected players</strong></label>
            {protectedPlayers.length > 0 && <ul className="philosophy-players">{protectedPlayers.map((player) => (
              <li key={player.id}>{player.name} <button type="button" aria-label={`Remove protection for ${player.name}`}
                onClick={() => setProtectedPlayers((current) => current.filter((p) => p.id !== player.id))}>Remove</button></li>
            ))}</ul>}
            <input id="gm-protected" type="search" value={query} placeholder="Search current organization"
              onChange={(event) => setQuery(event.target.value)} />
            {results.length > 0 && <ul className="philosophy-players">{results.map((player) => (
              <li key={player.id}>
                <button type="button" disabled={protectedPlayers.length >= PROTECTED_LIMIT || protectedPlayers.some((p) => p.id === player.id)}
                  onClick={() => { setProtectedPlayers((current) => [...current, player]); setQuery(''); }}>
                  Protect {player.name} · #{player.id}
                </button>
              </li>
            ))}</ul>}
            <div className="settings-actions">
              <button type="submit" className="cta">{busy ? 'Saving…' : 'Save philosophy'}</button>
              {editor.rangersTemplate && <button type="button" onClick={loadTemplate}>Load Rangers template</button>}
            </div>
          </fieldset>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
