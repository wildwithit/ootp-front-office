import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../server/config.js';
import { db } from '../server/db.js';
import { importState } from '../server/api.js';

const csvValue = (value: unknown) => value == null ? '' : '"' + String(value).replace(/"/g, '""') + '"';

export function makeCopiedExport(prefix: string, tables: string[]): string {
  const dir = fs.mkdtempSync(path.join(DATA_DIR, prefix));
  for (const table of tables) {
    const query = db.prepare(`SELECT * FROM "${table}"`);
    const fields = query.columns().map((c) => c.name);
    const lines = [fields.map(csvValue).join(',')];
    for (const row of query.all() as Record<string, unknown>[]) {
      lines.push(fields.map((f) => csvValue(row[f])).join(','));
    }
    fs.writeFileSync(path.join(dir, table + '.csv'), lines.join('\n') + '\n');
  }
  return dir;
}

export async function waitForImport(): Promise<void> {
  while (importState.importing) await new Promise((resolve) => setTimeout(resolve, 10));
  if (importState.lastError) throw new Error(importState.lastError);
}
