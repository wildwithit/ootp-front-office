export const READABILITY_OPTIONS = {
  bodyFont: ['system', 'serif'],
  bodySize: [14, 16, 18],
  tableSize: [0, 14, 16, 18],
  reportStyle: ['classic', 'reading'],
  density: ['compact', 'comfortable'],
} as const;

export type Readability = { [K in keyof typeof READABILITY_OPTIONS]: typeof READABILITY_OPTIONS[K][number] };

export const DEFAULT_READABILITY: Readability = {
  bodyFont: 'system', bodySize: 14, tableSize: 0, reportStyle: 'classic', density: 'compact',
};

export function mergeReadability(current: Readability, incoming: unknown): Readability {
  if (!incoming || typeof incoming !== 'object') return current;
  const patch = incoming as Partial<Readability>;
  return {
    bodyFont: READABILITY_OPTIONS.bodyFont.includes(patch.bodyFont!) ? patch.bodyFont! : current.bodyFont,
    bodySize: READABILITY_OPTIONS.bodySize.includes(patch.bodySize!) ? patch.bodySize! : current.bodySize,
    tableSize: READABILITY_OPTIONS.tableSize.includes(patch.tableSize!) ? patch.tableSize! : current.tableSize,
    reportStyle: READABILITY_OPTIONS.reportStyle.includes(patch.reportStyle!) ? patch.reportStyle! : current.reportStyle,
    density: READABILITY_OPTIONS.density.includes(patch.density!) ? patch.density! : current.density,
  };
}
