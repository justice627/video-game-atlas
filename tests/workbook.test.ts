import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { readWorkbook, writeWorkbook } from '../scripts/lib/workbook.ts';

const strip = (t: Tables) => JSON.parse(JSON.stringify(t, (k, v) => (k === '_row' ? undefined : v)));

describe('atlas.xlsx', () => {
  it('round-trips the tables without loss', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'atlas-')), 'rt.xlsx');
    const t = readTables();
    await writeWorkbook(t, path);
    expect(strip(await readWorkbook(path))).toEqual(strip(t));
  });
  it('is in sync with data/*.csv (run `npm run data:import` after editing the workbook)', async () => {
    expect(strip(await readWorkbook())).toEqual(strip(readTables()));
  });
});
