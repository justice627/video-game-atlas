// data/atlas.xlsx -> CSV tables, after validation. Usage: npm run data:import [path/to/file.xlsx]
import { readWorkbook, writeWorkbook, WORKBOOK } from './lib/workbook.ts';
import { writeTables, readTables, TABLES } from './lib/tables.ts';
import { validate } from './lib/dataset.ts';

const path = process.argv[2] ?? WORKBOOK;
const next = await readWorkbook(path);
const errs = validate(next);
if (errs.length) {
  console.error(`Not imported: ${errs.length} problem(s) in ${path}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
const prev = readTables();
writeTables(next);
for (const d of TABLES) console.log(`${d.name}: ${prev[d.key].length} -> ${next[d.key].length} rows`);
await writeWorkbook(next); // normalise the workbook so it stays byte-stable with the CSVs
console.log('Imported. Review the change with `git diff data/`.');
