import { useEffect, useRef } from 'react';
import { statsFor, type StatDef, type StatGroup } from './stats';

const SECTIONS: Array<StatDef['section']> = ['Counting', 'Rate', 'Advanced'];

export function ColumnPicker({
  group, selected, onChange, onClose, onReset, catalog, title,
}: {
  group: StatGroup;
  selected: string[];
  onChange: (keys: string[]) => void;
  onClose: () => void;
  onReset: () => void;
  catalog?: StatDef[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stats = catalog ?? statsFor(group);
  const sections: Array<StatDef['section']> = catalog ? [...SECTIONS, 'Contact'] : SECTIONS;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const boundary = ref.current?.parentElement ?? ref.current;
      if (!boundary?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggle = (key: string) => {
    // Preserve the catalog's order so columns don't jump around as you toggle
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : catalog ? [...selected, key] : stats.map((s) => s.key).filter((k) => k === key || selected.includes(k));
    onChange(next);
  };

  return (
    <div className="col-picker" ref={ref}>
      <div className="col-picker-head">
        <strong>{title ?? (group === 'batting' ? 'Batting columns' : 'Pitching columns')}</strong>
        <button type="button" className="chip-x" aria-label="Close stat picker" onClick={onClose}>✕</button>
      </div>
      <div className="col-picker-body">
        {sections.filter((section) => stats.some((s) => s.section === section)).map((section) => (
          <div key={section} className="col-section">
            <span className="col-section-label">{section}</span>
            {stats
              .filter((s) => s.section === section)
              .map((s) => (
                <label key={s.key} className="col-option" title={s.desc}>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.key)}
                    onChange={() => toggle(s.key)}
                  />
                  <span className="col-option-label">{s.label}</span>
                  <span className="col-option-desc">{s.desc}</span>
                </label>
              ))}
          </div>
        ))}
      </div>
      <div className="col-picker-foot">
        <span className="muted">{selected.length} shown</span>
        <button onClick={onReset}>Reset to defaults</button>
      </div>
    </div>
  );
}
