import {
  DEFAULT_READABILITY, READABILITY_OPTIONS, type Readability as Preferences,
} from '../shared/readability';

const LABELS: Record<keyof Preferences, string> = {
  bodyFont: 'Body font',
  bodySize: 'Body text size',
  tableSize: 'Statistical table text size',
  reportStyle: 'Report typography',
  density: 'Table density',
};

const VALUE_LABELS: Record<string, string> = {
  system: 'System sans serif', serif: 'Serif', '0': 'Default size',
  classic: 'Classic', reading: 'Larger, open lines',
  compact: 'Compact', comfortable: 'Comfortable',
};

export function Readability({ value, onChange }: { value?: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  const preferences = value ?? DEFAULT_READABILITY;
  return (
    <div className="readability-settings">
      {(Object.keys(LABELS) as Array<keyof Preferences>).map((key) => (
        <label className="settings-row" key={key}>
          <strong>{LABELS[key]}</strong>
          <select value={preferences[key]} onChange={(event) => {
            const chosen = READABILITY_OPTIONS[key].find((option) => String(option) === event.target.value);
            if (chosen !== undefined) onChange({ [key]: chosen });
          }}>
            {READABILITY_OPTIONS[key].map((option) => (
              <option key={option} value={option}>
                {VALUE_LABELS[option] ?? `${option} px`}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function applyReadability(root: HTMLElement, value = DEFAULT_READABILITY): void {
  root.dataset.bodyFont = value.bodyFont;
  root.dataset.reportStyle = value.reportStyle;
  root.dataset.density = value.density;
  root.style.setProperty('--body-size', `${value.bodySize}px`);
  if (value.tableSize > 0) {
    root.dataset.tableSize = 'custom';
    root.style.setProperty('--table-text-size', `${value.tableSize}px`);
  } else {
    delete root.dataset.tableSize;
    root.style.removeProperty('--table-text-size');
  }
}
