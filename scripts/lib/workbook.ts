// Excel editing view of the canonical CSV tables (data/*.csv).
import ExcelJS from 'exceljs';
import { TABLES, coerce, type Tables } from './tables.ts';

export const WORKBOOK = new URL('../../data/atlas.xlsx', import.meta.url).pathname;

export async function writeWorkbook(t: Tables, path = WORKBOOK) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'video-game-atlas';
  // Fixed timestamps keep the file byte-stable when the data has not changed.
  wb.created = wb.modified = new Date('2026-01-01T00:00:00Z');
  const readme = wb.addWorksheet('README');
  readme.columns = [{ width: 12 }, { width: 16 }, { width: 110 }];
  readme.addRow(['Video Game Atlas data: editing view.']).font = { bold: true };
  readme.addRow(['The source of truth is data/games.csv, periods.csv and placements.csv. This workbook is generated from them.']);
  readme.addRow(['Edit here, then run `npm run data:import` to write your edits back to the CSV files (it validates them too).']);
  readme.addRow(['Keep sheet names and header rows. Rows join on game_id. Row numbers in error messages match the rows in this workbook.']);
  readme.addRow([]);
  readme.addRow(['Sheet', 'Column', 'Meaning']).font = { bold: true };
  for (const d of TABLES) for (const c of d.cols) readme.addRow([d.name, c.key, c.help + (c.list ? ` Allowed: ${c.list.join(', ')}.` : '')]);

  for (const d of TABLES) {
    const ws = wb.addWorksheet(d.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = d.cols.map((c) => ({ header: c.key, key: c.key, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
    for (const r of t[d.key]) ws.addRow(r);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: d.cols.length } };
    d.cols.forEach((c, i) => {
      ws.getCell(1, i + 1).note = c.help;
      if (!c.list) return;
      const col = ws.getColumn(i + 1).letter;
      (ws as unknown as { dataValidations: { add(ref: string, v: object): void } }).dataValidations.add(`${col}2:${col}10000`, {
        type: 'list', allowBlank: true, formulae: [`"${c.list.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Not allowed', error: `Use one of: ${c.list.join(', ')}`,
      });
    });
  }
  await wb.xlsx.writeFile(path);
}

const plain = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text;   // hyperlink
    if ('result' in v) return v.result;                            // formula
    if ('richText' in v) return v.richText.map((x) => x.text).join('');
  }
  return v ?? undefined;
};

export async function readWorkbook(path = WORKBOOK): Promise<Tables> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const t = {} as Record<keyof Tables, unknown[]>;
  for (const d of TABLES) {
    const ws = wb.getWorksheet(d.name);
    if (!ws) throw new Error(`atlas.xlsx: missing sheet "${d.name}"`);
    const header: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (header[i - 1] = String(plain(c.value) ?? '')));
    const missing = d.cols.filter((c) => !header.includes(c.key)).map((c) => c.key);
    if (missing.length) throw new Error(`atlas.xlsx: sheet "${d.name}" lacks columns ${missing.join(', ')}`);
    const rows: unknown[] = [];
    for (let n = 2; n <= ws.rowCount; n++) {
      const row = ws.getRow(n);
      const raw = Object.fromEntries(header.map((h, i) => [h, plain(row.getCell(i + 1).value)]));
      const obj = coerce(d, raw);
      if (Object.keys(obj).length) rows.push({ ...obj, _row: n });
    }
    t[d.key] = rows;
  }
  return t as unknown as Tables;
}
